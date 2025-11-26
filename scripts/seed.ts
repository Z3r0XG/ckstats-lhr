import 'dotenv/config';
import * as fs from 'fs';
import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { convertHashrate, convertHashrateFloat } from '../utils/helpers';

const DRY_RUN = Boolean(process.env.SEED_DRY_RUN || process.env.DRY_RUN);

interface PoolStatsData {
  runtime: string;
  Users: string;
  Workers: string;
  Idle: string;
  Disconnected: string;
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
  const apiUrl = (process.env.API_URL || 'https://solo.ckpool.org') + '/pool/pool.status';

  try {
    const response = await fetch(apiUrl);
    data = await response.text();
  } catch (error: any) {
    if (error.cause?.code == 'ERR_INVALID_URL') {
      data = fs.readFileSync(apiUrl, 'utf-8');
    } else throw error;
  }

  const jsonLines = data.split('\n').filter(Boolean);
  const parsedData = jsonLines.reduce((acc, line) => ({ ...acc, ...JSON.parse(line) }), {});
  return parsedData as PoolStatsData;
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
  bestshare: parseFloat(stats.bestshare ?? '') || 0,
      SPS1m: stats.SPS1m,
      SPS5m: stats.SPS5m,
      SPS15m: stats.SPS15m,
      SPS1h: stats.SPS1h,
      timestamp: new Date(),
    } as unknown as Partial<PoolStats>;

    if (DRY_RUN) {
      console.log('DRY_RUN enabled — would save the following PoolStats object:');
      const printable = Object.fromEntries(
        Object.entries(poolStats).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])
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
