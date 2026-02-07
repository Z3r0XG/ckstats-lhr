import 'dotenv/config';
import 'reflect-metadata';
import { readJsonStable } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';

import { getDb } from '../lib/db';
import { cacheDelete } from '../lib/api';
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
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as UserData;
    } catch (error: any) {
      if (error.cause?.code === 'ERR_INVALID_URL') {
        // When API_URL is a filesystem path (local logs), enforce a safe root
        const basePath = process.env.API_URL || '';
        const resolved = validateAndResolveUserPath(address, basePath);
        return await readJsonStable(resolved, {
          retries: 6,
          backoffMs: 50,
        }) as UserData;
      }

      if (attempt === MAX_RETRIES) {
        console.error(`Failed to fetch data for ${address} after ${MAX_RETRIES} attempts`);
        throw error;
      }

      console.log(`Attempt ${attempt} failed for ${address}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error(`Failed to fetch user data for ${address}`);
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

  await db.transaction(async (manager) => {
    const userRepository = manager.getRepository(User);
    const user = await userRepository.findOne({ where: { address } });
    if (user) {
      user.authorised = userData.authorised.toString();
      user.isActive = true;
      await userRepository.save(user);
    } else {
      await userRepository.insert({
        address,
        authorised: userData.authorised.toString(),
        isActive: true,
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
            // Try to mark user as inactive, but don't let this secondary operation fail the batch
            try {
              await userRepository.update({ address: user.address }, { isActive: false });
              console.log(`Marked user ${user.address} as inactive`);
            } catch (markError) {
              console.error(`Could not mark user ${user.address} as inactive:`, markError);
              // Silently continue - user will remain active with stale data
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
