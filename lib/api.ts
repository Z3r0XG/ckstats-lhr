import { getDb } from './db';
import { PoolStats } from './entities/PoolStats';
import { User } from './entities/User';
import { UserStats } from './entities/UserStats';
import { Worker } from './entities/Worker';
import { WorkerStats } from './entities/WorkerStats';
import { getPoolUrls, combineUserData } from '../scripts/combine';
import { fetchAllPools, fetchUserFromPool } from '../scripts/fetchPools';
import { bigIntStringFromFloatLike, maskAddress } from '../utils/helpers';

const HISTORICAL_DATA_POINTS = 5760;

type CacheEntry = { expires: number; value: any };
const _cache = new Map<string, CacheEntry>();

const _pendingLoads = new Map<string, Promise<any>>();

const _JITTER_MIN = 0.9;
const _JITTER_RANGE = 0.2;

// Hard cap on cached entries; once exceeded, the oldest (least-recently-used) keys are evicted.
export const CACHE_MAX_ENTRIES = 10_000;

// Insert/refresh an entry at the most-recently-used position, evicting the oldest entries while over
// the cap. Map iteration is insertion order, so the front is the least-recently-used.
function _cacheStore(key: string, entry: CacheEntry): void {
  _cache.delete(key);
  _cache.set(key, entry);
  if (_cache.size > CACHE_MAX_ENTRIES) {
    const it = _cache.keys();
    while (_cache.size > CACHE_MAX_ENTRIES) {
      const next = it.next();
      if (next.done) break;
      _cache.delete(next.value);
    }
  }
}

async function getCached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry) {
    if (entry.expires > now) {
      _cache.delete(key);
      _cache.set(key, entry); // bump to most-recently-used
      return entry.value as T;
    }
    _cache.delete(key); // expired — remove it
  }

  const pending = _pendingLoads.get(key);
  if (pending) {
    try {
      return (await pending) as T;
    } catch {
      _pendingLoads.delete(key);
    }
  }

  const loadPromise = (async () => {
    const value = await loader();
    const jitter = _JITTER_MIN + Math.random() * _JITTER_RANGE;
    _cacheStore(key, {
      expires: Date.now() + Math.round(ttlSeconds * 1000 * jitter),
      value,
    });
    return value;
  })();

  _pendingLoads.set(key, loadPromise);
  try {
    return (await loadPromise) as T;
  } finally {
    _pendingLoads.delete(key);
  }
}

function cacheDelete(key: string) {
  _cache.delete(key);
}

function cacheDeletePrefix(prefix: string) {
  for (const k of Array.from(_cache.keys())) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

function cacheGet(key: string): CacheEntry | undefined {
  const now = Date.now();
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= now) {
    _cache.delete(key);
    return undefined;
  }
  return entry;
}

const CACHE_CLEANUP_INTERVAL_MS = 60_000;
const CACHE_CLEANUP_BATCH = 500;
let _cleanupIterator: Iterator<[string, CacheEntry]> | null = null;

function _cacheCleanupTick() {
  const now = Date.now();
  if (!_cleanupIterator) _cleanupIterator = _cache.entries();

  let processed = 0;
  while (processed < CACHE_CLEANUP_BATCH) {
    const next = _cleanupIterator.next();
    if (next.done) {
      _cleanupIterator = null;
      break;
    }
    const [k, entry] = next.value;
    if (entry.expires <= now) {
      _cache.delete(k);
    }
    processed++;
  }
}

const _cleanupTimer = setInterval(_cacheCleanupTick, CACHE_CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();

export { getCached, cacheDelete, cacheDeletePrefix, cacheGet };

export function cacheSet(key: string, value: any, ttlSeconds: number) {
  const jitter = _JITTER_MIN + Math.random() * _JITTER_RANGE;
  _cacheStore(key, {
    expires: Date.now() + Math.round(ttlSeconds * 1000 * jitter),
    value,
  });
}

export function getCacheStats() {
  return {
    size: _cache.size,
    pendingLoads: _pendingLoads.size,
  };
}

export function runCacheCleanupNow() {
  _cacheCleanupTick();
}

export type PoolStatsInput = Omit<PoolStats, 'id' | 'timestamp'>;

export async function savePoolStats(stats: PoolStatsInput): Promise<PoolStats> {
  const db = await getDb();
  const repository = db.getRepository(PoolStats);
  const poolStats = repository.create(stats);
  const saved = await repository.save(poolStats);
  cacheDelete('latestPoolStats');
  cacheDelete('historicalPoolStats');
  return saved;
}

export async function getLatestPoolStats(): Promise<PoolStats | null> {
  return getCached('latestPoolStats', 60, async () => {
    const db = await getDb();
    const repository = db.getRepository(PoolStats);
    return repository.findOne({
      where: {},
      order: { timestamp: 'DESC' },
    });
  });
}

export async function getHistoricalPoolStats(): Promise<PoolStats[]> {
  return getCached('historicalPoolStats', 60, async () => {
    const db = await getDb();
    const repository = db.getRepository(PoolStats);
    return repository.find({
      order: { timestamp: 'DESC' },
      take: HISTORICAL_DATA_POINTS,
    });
  });
}

export async function getUserWithWorkersAndStats(address: string) {
  const key = `userWithWorkers:${address}`;
  return getCached(key, 60, async () => {
    const db = await getDb();
    const userRepository = db.getRepository(User);
    const workerStatsRepo = db.getRepository(WorkerStats);

    const user = await userRepository.findOne({
      where: { address },
      relations: {
        workers: true,
        stats: true,
      },
      relationLoadStrategy: 'query',
    });

    if (!user) return null;

    user.workers.sort((a, b) => Number(b.hashrate5m) - Number(a.hashrate5m));
    user.stats.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Batch query all latest WorkerStats at once to avoid N+1 queries
    const workerIds = user.workers.map((w) => w.id);
    const latestStatsMap = new Map<number, WorkerStats>();
    if (workerIds.length > 0) {
      // Use a subquery to get the latest stats for each worker
      const latestStats = await workerStatsRepo
        .createQueryBuilder('ws')
        .where('ws.workerId IN (:...ids)', { ids: workerIds })
        // Each worker's latest row only: (workerId, timestamp) = the per-worker MAX(timestamp),
        // computed once as a grouped set over just this user's workers — not a per-row correlated
        // subquery. Backed by the (workerId, timestamp) index.
        .andWhere(
          `(ws.workerId, ws.timestamp) IN (SELECT "workerId", MAX("timestamp") FROM "WorkerStats" WHERE "workerId" IN (:...latestIds) GROUP BY "workerId")`,
          { latestIds: workerIds }
        )
        .getMany();
      latestStats.forEach((s) => latestStatsMap.set(s.workerId, s));
    }

    const workersWithStats = user.workers.map((worker) => ({
      ...worker,
      latestStats: latestStatsMap.get(worker.id) || null,
    }));

    return {
      ...user,
      stats: user.stats.slice(0, 1),
      workers: workersWithStats,
    };
  });
}

export async function getUserHistoricalStats(address: string) {
  const key = `userHistorical:${address}`;
  return getCached(key, 60, async () => {
    const db = await getDb();
    const repository = db.getRepository(UserStats);
    return repository.find({
      where: { userAddress: address },
      order: { timestamp: 'DESC' },
      take: HISTORICAL_DATA_POINTS,
    });
  });
}

export async function getWorkerWithStats(
  userAddress: string,
  workerName: string
) {
  const key = `workerWithStats:${userAddress}:${workerName}`;
  return getCached(key, 60, async () => {
    const db = await getDb();
    const repository = db.getRepository(Worker);

    const worker = await repository.findOne({
      where: {
        userAddress,
        name: workerName,
      },
      relations: {
        stats: true,
      },
      relationLoadStrategy: 'query',
    });

    if (worker) {
      worker.stats.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
    }

    return worker;
  });
}

export async function getTopUserDifficulties(limit: number = 10) {
  // Sanitize limit to positive integer
  const sanitizedLimit = Math.max(1, Math.floor(limit));
  const key = `topUserDifficulties:${sanitizedLimit}`;
  return getCached(key, 30, async () => {
    const db = await getDb();
    const repository = db.getRepository(UserStats);

    const topUsers = await repository
      .createQueryBuilder('userStats')
      .innerJoin('userStats.user', 'user')
      .select([
        'userStats.id',
        'userStats.userAddress',
        'userStats.workerCount',
        'userStats.bestEver',
        'userStats.bestShare',
        'userStats.hashrate1hr',
        'userStats.hashrate1d',
        'userStats.hashrate7d',
        'userStats.timestamp',
      ])
      .where('user.isPublic = :isPublic', { isPublic: true })
      // Each user's latest row only: timestamp = that user's MAX(timestamp), computed once as a
      // grouped set so the filters here apply to current stats (a since-idle user can't surface an
      // older row that still passes).
      .andWhere(
        `(userStats.userAddress, userStats.timestamp) IN (SELECT "userAddress", MAX("timestamp") FROM "UserStats" GROUP BY "userAddress")`
      )
      .orderBy('userStats.bestEver', 'DESC')
      .limit(sanitizedLimit)
      .getMany();

    return topUsers.map((stats) => ({
      address: maskAddress(stats.userAddress),
      workerCount: stats.workerCount,
      difficulty: stats.bestEver,
      hashrate1hr: stats.hashrate1hr,
      hashrate1d: stats.hashrate1d,
      hashrate7d: stats.hashrate7d,
      bestShare: stats.bestShare,
    }));
  });
}

export async function getTopUserHashrates(limit: number = 10) {
  // Sanitize limit to positive integer
  const sanitizedLimit = Math.max(1, Math.floor(limit));
  const key = `topUserHashrates:${sanitizedLimit}`;
  return getCached(key, 30, async () => {
    const db = await getDb();
    const repository = db.getRepository(UserStats);

    const topUsers = await repository
      .createQueryBuilder('userStats')
      .innerJoin('userStats.user', 'user')
      .select([
        'userStats.id',
        'userStats.userAddress',
        'userStats.workerCount',
        'userStats.hashrate1hr',
        'userStats.hashrate1d',
        'userStats.hashrate7d',
        'userStats.bestShare',
        'userStats.bestEver',
        'userStats.timestamp',
      ])
      .where('user.isPublic = :isPublic', { isPublic: true })
      .andWhere('user.isActive = :isActive', { isActive: true })
      // Each user's latest row only: timestamp = that user's MAX(timestamp), computed once as a
      // grouped set so the filters here apply to current stats (a since-idle user can't surface an
      // older row that still passes).
      .andWhere(
        `(userStats.userAddress, userStats.timestamp) IN (SELECT "userAddress", MAX("timestamp") FROM "UserStats" GROUP BY "userAddress")`
      )
      .andWhere('userStats.workerCount > 0')
      .orderBy('userStats.hashrate1hr', 'DESC')
      .limit(sanitizedLimit)
      .getMany();

    return topUsers.map((stats) => ({
      address: maskAddress(stats.userAddress),
      workerCount: stats.workerCount,
      hashrate1hr: stats.hashrate1hr,
      hashrate1d: stats.hashrate1d,
      hashrate7d: stats.hashrate7d,
      bestShare: stats.bestShare,
      bestEver: stats.bestEver,
    }));
  });
}

/**
 * Fetch top N longest continuously active users, sorted by earliest join time.
 * Filters: isPublic=true, isActive=true, workerCount > 0, authorised > 0
 * Results are cached for 30 seconds.
 * @param limit - Maximum number of users to return (default 10)
 * @returns Array of users sorted by join time (oldest first)
 */
export async function getTopUserLoyalty(limit: number = 10) {
  // Sanitize limit to positive integer
  const sanitizedLimit = Math.max(1, Math.floor(limit));
  const key = `topUserLoyalty:${sanitizedLimit}`;
  return getCached(key, 30, async () => {
    const db = await getDb();
    const repository = db.getRepository(UserStats);

    // Get latest stats per user using a subquery on timestamp
    const users = await repository
      .createQueryBuilder('userStats')
      .innerJoin('userStats.user', 'user')
      .select([
        'userStats.userAddress',
        'userStats.workerCount',
        'userStats.hashrate1hr',
        'userStats.bestShare',
        'userStats.shares',
        'userStats.timestamp',
        'user.authorised',
      ])
      .where('user.isPublic = :isPublic', { isPublic: true })
      .andWhere('user.isActive = :isActive', { isActive: true })
      // Each user's latest row only: timestamp = that user's MAX(timestamp), computed once as a
      // grouped set so the filters here apply to current stats (a since-idle user can't surface an
      // older row that still passes).
      .andWhere(
        `(userStats.userAddress, userStats.timestamp) IN (SELECT "userAddress", MAX("timestamp") FROM "UserStats" GROUP BY "userAddress")`
      )
      .andWhere('userStats.workerCount > 0')
      .andWhere('user.authorised > 0')
      .orderBy('user.authorised', 'ASC')
      .limit(sanitizedLimit)
      .getRawMany();

    return users.map((s: any) => ({
      address: maskAddress(s.userStats_userAddress),
      authorised: Number(s.user_authorised),
      workerCount: Number(s.userStats_workerCount),
      hashrate1hr: Number(s.userStats_hashrate1hr),
      shares: Number(s.userStats_shares),
      bestShare: Number(s.userStats_bestShare),
    }));
  });
}

export async function getOnlineDevices(limit: number = 10) {
  const key = `onlineDevices:${limit}`;
  return getCached(key, 30, async () => {
    const db = await getDb();

    const rows: Array<{
      client: string;
      active_workers: number;
      total_hashrate: number;
      bestshare: number;
      computed_at: string;
    }> = await db.query(
      `SELECT client, active_workers, total_hashrate, bestshare, computed_at
       FROM "online_devices"
       WHERE active_workers > 0
       ORDER BY total_hashrate DESC, client ASC
       LIMIT $1;`,
      [limit]
    );

    return rows.map((r) => ({
      client: r.client,
      activeWorkers: Number(r.active_workers || 0),
      uniqueUsers: 0,
      hashrate1hr: Number(r.total_hashrate || 0),
      bestEver: Number(r.bestshare || 0),
    }));
  });
}

export async function resetUserActive(address: string): Promise<void> {
  const db = await getDb();
  const userRepository = db.getRepository(User);
  await userRepository.update(address, {
    isActive: true,
    lastActivatedAt: new Date(),
  });
  // Clear the cached user data so the next fetch gets fresh DB data
  cacheDelete(`userWithWorkers:${address}`);
  cacheDeletePrefix('topUserHashrates');
  cacheDeletePrefix('topUserLoyalty');
  cacheDeletePrefix(`workerWithStats:${address}:`);
}

export async function updateSingleUser(address: string): Promise<boolean> {
  if (/[^a-zA-Z0-9:]/.test(address)) {
    throw new Error('updateSingleUser(): address contains invalid characters');
  }

  // On-demand (registration) ingest: fetch this user from every configured pool and combine,
  // mirroring the cron's updateUser path so a freshly registered user gets immediate combined
  // data (the next cron cycle overwrites it). Individual-pool errors are tolerated best-effort —
  // we ingest whatever pools responded; if none had this user, there's simply nothing to store.
  const urls = getPoolUrls();
  const pools = urls.length > 0 ? urls : ['https://solo.ckpool.org'];
  const results = await fetchAllPools(pools, (base) =>
    fetchUserFromPool(base, address)
  );
  const found = results.flatMap((r) => (r.status === 'found' ? [r.data] : []));
  if (found.length === 0) {
    // Not (yet) on any pool — e.g. registered but not mining. Not an error.
    return false;
  }
  const combined = combineUserData(found, address);

  try {
    const db = await getDb();
    await db.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({ where: { address } });
      if (user) {
        user.authorised = String(combined.authorised);
        user.isActive = true;
        await userRepository.save(user);
      } else {
        await userRepository.insert({
          address,
          authorised: String(combined.authorised),
          isActive: true,
          lastActivatedAt: new Date(),
          updatedAt: new Date().toISOString(),
        });
      }

      const userStatsRepository = manager.getRepository(UserStats);
      const userStats = userStatsRepository.create({
        userAddress: address,
        hashrate1m: combined.hashrate1m,
        hashrate5m: combined.hashrate5m,
        hashrate1hr: combined.hashrate1hr,
        hashrate1d: combined.hashrate1d,
        hashrate7d: combined.hashrate7d,
        lastShare: bigIntStringFromFloatLike(combined.lastShare),
        workerCount: combined.workerCount,
        shares: combined.shares,
        bestShare: combined.bestShare,
        bestEver: combined.bestEver,
      });
      await userStatsRepository.save(userStats);

      const workerRepository = manager.getRepository(Worker);
      for (const cw of combined.workers) {
        const worker = await workerRepository.findOne({
          where: { userAddress: address, name: cw.name },
        });
        const values = {
          userAgent: cw.userAgent,
          userAgentRaw: cw.userAgentRaw,
          hashrate1m: cw.hashrate1m,
          hashrate5m: cw.hashrate5m,
          hashrate1hr: cw.hashrate1hr,
          hashrate1d: cw.hashrate1d,
          hashrate7d: cw.hashrate7d,
          lastUpdate: new Date(cw.lastShare * 1000),
          shares: cw.shares,
          bestShare: cw.bestShare,
          bestEver: cw.bestEver,
        };
        let workerId: number | undefined;

        if (worker) {
          Object.assign(worker, values);
          const saved = await workerRepository.save(worker);
          workerId = saved.id;
        } else {
          const inserted = await workerRepository.insert({
            userAddress: address,
            name: cw.name,
            updatedAt: new Date().toISOString(),
            ...values,
          });
          workerId = inserted?.identifiers?.[0]?.id as number | undefined;
        }

        // Book this worker's best into the immutable high-score ledger (idempotent; the SQL guard
        // keeps it upward-only). Done here on the on-demand add-user path as well as in the cron
        // so a newly registered user's existing best isn't missed.
        if (cw.bestEver > 0 && workerId != null) {
          await recordBestDiff(manager, {
            workerId,
            userAddress: address,
            workerName: cw.name,
            bestEver: cw.bestEver,
            device: cw.userAgent,
          });
        }
      }
    });

    cacheDelete(`userWithWorkers:${address}`);
    cacheDelete(`userHistorical:${address}`);
    cacheDeletePrefix('topUserHashrates');
    cacheDeletePrefix('topUserLoyalty');
    cacheDeletePrefix(`workerWithStats:${address}:`);
    return true;
  } catch (error) {
    console.error(`Error updating user ${address}:`, error);
    throw error;
  }
}

export async function toggleUserStatsPrivacy(
  address: string
): Promise<{ isPublic: boolean }> {
  const db = await getDb();
  const userRepository = db.getRepository(User);
  const user = await userRepository.findOne({ where: { address } });

  if (!user) {
    throw new Error('User not found');
  }

  const newIsPublic = !user.isPublic;

  await userRepository.update(address, { isPublic: newIsPublic });
  cacheDelete(`userWithWorkers:${address}`);
  cacheDelete(`userHistorical:${address}`);
  cacheDeletePrefix('topUser');

  return { isPublic: newIsPublic };
}

/** Minimal query interface so recordBestDiff works with a DataSource or a transaction manager. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Record a worker's best-ever share into top_best_diffs — the IMMUTABLE high-score ledger.
 *
 * Keyed on the worker's stable identity (user_address, worker_name), NOT workerId (which is a
 * fresh id on every re-import). The trailing `EXCLUDED.difficulty > ...` guard makes this
 * idempotent: a row only moves UP, never down, and re-submitting an equal/old best is a no-op.
 * Nothing ever deletes from this table, so once a record is booked it can only be pushed out of
 * the displayed window by higher records — never lost, even if the worker is later deleted in
 * ckstats or its file disappears from ckpool.
 *
 * Called from BOTH ingestion paths so no record is missed: the cron (updateUsers) gates the call
 * on an actual improvement for efficiency, while the on-demand add-user path (updateSingleUser)
 * calls it for every scored worker — the guard makes both safe and idempotent.
 */
export async function recordBestDiff(
  manager: Queryable,
  record: {
    workerId: number;
    userAddress: string;
    workerName: string;
    bestEver: number;
    device: string;
  }
): Promise<void> {
  await manager.query(
    `INSERT INTO "top_best_diffs" ("workerId", "user_address", "worker_name", difficulty, device, "timestamp")
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT ("user_address", "worker_name") WHERE "user_address" IS NOT NULL DO UPDATE
       SET difficulty  = EXCLUDED.difficulty,
           device      = EXCLUDED.device,
           "timestamp" = now(),
           "workerId"  = EXCLUDED."workerId"
       WHERE EXCLUDED.difficulty > "top_best_diffs".difficulty`,
    [
      record.workerId,
      record.userAddress,
      record.workerName,
      record.bestEver,
      record.device,
    ]
  );
}

export async function getTopBestDiffs(limit: number = 10) {
  const db = await getDb();

  // top_best_diffs is an immutable, never-trimmed ledger of best-ever-per-worker, so the
  // displayed leaderboard is the top N by difficulty computed at read time. rank is derived
  // from row position; timestamp ASC breaks difficulty ties (older record outranks a later
  // equal one) and id ASC is a final tiebreaker so the order is fully deterministic even when
  // difficulty AND timestamp coincide (e.g. the migration backfill stamps rows with one now()).
  const rows: Array<{
    difficulty: number;
    device: string;
    timestamp: string;
  }> = await db.query(
    `SELECT difficulty, device, timestamp
     FROM "top_best_diffs"
     ORDER BY difficulty DESC, timestamp ASC, id ASC
     LIMIT $1;`,
    [limit]
  );

  return rows.map((r, i) => ({
    rank: i + 1,
    difficulty: Number(r.difficulty || 0),
    device: r.device || 'Other',
    timestamp: new Date(r.timestamp),
  }));
}
