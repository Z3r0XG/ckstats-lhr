// eslint-disable-next-line import/no-unresolved
import 'dotenv/config';

import { getDb } from '../lib/db';
import { PoolStats } from '../lib/entities/PoolStats';
import { bigIntStringFromFloatLike } from '../utils/helpers';
import {
  getPoolUrls,
  combinePoolStatus,
  type CombinedPoolStatus,
  type CombinedUserAgent,
  type RawPoolStatus,
} from './combine';
import { fetchAllPools, fetchPoolStatusFromPool } from './fetchPools';

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
  diffRaw?: string; // raw token from API, e.g. '0.0' or '0'
  netdiff?: string;
  accepted: string;
  rejected: string;
  bestshare: string;
  SPS1m: string;
  SPS5m: string;
  SPS15m: string;
  SPS1h: string;
  accepted_count?: number;
  rejected_count?: number;
}

/** Parse one pool's raw pool.status text (ckpool emits one JSON object per line). */
function parsePoolStatus(text: string): RawPoolStatus {
  const lines = text.split('\n').filter(Boolean);
  const parsed: any = lines.reduce((acc, line) => ({ ...acc, ...JSON.parse(line) }), {});
  // ckpool may report diff as a zero-like decimal ("0.0"); treat as tiny-but-nonzero for formatting.
  const diffMatch = text.match(/"diff"\s*:\s*("[^"]*"|[^,}\n]+)/);
  const diffRaw = diffMatch ? diffMatch[1].trim().replace(/"/g, '') : undefined;
  if (diffRaw && /^0+(?:\.0+)$/.test(diffRaw)) parsed.diff = 0.0001;
  return parsed as RawPoolStatus;
}

/**
 * Fetch pool.status from every configured pool and combine into one service-wide status.
 * Returns null to SKIP the cycle when any pool is unavailable (so we never persist understated
 * combined stats) or when no pool returned usable data.
 */
async function fetchPoolStats(): Promise<CombinedPoolStatus | null> {
  const urls = getPoolUrls();
  const pools = urls.length > 0 ? urls : ['https://solo.ckpool.org'];
  console.log(`Fetching pool stats from ${pools.length} pool(s)...`);

  const results = await fetchAllPools(pools, fetchPoolStatusFromPool);
  const unavailable = results.filter((r) => r.status === 'error');
  if (unavailable.length > 0) {
    console.warn(
      `${unavailable.length}/${pools.length} pool(s) unavailable; skipping pool-stats cycle to avoid understatement`
    );
    return null;
  }

  const parsed = results
    .flatMap((r) => (r.status === 'found' ? [parsePoolStatus(r.data)] : []))
    .filter((p) => !isEmptyPoolStatus(p as any));
  if (parsed.length === 0) {
    console.warn('No usable pool.status from any pool; skipping this cycle');
    return null;
  }
  return combinePoolStatus(parsed);
}

/**
 * True when a parsed pool.status has no usable data — i.e. every value is
 * undefined. A 0-byte or blank-line-only read parses to an empty status without
 * error; persisting it would write a bogus all-zeros PoolStats row and, via
 * userCount === 0, wrongly clear online_devices. Checks for any defined value
 * rather than key count, because a parsed status always carries a diffRaw key
 * (possibly undefined) so an empty read still has one key. Malformed/non-JSON
 * content instead throws while parsing and is handled by the caller.
 */
export function isEmptyPoolStatus(stats: Partial<PoolStatsData>): boolean {
  return !Object.values(stats).some((v) => v !== undefined);
}

async function updateOnlineDevices(
  db: any,
  userAgents?: CombinedUserAgent[]
): Promise<void> {
  if (!userAgents || userAgents.length === 0) {
    console.log('No UserAgents data available for online_devices update');
    return;
  }

  console.log(`Updating online_devices with ${userAgents.length} device types...`);

  // hashrate5m / bestshare are already numeric (combined across pools).
  const sorted = [...userAgents].sort((a, b) => b.hashrate5m - a.hashrate5m);

  const updateTimestamp = new Date().toISOString();
  const valuesSql: string[] = [];
  const params: Array<string | number> = [];
  let paramIndex = 1;

  for (let i = 0; i < sorted.length; i++) {
    const device = sorted[i];
    const hashrate5mNum = device.hashrate5m;
    const bestshareNum = device.bestshare;

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
    const combined = await fetchPoolStats();
    if (!combined) return; // skip cycle (already logged: pool unavailable or no usable data)

    if (DRY_RUN) {
      console.log('DRY_RUN enabled — would save combined PoolStats:');
      console.log(JSON.stringify(combined, null, 2));
      return;
    }

    db = await getDb();

    // users/workers = distinct DB count of ACTIVE rows (per the plan) — summing per-pool
    // pool.status counts would double-count cross-pool users. Worker rows are one-per-identity
    // (already deduped across pools); "active" = currently hashing (hashrate5m > 0), since Worker
    // has no isActive flag and we retain idle workers. idle/disconnected come from the combined status.
    const [{ c: userCount }] = await db.query(
      `SELECT count(*)::int AS c FROM "User" WHERE "isActive" = true`
    );
    const [{ c: workerCount }] = await db.query(
      `SELECT count(*)::int AS c FROM "Worker" WHERE hashrate5m > 0`
    );

    const poolStats = {
      runtime: Math.round(combined.runtime),
      users: userCount,
      workers: workerCount,
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
      accepted_count: combined.acceptedCount ? bigIntStringFromFloatLike(combined.acceptedCount) : undefined,
      rejected_count: combined.rejectedCount ? bigIntStringFromFloatLike(combined.rejectedCount) : undefined,
      timestamp: new Date(),
    } satisfies Partial<PoolStats>;

    console.log('Saving pool stats to database...');
    const poolStatsRepository = db.getRepository(PoolStats);
    const entity = poolStatsRepository.create(poolStats);
    await poolStatsRepository.save(entity);
    console.log('Database seeded successfully');

    if (combined.userAgents.length > 0) {
      await updateOnlineDevices(db, combined.userAgents);
    } else if (userCount === 0) {
      console.log('No active users; clearing online_devices');
      await clearOnlineDevices(db);
    } else {
      console.warn(
        'UserAgents missing but active users present; keeping existing online_devices (stale)'
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

if (require.main === module) {
  (async () => {
    try {
      await seed();
      console.log('Seeding completed successfully.');
    } catch (error) {
      console.error('Error during seeding:', error);
      process.exit(1);
    }
  })();
}
