import 'dotenv/config';
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

import { getDb } from '../lib/db';
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
let globalDb: any = null;

interface WorkerData {
  workername: string;
  useragent?: string;
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastshare: number;
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

const safeConvertFloat = (v: any) => {
  try {
    if (v === null || v === undefined || v === '') return 0;
    return convertHashrateFloat(v.toString());
  } catch (err) {
    console.error('convertHashrateFloat failed for value:', v, err);
    return 0;
  }
};

async function updateUser(address: string): Promise<void> {
  let userData: UserData;
  if (/[^a-zA-Z0-9]/.test(address)) {
    throw new Error('updateUser(): address contains invalid characters');
  }

  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + `/users/${address}`;

  console.log('Attempting to update user stats for:', address);

  try {
    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      userData = (await response.json()) as UserData;
    } catch (error: any) {
      if (error.cause?.code == 'ERR_INVALID_URL') {
        userData = JSON.parse(fs.readFileSync(apiUrl, 'utf-8')) as UserData;
      } else throw error;
    }

    await globalDb.transaction(async (manager) => {
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
      const userStats = userStatsRepository.create({
        userAddress: address,
        hashrate1m: safeConvertFloat(userData.hashrate1m),
        hashrate5m: safeConvertFloat(userData.hashrate5m),
        hashrate1hr: safeConvertFloat(userData.hashrate1hr),
        hashrate1d: safeConvertFloat(userData.hashrate1d),
        hashrate7d: safeConvertFloat(userData.hashrate7d),
        lastShare: bigIntStringFromFloatLike(userData.lastshare),
        workerCount: userData.workers,
        shares: bigIntStringFromFloatLike(userData.shares),
        bestShare: safeParseFloat(userData.bestshare, 0),
        bestEver: safeParseFloat(userData.bestever, 0),
      });
      await userStatsRepository.save(userStats);

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
          shares: bigIntStringFromFloatLike(workerData.shares),
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
          shares: workerValues.shares,
          bestShare: workerValues.bestShare,
          bestEver: workerValues.bestEver,
        });
        await workerStatsRepository.save(workerStats);
      }
    });

    console.log(`Updated user and workers for: ${address}`);
  } catch (error) {
    console.error(`Failed to update user ${address}:`, error);
    throw error;
  }
}

async function updateOnlineDevicesFromAllUsers(): Promise<void> {
  const apiUrl = process.env.API_URL || 'https://solo.ckpool.org';
  const isLocalPath = !apiUrl.startsWith('http');

  if (!isLocalPath) {
    console.log('Online devices: API_URL is remote. Skipping local file scan.');
    return;
  }

  console.log('Scanning all user directories for online device stats...');

  try {
    const usersDir = path.join(apiUrl, 'users');

    if (!fs.existsSync(usersDir)) {
      console.log(`Users directory not found: ${usersDir}`);
      return;
    }

    const dir = await fs.promises.opendir(usersDir);
    let userFileCount = 0;
    const threshold = Math.floor(Date.now() / 1000) - 60 * 60;

    const deviceStats: Map<
      string,
      {
        userAgent: string;
        activeWorkers: number;
        totalHashrate1hr: number;
        bestEver: number;
        lastShare: number;
      }
    > = new Map();

    for await (const dirent of dir) {
      if (dirent.name.startsWith('.') || !dirent.isFile()) {
        continue;
      }

      const userFilePath = path.join(usersDir, dirent.name);

      try {
        const raw = await fs.promises.readFile(userFilePath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);

        const isUserData = (obj: unknown): obj is UserData => {
          if (!obj || typeof obj !== 'object') return false;
          const anyObj = obj as any;
          if (!Array.isArray(anyObj.worker)) return false;
          return anyObj.worker.every((w: any) => w && typeof w === 'object');
        };

        if (!isUserData(parsed)) {
          console.error(`Invalid user file (missing worker array): ${userFilePath}`);
          continue;
        }

        const userData = parsed; // typed as UserData now

        const workers = userData.worker.filter((w) => typeof w?.lastshare === 'number');

        if (workers.length === 0) {
          console.error(`User file has no valid workers: ${userFilePath}`);
          continue;
        }

        for (const workerData of workers) {
          if (workerData.lastshare < threshold) {
            continue;
          }

          const rawUa = (workerData.useragent ?? '').trim();
          const userAgent = normalizeUserAgent(rawUa);
          const hashrate1hr = safeConvertFloat(workerData.hashrate1hr);
          const bestEver = safeParseFloat(workerData.bestever, 0);
          const lastShare = workerData.lastshare;

          if (!deviceStats.has(userAgent)) {
            deviceStats.set(userAgent, {
              userAgent,
              activeWorkers: 0,
              totalHashrate1hr: 0,
              bestEver: 0,
              lastShare: 0,
            });
          }

          const stat = deviceStats.get(userAgent)!;
          stat.activeWorkers += 1;
          stat.totalHashrate1hr += hashrate1hr;
          stat.bestEver = Math.max(stat.bestEver, bestEver);
          stat.lastShare = Math.max(stat.lastShare, lastShare);
        }

        userFileCount += 1;
      } catch (error) {
        console.error(`Error parsing user file at ${userFilePath}:`, error);
      }
    }

    console.log(`Processed ${userFileCount} user files`);

    console.log(`Found ${deviceStats.size} unique device types`);

    await globalDb.transaction(async (manager: any) => {
      const updateTimestamp = new Date().toISOString();

      const sortedDevices = Array.from(deviceStats.values()).sort(
        (a, b) => b.totalHashrate1hr - a.totalHashrate1hr
      );

      if (sortedDevices.length === 0) {
        await manager.query(
          `DELETE FROM "online_devices" WHERE window_minutes = 60 AND computed_at < $1;`,
          [updateTimestamp]
        );
        return;
      }

      const valuesSql: string[] = [];
      const params: Array<string | number> = [];
      let paramIndex = 1;
      let rank = 1;

      for (const device of sortedDevices) {
        valuesSql.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`
        );

        params.push(
          device.userAgent,
          device.activeWorkers,
          device.totalHashrate1hr,
          device.bestEver,
          60,
          rank,
          updateTimestamp
        );

        paramIndex += 7;
        rank += 1;
      }

      await manager.query(
        `INSERT INTO "online_devices" (client, active_workers, total_hashrate1hr, best_active, window_minutes, rank, computed_at)
         VALUES ${valuesSql.join(', ')}
         ON CONFLICT (client, window_minutes) DO UPDATE SET
           active_workers = EXCLUDED.active_workers,
           total_hashrate1hr = EXCLUDED.total_hashrate1hr,
           best_active = EXCLUDED.best_active,
           rank = EXCLUDED.rank,
           computed_at = EXCLUDED.computed_at;`,
        params
      );

      await manager.query(
        `DELETE FROM "online_devices" WHERE window_minutes = 60 AND computed_at < $1;`,
        [updateTimestamp]
      );
    });

    console.log(`Online devices updated: ${deviceStats.size} device types`);
  } catch (error) {
    console.error('Error updating online devices:', error);
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    let db;
    try {
      db = await getDb();
      globalDb = db;
      const userRepository = db.getRepository(User);

      const users = await userRepository.find({
        where: { isActive: true },
        order: { address: 'ASC' },
      });

      if (users.length === 0) {
        console.log('No active users found');
      } else {
        console.log(`Updating ${users.length} active users...`);

        let processedCount = 0;
        let failedCount = 0;
        let markedInactiveCount = 0;

        for (let i = 0; i < users.length; i += BATCH_SIZE) {
          const batch = users.slice(i, i + BATCH_SIZE);
          console.log(
            `Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(users.length / BATCH_SIZE)}`
          );

          await Promise.all(
            batch.map(async (user) => {
              try {
                await updateUser(user.address);
                processedCount += 1;
              } catch (error) {
                console.error(`Failed to update user ${user.address}:`, error);
                await userRepository.update({ address: user.address }, { isActive: false });
                console.log(`Marked user ${user.address} as inactive`);
                failedCount += 1;
                markedInactiveCount += 1;
              }
            })
          );
        }

        console.log(
          `User update summary: processed=${processedCount}, failed=${failedCount}, marked_inactive=${markedInactiveCount}`
        );
      }

      await updateOnlineDevicesFromAllUsers();
    } catch (error) {
      console.error('Error in main loop:', error);
      throw error;
    } finally {
      if (globalDb) {
        try {
          await globalDb.destroy();
          console.log('Database connection closed');
        } catch (error) {
          console.error('Error closing database connection:', error);
        }
      }
    }
  })().catch(console.error);
}
