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
 * 1d). Worker-entity GC is a separate concern — see cleanDeadWorkers() below. The per-pool *_snapshot
 * tables are bounded (upsert-latest) and intentionally NOT pruned here. Does NOT close the DB
 * connection — callers own its lifecycle (the in-process loop shares one connection; CLI destroys it).
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

  console.log('Old stats cleanup completed successfully');
}

/**
 * Drop Worker rows whose miner hasn't submitted a share in 7 days. Keys on `lastUpdate` (the worker's
 * last-share time), NOT `updatedAt` (row-write recency): a worker still listed by ckpool but not
 * sharing for a week is dead, and keying on write-recency would also delete live workers whenever
 * ingestion pauses (an outage freezes updatedAt for everyone). WorkerStats children are removed by the
 * FK's ON DELETE CASCADE. Does NOT close the DB connection — callers own its lifecycle.
 */
export async function cleanDeadWorkers(): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const db = await getDb();
  const result = await db
    .getRepository(Worker)
    .delete({ lastUpdate: LessThan(oneWeekAgo) });
  console.log(`Deleted ${result.affected || 0} dead workers`);
}

if (require.main === module) {
  cleanOldStats()
    .then(() => cleanDeadWorkers())
    .catch((error) => console.error('Error cleaning old stats:', error))
    .finally(async () => {
      const db = await getDb();
      await db.destroy();
    });
}
