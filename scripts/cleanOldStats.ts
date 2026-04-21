// eslint-disable-next-line import/no-unresolved
import 'dotenv/config';
import { LessThan } from 'typeorm';

import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { UserStats } from '../lib/entities/UserStats';
import { Worker } from '../lib/entities/Worker';
import { WorkerStats } from '../lib/entities/WorkerStats';

async function cleanOldStats() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  try {
    const db = await getDb();

    const poolStatsResult = await db.getRepository(PoolStats).delete({
      timestamp: LessThan(oneWeekAgo),
    });
    console.log(`Deleted ${poolStatsResult.affected || 0} old pool stats`);

    const userStatsResult = await db.getRepository(UserStats).delete({
      timestamp: LessThan(threeDaysAgo),
    });
    console.log(`Deleted ${userStatsResult.affected || 0} old user stats`);

    const workerStatsResult = await db.getRepository(WorkerStats).delete({
      timestamp: LessThan(oneDayAgo),
    });
    console.log(`Deleted ${workerStatsResult.affected || 0} old worker stats`);

    // Delete Worker rows that haven't been updated in 7 days — these are orphaned records
    // for workers whose pool files no longer exist and will never be fetched again.
    // Active workers (including idle ones still reported by the API) are saved every cron run,
    // so their updatedAt stays current.
    const staleWorkerResult = await db.getRepository(Worker).delete({
      updatedAt: LessThan(oneWeekAgo),
    });
    console.log(`Deleted ${staleWorkerResult.affected || 0} stale workers`);

    console.log('Old stats cleanup completed successfully');
  } catch (error) {
    console.error('Error cleaning old stats:', error);
  } finally {
    const db = await getDb();
    await db.destroy();
  }
}

cleanOldStats().catch(console.error);
