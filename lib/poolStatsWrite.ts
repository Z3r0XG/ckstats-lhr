/**
 * Shared write path for the combined pool.status → PoolStats + online_devices. Used by BOTH the
 * cron `seed` script and the in-process decoupled-ingest combine, so the persistence logic lives in
 * one place. Pure DB writes from an already-combined CombinedPoolStatus (no fetching, no env).
 */
import { PoolStats } from './entities/PoolStats';
import type { CombinedPoolStatus, CombinedUserAgent } from '../scripts/combine';
import { bigIntStringFromFloatLike } from '../utils/helpers';

type Db = {
  getRepository: (e: unknown) => {
    create: (o: unknown) => unknown;
    save: (o: unknown) => Promise<unknown>;
  };
  transaction: (
    cb: (m: {
      query: (sql: string, p?: unknown[]) => Promise<unknown>;
    }) => Promise<void>
  ) => Promise<void>;
  query: (sql: string, p?: unknown[]) => Promise<unknown>;
};

/** Upsert the online_devices table from the combined per-UA device list (hashrate5m already numeric). */
export async function updateOnlineDevices(
  db: Db,
  userAgents?: CombinedUserAgent[]
): Promise<void> {
  if (!userAgents || userAgents.length === 0) return;
  const sorted = [...userAgents].sort((a, b) => b.hashrate5m - a.hashrate5m);
  const updateTimestamp = new Date().toISOString();
  const valuesSql: string[] = [];
  const params: Array<string | number> = [];
  let p = 1;
  for (const device of sorted) {
    valuesSql.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`);
    params.push(
      device.ua,
      device.devices,
      device.hashrate5m,
      updateTimestamp,
      device.bestshare
    );
    p += 5;
  }
  await db.transaction(async (manager) => {
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
}

export async function clearOnlineDevices(db: Db): Promise<void> {
  await db.query(`DELETE FROM "online_devices";`);
}

/**
 * Persist one combined pool.status: write a PoolStats row (users/workers are the SUMmed pool-level
 * counts) and refresh online_devices. Matches the cron seed's behavior exactly.
 */
export async function persistCombinedPoolStats(
  db: Db,
  combined: CombinedPoolStatus
): Promise<void> {
  const poolStats = {
    runtime: Math.round(combined.runtime),
    users: combined.users,
    workers: combined.workers,
    idle: combined.idle,
    disconnected: combined.disconnected,
    hashrate1m: combined.hashrate1m,
    hashrate5m: combined.hashrate5m,
    hashrate15m: combined.hashrate15m,
    hashrate1hr: combined.hashrate1hr,
    hashrate6hr: combined.hashrate6hr,
    hashrate1d: combined.hashrate1d,
    hashrate7d: combined.hashrate7d,
    diff: combined.diff,
    netdiff: combined.netdiff ?? undefined,
    accepted: combined.accepted,
    rejected: combined.rejected,
    bestshare: combined.bestshare,
    SPS1m: combined.SPS1m,
    SPS5m: combined.SPS5m,
    SPS15m: combined.SPS15m,
    SPS1h: combined.SPS1h,
    accepted_count: combined.acceptedCount
      ? bigIntStringFromFloatLike(combined.acceptedCount)
      : undefined,
    rejected_count: combined.rejectedCount
      ? bigIntStringFromFloatLike(combined.rejectedCount)
      : undefined,
    timestamp: new Date(),
  } satisfies Partial<PoolStats>;

  const repo = db.getRepository(PoolStats);
  await repo.save(repo.create(poolStats));

  if (combined.userAgents.length > 0) {
    await updateOnlineDevices(db, combined.userAgents);
  } else if (combined.users === 0) {
    await clearOnlineDevices(db);
  }
  // else: UAs missing but users present → keep existing online_devices (stale), like seed.
}
