// NB: no `import 'dotenv/config'` — the CLI npm script preloads it via `-r dotenv/config`, and when
// this is imported by the in-process ingest loop Next provides env. Importing dotenv here would drag
// node builtins into the instrumentation bundle.
import { LessThan } from 'typeorm';

import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { UserStats } from '../lib/entities/UserStats';
import { Worker } from '../lib/entities/Worker';
import { WorkerStats } from '../lib/entities/WorkerStats';

/**
 * Prune the time-series tables to their retention windows (PoolStats 1wk, UserStats 3d, WorkerStats
 * 1d) and drop Worker rows not updated in 7 days. The per-pool *_snapshot tables are bounded
 * (upsert-latest) and intentionally NOT pruned here. Does NOT close the DB connection — callers own
 * its lifecycle (the in-process loop shares one connection; the CLI entry below destroys it).
 */
export async function cleanOldStats(): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const db = await getDb();

  const poolStatsResult = await db
    .getRepository(PoolStats)
    .delete({ timestamp: LessThan(oneWeekAgo) });
  console.log(`Deleted ${poolStatsResult.affected || 0} old pool stats`);

  const userStatsResult = await db
    .getRepository(UserStats)
    .delete({ timestamp: LessThan(threeDaysAgo) });
  console.log(`Deleted ${userStatsResult.affected || 0} old user stats`);

  const workerStatsResult = await db
    .getRepository(WorkerStats)
    .delete({ timestamp: LessThan(oneDayAgo) });
  console.log(`Deleted ${workerStatsResult.affected || 0} old worker stats`);

  // Drop Worker rows untouched in 7 days — orphaned records whose pool files are gone. Active/idle
  // workers still reported by the API are saved every cycle, so their updatedAt stays current.
  const staleWorkerResult = await db
    .getRepository(Worker)
    .delete({ updatedAt: LessThan(oneWeekAgo) });
  console.log(`Deleted ${staleWorkerResult.affected || 0} stale workers`);

  console.log('Old stats cleanup completed successfully');
}

if (require.main === module) {
  cleanOldStats()
    .catch((error) => console.error('Error cleaning old stats:', error))
    .finally(async () => {
      const db = await getDb();
      await db.destroy();
    });
}
