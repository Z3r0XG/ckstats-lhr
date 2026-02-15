import 'dotenv/config';
import 'reflect-metadata';
import { readJsonStable, delay } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';

export class FileNotFoundError extends Error {
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
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 500;

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Repair all users with NULL lastActivatedAt by setting it to their createdAt timestamp.
 * This ensures all users have a valid lastActivatedAt for grace period calculations.
 * Runs once at the start of each cron execution before processing any users.
 * Uses a single bulk UPDATE for performance.
 */
export async function repairNullLastActivatedAt(): Promise<void> {
  const db = await getDb();
  const userRepository = db.getRepository(User);
  
  // Single bulk UPDATE: SET lastActivatedAt = createdAt WHERE lastActivatedAt IS NULL
  const result = await userRepository
    .createQueryBuilder()
    .update(User)
    .set({ lastActivatedAt: () => '"createdAt"' })
    .where('lastActivatedAt IS NULL')
    .execute();
  
  if (result.affected && result.affected > 0) {
    console.log(`✓ Repaired ${result.affected} users with NULL lastActivatedAt`);
  }
}

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

export interface UserData {
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

export async function fetchUserDataWithRetry(address: string, apiUrl: string): Promise<UserData> {
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

/**
 * Pure function to determine if a user should be marked inactive based on grace period logic.
 * 
 * @param lastShareTimestamp - Unix timestamp in seconds of last share
 * @param lastActivatedAt - Date when user was last activated
 * @param createdAt - Date when user was created (fallback if lastActivatedAt is null)
 * @param now - Current timestamp in milliseconds
 * @returns Object with shouldMarkInactive flag and optional daysRemaining
 */
export function shouldMarkUserInactive(
  lastShareTimestamp: number,
  lastActivatedAt: Date | null,
  createdAt: Date,
  now: number
): { shouldMarkInactive: boolean; daysRemaining?: number } {
  const lastShareAge = now - (lastShareTimestamp * 1000);
  
  // If user hasn't mined in 7+ days, check grace period
  if (lastShareAge > SEVEN_DAYS_MS) {
    const activationDate = lastActivatedAt || createdAt;
    const lastActivatedAge = now - activationDate.getTime();
    
    if (lastActivatedAge > SEVEN_DAYS_MS) {
      // Both thresholds exceeded - mark inactive
      return { shouldMarkInactive: true };
    } else {
      // Within grace period
      const daysRemaining = Math.ceil((SEVEN_DAYS_MS - lastActivatedAge) / (24 * 60 * 60 * 1000));
      return { shouldMarkInactive: false, daysRemaining };
    }
  }
  
  // User is actively mining
  return { shouldMarkInactive: false };
}

/**
 * Calculate days remaining in grace period.
 * 
 * @param lastActivatedAt - Date when user was last activated
 * @param now - Current timestamp in milliseconds
 * @returns Number of days remaining, or 0 if grace period expired
 */
export function calculateGracePeriodRemaining(
  lastActivatedAt: Date,
  now: number
): number {
  const lastActivatedAge = now - lastActivatedAt.getTime();
  const remaining = SEVEN_DAYS_MS - lastActivatedAge;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
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

  const now = Date.now();
  
  // Track whether user should be marked inactive (used after transaction for cache invalidation)
  let userMarkedInactive = false;

  await db.transaction(async (manager) => {
    const userRepository = manager.getRepository(User);
    const user = await userRepository.findOne({ where: { address } });
    
    // Check for stale mining activity using extracted grace period logic
    if (user) {
      const decision = shouldMarkUserInactive(
        userData.lastshare,
        user.lastActivatedAt,
        user.createdAt,
        now
      );
      
      if (decision.shouldMarkInactive) {
        // Both thresholds exceeded - mark inactive and skip stats update
        user.isActive = false;
        await userRepository.save(user);
        userMarkedInactive = true;
        console.log(`Marked user ${address} as inactive (7-day grace period expired)`);
        return; // Skip stats update for inactive user
      } else if (decision.daysRemaining !== undefined) {
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
  if (userMarkedInactive) {
    cacheDelete(`userWithWorkers:${address}`);
    cacheDelete(`userHistorical:${address}`);
    cacheDeletePrefix('topUserHashrates');
    cacheDeletePrefix('topUserLoyalty');
    cacheDeletePrefix(`workerWithStats:${address}:`);
  }

  console.log(`Updated user and workers for: ${address}`);
}

async function main() {
  let db;

  try {
    // Repair any NULL lastActivatedAt values before processing
    await repairNullLastActivatedAt();
    
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
            // Mark inactive only if the file was not found
            if (error instanceof FileNotFoundError) {
              // File doesn't exist - check grace period before marking inactive
              try {
                const lastActivated = user.lastActivatedAt || user.createdAt;
                const daysRemaining = calculateGracePeriodRemaining(lastActivated, Date.now());
                
                if (daysRemaining > 0) {
                  // Within grace period - user has time to start mining
                  console.log(`User ${user.address} has no pool file but within grace period (${daysRemaining} days remaining)`);
                  return; // Skip inactive marking, exit this user's processing
                }
                
                // Grace period expired - mark inactive
                await userRepository.update({ address: user.address }, { isActive: false });
                console.log(`Marked user ${user.address} as inactive (no pool file, grace period expired)`);
                // Invalidate caches to prevent stale data
                cacheDelete(`userWithWorkers:${user.address}`);
                cacheDelete(`userHistorical:${user.address}`);
                cacheDeletePrefix('topUserHashrates');
                cacheDeletePrefix('topUserLoyalty');
                cacheDeletePrefix(`workerWithStats:${user.address}:`);
              } catch (markError) {
                console.error(`Could not mark user ${user.address} as inactive:`, markError);
              }
            } else {
              // Database error, transaction failure, etc. - log the actual error
              console.error(`Failed to update user ${user.address}:`, error);
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
