// eslint-disable-next-line import/no-unresolved
import 'dotenv/config';
import * as fs from 'fs';

import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { convertHashrateFloat, safeParseFloat } from '../utils/helpers';

const DRY_RUN = Boolean(process.env.SEED_DRY_RUN || process.env.DRY_RUN);

interface PoolStatsData {
  runtime: string;
  Users: string;
  Workers: string;
  Idle: string;
  Disconnected: string;
  UserAgents?: Array<{
    ua: string;
    devices: number;
    hashrate5m: string;
    bestshare?: number;
  }>;
  hashrate1m: string;
  hashrate5m: string;
  hashrate15m: string;
  hashrate1hr: string;
  hashrate6hr: string;
  hashrate1d: string;
  hashrate7d: string;
  diff: string;
  accepted: string;
  rejected: string;
  bestshare: string;
  SPS1m: string;
  SPS5m: string;
  SPS15m: string;
  SPS1h: string;
}

async function fetchPoolStats(): Promise<Partial<PoolStatsData>> {
  let data: string;
  console.log('Fetching pool stats...');
  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + '/pool/pool.status';

  try {
    const response = await fetch(apiUrl);
    data = await response.text();
  } catch (error: any) {
    if (error.cause?.code == 'ERR_INVALID_URL') {
      data = fs.readFileSync(apiUrl, 'utf-8');
    } else throw error;
  }

  const jsonLines = data.split('\n').filter(Boolean);
  const parsedData = jsonLines.reduce(
    (acc, line) => ({ ...acc, ...JSON.parse(line) }),
    {}
  );
  return parsedData as PoolStatsData;
}

async function updateOnlineDevices(
  db: any,
  userAgents?: Array<{ ua: string; devices: number; hashrate5m: string; bestshare?: number }>
): Promise<void> {
  if (!userAgents || userAgents.length === 0) {
    console.log('No UserAgents data available for online_devices update');
    return;
  }

  console.log(`Updating online_devices with ${userAgents.length} device types...`);

  const sorted = [...userAgents].sort((a, b) => {
    const hashA = convertHashrateFloat((a.hashrate5m ?? '0').trim());
    const hashB = convertHashrateFloat((b.hashrate5m ?? '0').trim());
    return hashB - hashA;
  });

  const updateTimestamp = new Date().toISOString();
  const valuesSql: string[] = [];
  const params: Array<string | number> = [];
  let paramIndex = 1;

  for (let i = 0; i < sorted.length; i++) {
    const device = sorted[i];
    const hashrate5mStr = (device.hashrate5m ?? '0').trim();
    const hashrate5mNum = convertHashrateFloat(hashrate5mStr);
    const bestshareNum = Number(device.bestshare ?? 0);

    valuesSql.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
    );

    params.push(
      device.ua,
      device.devices,
      hashrate5mNum,
      updateTimestamp,
      bestshareNum
    );

    paramIndex += 5;
  }

  try {
    await db.transaction(async (manager: any) => {
      await manager.query(
        `INSERT INTO "online_devices" (client, active_workers, total_hashrate, computed_at, bestshare)
         VALUES ${valuesSql.join(', ')}
         ON CONFLICT (client) DO UPDATE SET
           active_workers = EXCLUDED.active_workers,
           total_hashrate = EXCLUDED.total_hashrate,
           computed_at = EXCLUDED.computed_at,
           bestshare = EXCLUDED.bestshare;`,
        params
      );

      await manager.query(
        `DELETE FROM "online_devices" WHERE computed_at < $1;`,
        [updateTimestamp]
      );
    });

    console.log(`Online devices updated: ${userAgents.length} device types`);
  } catch (error) {
    console.error('Error updating online devices:', error);
    throw error;
  }
}

async function clearOnlineDevices(db: any): Promise<void> {
  try {
    await db.query(`DELETE FROM "online_devices";`);
    console.log('Cleared online_devices table (no active users reported)');
  } catch (error) {
    console.error('Error clearing online devices:', error);
    throw error;
  }
}

async function seed() {
  let db: any | null = null;
  try {
    console.log('Fetching pool stats...');
    const stats = await fetchPoolStats();

    const poolStats = {
      runtime: parseInt(stats.runtime ?? '0'),
      users: parseInt(stats.Users ?? '0'),
      workers: parseInt(stats.Workers ?? '0'),
      idle: parseInt(stats.Idle ?? '0'),
      disconnected: stats.Disconnected ? parseInt(stats.Disconnected) : 0,
      hashrate1m: convertHashrateFloat(stats.hashrate1m ?? ''),
      hashrate5m: convertHashrateFloat(stats.hashrate5m ?? ''),
      hashrate15m: convertHashrateFloat(stats.hashrate15m ?? ''),
      hashrate1hr: convertHashrateFloat(stats.hashrate1hr ?? ''),
      hashrate6hr: convertHashrateFloat(stats.hashrate6hr ?? ''),
      hashrate1d: convertHashrateFloat(stats.hashrate1d ?? ''),
      hashrate7d: convertHashrateFloat(stats.hashrate7d ?? ''),
      diff: stats.diff,
      accepted: stats.accepted,
      rejected: stats.rejected,
      bestshare: safeParseFloat(stats.bestshare ?? '', 0),
      SPS1m: stats.SPS1m,
      SPS5m: stats.SPS5m,
      SPS15m: stats.SPS15m,
      SPS1h: stats.SPS1h,
      timestamp: new Date(),
    } as unknown as Partial<PoolStats>;

    if (DRY_RUN) {
      console.log(
        'DRY_RUN enabled — would save the following PoolStats object:'
      );
      const printable = Object.fromEntries(
        Object.entries(poolStats).map(([k, v]) => [
          k,
          typeof v === 'bigint' ? v.toString() : v,
        ])
      );
      console.log(JSON.stringify(printable, null, 2));
      return;
    }

    console.log('Saving pool stats to database...');
    db = await getDb();
    const poolStatsRepository = db.getRepository(PoolStats);
    const entity = poolStatsRepository.create(poolStats as Partial<PoolStats>);
    await poolStatsRepository.save(entity);
    console.log('Database seeded successfully');

    const userCount = parseInt(stats.Users ?? '0') || 0;

    if (stats.UserAgents && stats.UserAgents.length > 0) {
      await updateOnlineDevices(db, stats.UserAgents);
    } else if (userCount === 0) {
      console.log('No active users in pool status; clearing online_devices');
      await clearOnlineDevices(db);
    } else {
      console.warn(
        'UserAgents missing but pool status reports active users; keeping existing online_devices (stale)'
      );
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

(async () => {
  try {
    await seed();
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
})();
