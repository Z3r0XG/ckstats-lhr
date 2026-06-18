// eslint-disable-next-line import/no-unresolved
import 'dotenv/config';

import { getDb } from '../lib/db';
import { persistCombinedPoolStats } from '../lib/poolStatsWrite';
import {
  getPoolUrls,
  combinePoolStatus,
  type CombinedPoolStatus,
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
  const parsed: any = lines.reduce(
    (acc, line) => ({ ...acc, ...JSON.parse(line) }),
    {}
  );
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

    // Pool-level metrics (users/workers/hashrate/etc.) are SUMmed straight from the combined
    // pool.status (anonymous; a wallet on 2+ pools counts on each). The shared writer persists the
    // PoolStats row + refreshes online_devices — same path the in-process ingest combine uses.
    console.log('Saving pool stats to database...');
    await persistCombinedPoolStats(db, combined);
    console.log('Database seeded successfully');
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
