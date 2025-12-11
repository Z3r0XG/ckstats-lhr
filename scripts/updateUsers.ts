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

// Store db reference at module level to pass between functions
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
    const userRepository = globalDb.getRepository(User);
    await userRepository.update({ address }, { isActive: false });
    console.log(`Marked user ${address} as inactive`);
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

    const userFiles = fs
      .readdirSync(usersDir)
      .filter((f) => {
        // Only process files (not directories)
        // Skip hidden files
        if (f.startsWith('.')) {
          return false;
        }
        const fullPath = path.join(usersDir, f);
        try {
          return fs.statSync(fullPath).isFile();
        } catch {
          return false;
        }
      });

    console.log(`Found ${userFiles.length} user files`);

    // Aggregate stats by userAgent (device type)
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

    for (const userFile of userFiles) {
      const userFilePath = path.join(usersDir, userFile);

      if (!fs.existsSync(userFilePath)) {
        continue;
      }

      try {
        const userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8')) as UserData;

        // Process each worker for online devices aggregation
        // Only count workers that have submitted shares in the last 60 minutes
        const threshold = Math.floor(Date.now() / 1000) - (60 * 60);
        
        for (const workerData of userData.worker || []) {
          // Skip workers that haven't shared recently
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
      } catch (error) {
        console.error(`Error parsing user file at ${userFilePath}:`, error);
      }
    }

    console.log(`Found ${deviceStats.size} unique device types`);

    // Note: registered users are already updated in the main loop above.
    // We just need to update online_devices table with all devices (sorted by hashrate)
    await globalDb.transaction(async (manager: any) => {
      // Clear all stale entries for this window
      await manager.query(
        `DELETE FROM "online_devices" WHERE window_minutes = 60;`
      );

      const sortedDevices = Array.from(deviceStats.values()).sort(
        (a, b) => b.totalHashrate1hr - a.totalHashrate1hr
      );

      let rank = 1;
      for (const device of sortedDevices) {
        await manager.query(
          `INSERT INTO "online_devices" (client, active_workers, total_hashrate1hr, best_active, window_minutes, rank, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, now());`,
          [device.userAgent, device.activeWorkers, device.totalHashrate1hr, device.bestEver, 60, rank]
        );
        rank += 1;
      }
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
                // Mark user as inactive if update fails
                await userRepository.update({ address: user.address }, { isActive: false });
                console.log(`Marked user ${user.address} as inactive`);
              }
            })
          );
        }
      }

      // Update online devices stats from all user files
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
