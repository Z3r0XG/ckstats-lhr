import 'dotenv/config';
import 'reflect-metadata';
import { readJsonStable, delay } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';

class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

import { getDb } from '../lib/db';
import { cacheDelete, cacheDeletePrefix } from '../lib/api';
import { User } from '../lib/entities/User';
import { UserStats } from '../lib/entities/UserStats';
import { Worker } from '../lib/entities/Worker';
import { WorkerStats } from '../lib/entities/WorkerStats';
import {
  convertHashrateFloat,
  normalizeUserAgent,
  parseWorkerName,
  bigIntStringFromFloatLike,
  safeParseFloat,
} from '../utils/helpers';

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

interface WorkerData {
  workername: string;
  useragent?: string;
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastshare: number;
  started?: number;
  shares: number | string;
  bestshare: string;
  bestever: string;
}

interface UserData {
  authorised: number;
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastshare: number;
  workers: number;
  shares: number | string;
  bestshare: string;
  bestever: string;
  worker: WorkerData[];
}

async function fetchUserDataWithRetry(address: string, apiUrl: string): Promise<UserData> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as UserData;
    } catch (error: any) {
      lastError = error;
      
      if (error.cause?.code === 'ERR_INVALID_URL') {
        // When API_URL is a filesystem path (local logs), enforce a safe root
        const basePath = process.env.API_URL || '';
        
        try {
          const resolved = validateAndResolveUserPath(address, basePath);
          return await readJsonStable(resolved, {
            retries: 6,
            backoffMs: 50,
          }) as UserData;
        } catch (fileError: any) {
          // readJsonStable handles temporary missing files; if it still fails, file is gone
          if (fileError.code === 'ENOENT') {
            throw new FileNotFoundError(`User file not found: ${address}`);
          }
          
          throw fileError; // Other file errors propagate immediately
        }
      }

      if (attempt === MAX_RETRIES) {
        console.error(`Failed to fetch data for ${address} after ${MAX_RETRIES} attempts`);
        throw lastError;
      }

      console.log(`Attempt ${attempt} failed for ${address}. Retrying...`);
      await delay(RETRY_DELAY_MS * attempt);
    }
  }

  // This should never be reached since attempt===MAX_RETRIES always throws
  throw new Error(`Unexpected: fetchUserDataWithRetry loop ended without throwing for ${address}`);
}

async function updateUser(address: string): Promise<void> {
  let userData: UserData;
  if (/[^a-zA-Z0-9]/.test(address)) {
    throw new Error('updateUser(): address contains invalid characters');
  }

  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + `/users/${address}`;

  console.log('Attempting to update user stats for:', address);
  const db = await getDb();

  userData = await fetchUserDataWithRetry(address, apiUrl);

  // Grace period constants
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const lastShareAge = now - (userData.lastshare * 1000); // lastshare is in seconds
  
  // Track whether user should be marked inactive (used after transaction for cache invalidation)
  let shouldMarkInactive = false;

  await db.transaction(async (manager) => {
    const userRepository = manager.getRepository(User);
    const user = await userRepository.findOne({ where: { address } });
    
    // Repair null lastActivatedAt BEFORE any grace period evaluation (use createdAt as fallback)
    // This ensures all users have lastActivatedAt set for future grace period checks
    if (user && !user.lastActivatedAt && user.createdAt) {
      user.lastActivatedAt = user.createdAt;
      console.log(`Repaired null lastActivatedAt for user ${address}`);
    }
    
    // Check for stale mining activity (7 days threshold for both lastshare and lastActivatedAt)
    if (lastShareAge > SEVEN_DAYS_MS && user && user.lastActivatedAt) {
      // User hasn't mined in 7+ days - check grace period
      const lastActivatedAge = now - user.lastActivatedAt.getTime();
      
      if (lastActivatedAge > SEVEN_DAYS_MS) {
        // Both thresholds exceeded - mark inactive and skip stats update
        user.isActive = false;
        await userRepository.save(user);
        shouldMarkInactive = true;
        console.log(`Marked user ${address} as inactive (7-day grace period expired)`);
        return; // Skip stats update for inactive user
      } else {
        console.log(`User ${address} hasn't mined in 7+ days but within grace period`);
      }
    }
    
    if (user) {
      user.authorised = userData.authorised.toString();
      user.isActive = true;
      await userRepository.save(user);
    } else {
      await userRepository.insert({
        address,
        authorised: userData.authorised.toString(),
        isActive: true,
        lastActivatedAt: new Date(),
        updatedAt: new Date().toISOString(),
      });
    }

    const userStatsRepository = manager.getRepository(UserStats);
    const safeConvertFloat = (v: any) => {
      try {
        if (v === null || v === undefined || v === '') return 0;
        return convertHashrateFloat(v.toString());
      } catch (err) {
        console.error('convertHashrateFloat failed for value:', v, err);
        return 0;
      }
    };

    const userStats = userStatsRepository.create({
      userAddress: address,
      hashrate1m: safeConvertFloat(userData.hashrate1m),
      hashrate5m: safeConvertFloat(userData.hashrate5m),
      hashrate1hr: safeConvertFloat(userData.hashrate1hr),
      hashrate1d: safeConvertFloat(userData.hashrate1d),
      hashrate7d: safeConvertFloat(userData.hashrate7d),
      lastShare: bigIntStringFromFloatLike(userData.lastshare),
      workerCount: userData.workers,
      shares: safeParseFloat(userData.shares, 0),
      bestShare: safeParseFloat(userData.bestshare, 0),
      bestEver: safeParseFloat(userData.bestever, 0),
    });
    await userStatsRepository.save(userStats);

    // Invalidate caches for this user
    cacheDelete(`userHistorical:${address}`);
    cacheDelete(`userWithWorkers:${address}`);

    const workerRepository = manager.getRepository(Worker);
    const workerStatsRepository = manager.getRepository(WorkerStats);

    for (const workerData of userData.worker) {
      const workerName = parseWorkerName(workerData.workername, address);

      const worker = await workerRepository.findOne({
        where: {
          userAddress: address,
          name: workerName,
        },
      });

      const rawUa = (workerData.useragent ?? '').trim();
      const token = normalizeUserAgent(rawUa);

      const workerValues = {
        userAgent: token,
        userAgentRaw: rawUa || null,
        hashrate1m: safeConvertFloat(workerData.hashrate1m),
        hashrate5m: safeConvertFloat(workerData.hashrate5m),
        hashrate1hr: safeConvertFloat(workerData.hashrate1hr),
        hashrate1d: safeConvertFloat(workerData.hashrate1d),
        hashrate7d: safeConvertFloat(workerData.hashrate7d),
        lastUpdate: new Date(workerData.lastshare * 1000),
        started: workerData.started ? workerData.started.toString() : '0',
        shares: safeParseFloat(workerData.shares, 0),
        bestShare: safeParseFloat(workerData.bestshare, 0),
        bestEver: safeParseFloat(workerData.bestever, 0),
      };

      let workerId: number;
      if (worker) {
        Object.assign(worker, workerValues);
        const savedWorker = await workerRepository.save(worker);
        workerId = savedWorker.id;
      } else {
        const newWorker = await workerRepository.save({
          userAddress: address,
          name: workerName,
          updatedAt: new Date().toISOString(),
          ...workerValues,
        });
        workerId = newWorker.id;
      }

      const workerStats = workerStatsRepository.create({
        workerId,
        hashrate1m: workerValues.hashrate1m,
        hashrate5m: workerValues.hashrate5m,
        hashrate1hr: workerValues.hashrate1hr,
        hashrate1d: workerValues.hashrate1d,
        hashrate7d: workerValues.hashrate7d,
        started: workerValues.started,
        shares: workerValues.shares,
        bestShare: workerValues.bestShare,
        bestEver: workerValues.bestEver,
      });
      await workerStatsRepository.save(workerStats);

      // Invalidate cache for this worker
      cacheDelete(`workerWithStats:${address}:${workerName}`);
    }
  });

  // Invalidate caches after transaction commits (for inactive users)
  if (shouldMarkInactive) {
    cacheDelete(`userWithWorkers:${address}`);
    cacheDelete(`userHistorical:${address}`);
    cacheDeletePrefix('topUserHashrates');
    cacheDeletePrefix('topUserLoyalty');
  }

  console.log(`Updated user and workers for: ${address}`);
}

async function main() {
  let db;

  try {
    db = await getDb();
    const userRepository = db.getRepository(User);

    const users = await userRepository.find({
      where: { isActive: true },
      order: { address: 'ASC' },
    });

    if (users.length === 0) {
      console.log('No active users found');
    }

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(users.length / BATCH_SIZE)}`
      );

      await Promise.all(
        batch.map(async (user) => {
          try {
            await updateUser(user.address);
          } catch (error) {
            console.error(`Failed to update user ${user.address}:`, error);
            
            // Mark inactive only if the file was not found
            if (error instanceof FileNotFoundError) {
              // File doesn't exist - check grace period before marking inactive
              try {
                const userRecord = await userRepository.findOne({ where: { address: user.address } });
                
                if (userRecord?.lastActivatedAt) {
                  const activatedAge = Date.now() - userRecord.lastActivatedAt.getTime();
                  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                  
                  if (activatedAge <= SEVEN_DAYS_MS) {
                    // Within grace period - user has time to start mining
                    const daysRemaining = Math.ceil((SEVEN_DAYS_MS - activatedAge) / (24 * 60 * 60 * 1000));
                    console.log(`User ${user.address} has no pool file but within grace period (${daysRemaining} days remaining)`);
                    return; // Skip inactive marking, exit this user's processing
                  }
                }
                
                // No lastActivatedAt or grace period expired - mark inactive
                await userRepository.update({ address: user.address }, { isActive: false });
                console.log(`Marked user ${user.address} as inactive (no pool file, grace period expired)`);
                // Invalidate caches to prevent stale data
                cacheDelete(`userWithWorkers:${user.address}`);
                cacheDelete(`userHistorical:${user.address}`);
                cacheDeletePrefix('topUserHashrates');
                cacheDeletePrefix('topUserLoyalty');
              } catch (markError) {
                console.error(`Could not mark user ${user.address} as inactive:`, markError);
              }
            } else {
              // Database error, transaction failure, etc. - just log
              console.error(`Non-file error for ${user.address}, skipping inactive marking`);
            }
          }
        })
      );
    }
  } catch (error) {
    console.error('Error in main loop:', error);
    throw error;
  } finally {
    if (db) {
      try {
        await db.destroy();
        console.log('Database connection closed');
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
