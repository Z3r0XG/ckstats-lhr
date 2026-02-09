import { getDb } from './db';
import { readJsonStable } from '../utils/readFileStable';
import { validateAndResolveUserPath } from '../utils/validateLocalPath';
import { PoolStats } from './entities/PoolStats';
import { User } from './entities/User';
import { UserStats } from './entities/UserStats';
import { Worker } from './entities/Worker';
import { WorkerStats } from './entities/WorkerStats';
import {
  convertHashrateFloat,
  normalizeUserAgent,
  parseWorkerName,
  bigIntStringFromFloatLike,
  safeParseFloat,
  maskAddress,
} from '../utils/helpers';

const HISTORICAL_DATA_POINTS = 5760;

type CacheEntry = { expires: number; value: any };
const _cache = new Map<string, CacheEntry>();

const _pendingLoads = new Map<string, Promise<any>>();

const _JITTER_MIN = 0.9;
const _JITTER_RANGE = 0.2;

async function getCached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && entry.expires > now) {
    return entry.value as T;
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
    _cache.set(key, {
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
  _cache.set(key, {
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
        .andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('MAX(ws2.timestamp)')
            .from(WorkerStats, 'ws2')
            .where('ws2.workerId = ws.workerId')
            .getQuery();
          return `ws.timestamp = ${subQuery}`;
        })
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
        name: workerName.trim(),
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
  const key = `topUserDifficulties:${limit}`;
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
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('MAX(us2.timestamp)')
          .from(UserStats, 'us2')
          .where('us2.userAddress = userStats.userAddress')
          .getQuery();
        return `userStats.timestamp = ${subQuery}`;
      })
      .orderBy('userStats.bestEver', 'DESC')
      .take(limit)
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
  const key = `topUserHashrates:${limit}`;
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
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('MAX(us2.timestamp)')
          .from(UserStats, 'us2')
          .where('us2.userAddress = userStats.userAddress')
          .getQuery();
        return `userStats.timestamp = ${subQuery}`;
      })
      .andWhere('userStats.workerCount > 0')
      .orderBy('userStats.hashrate1hr', 'DESC')
      .take(limit)
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
  const key = `topUserLoyalty:${limit}`;
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
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('MAX(us2.timestamp)')
          .from(UserStats, 'us2')
          .where('us2.userAddress = userStats.userAddress')
          .getQuery();
        return `userStats.timestamp = ${subQuery}`;
      })
      .andWhere('userStats.workerCount > 0')
      .andWhere('user.authorised > 0')
      .orderBy('user.authorised', 'ASC')
      .take(limit)
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
}

export async function updateSingleUser(
  address: string,
  opts?: { dryRun?: boolean }
): Promise<boolean> {
  if (/[^a-zA-Z0-9]/.test(address)) {
    throw new Error('updateSingleUser(): address contains invalid characters');
  }

  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + `/users/${address}`;

  if (!apiUrl) {
    throw new Error('API_URL is not defined in environment variables');
  }

  try {
    let userData;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      userData = await response.json();
    } catch (error: any) {
      if (error.cause?.code === 'ERR_INVALID_URL') {
        // When API_URL is a filesystem path (local logs), enforce a safe root
        const basePath = process.env.API_URL || '';
        const resolved = validateAndResolveUserPath(address, basePath);
        userData = await readJsonStable(resolved, {
          retries: 6,
          backoffMs: 50,
        });
      } else throw error;
    }

    if (opts?.dryRun) {
      if (!userData || !Array.isArray(userData.worker)) {
        throw new Error('Invalid user data fetched during dry-run');
      }

      const db = await getDb();
      const userRepository = db.getRepository(User);

      const existingUser = await userRepository.findOne({
        where: { address },
        relations: { workers: true },
      });

      if (!existingUser) return true;

      if (String(existingUser.authorised) !== String(userData.authorised))
        return true;

      for (const workerData of userData.worker) {
        const workerName = parseWorkerName(workerData.workername, address);
        const existing = existingUser.workers.find(
          (w) => w.name === workerName
        );
        if (!existing) return true;
        const rawUa = (workerData.useragent ?? '').trim();
        const token = normalizeUserAgent(rawUa);
        const existingRaw = existing.userAgentRaw ?? '';
        const existingToken = existing.userAgent ?? '';
        if ((existingRaw || '') !== (rawUa || '')) return true;
        if ((existingToken || '') !== (token || '')) return true;
      }

      return false;
    }

    const db = await getDb();
    let anyChanged = false;
    await db.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({ where: { address } });
      if (user) {
        const newAuthorised = String(userData.authorised);
        if (
          String(user.authorised) !== newAuthorised ||
          user.isActive !== true
        ) {
          user.authorised = newAuthorised;
          user.isActive = true;
          await userRepository.save(user);
          anyChanged = true;
        }
      } else {
        await userRepository.insert({
          address,
          authorised: String(userData.authorised),
          isActive: true,
          lastActivatedAt: new Date(),
          updatedAt: new Date().toISOString(),
        });
        anyChanged = true;
      }

      const userStatsRepository = manager.getRepository(UserStats);
      const userStats = userStatsRepository.create({
        userAddress: address,
        hashrate1m: convertHashrateFloat(userData.hashrate1m),
        hashrate5m: convertHashrateFloat(userData.hashrate5m),
        hashrate1hr: convertHashrateFloat(userData.hashrate1hr),
        hashrate1d: convertHashrateFloat(userData.hashrate1d),
        hashrate7d: convertHashrateFloat(userData.hashrate7d),
        lastShare: bigIntStringFromFloatLike(userData.lastshare),
        workerCount: userData.workers,
        shares: safeParseFloat(userData.shares, 0),
        bestShare: safeParseFloat(userData.bestshare, 0),
        bestEver: safeParseFloat(userData.bestever, 0),
      });
      await userStatsRepository.save(userStats);

      const workerRepository = manager.getRepository(Worker);
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

        if (worker) {
          const newHashrate1m = convertHashrateFloat(workerData.hashrate1m);
          const newHashrate5m = convertHashrateFloat(workerData.hashrate5m);
          const newHashrate1hr = convertHashrateFloat(workerData.hashrate1hr);
          const newHashrate1d = convertHashrateFloat(workerData.hashrate1d);
          const newHashrate7d = convertHashrateFloat(workerData.hashrate7d);
          const newLastUpdate = new Date(workerData.lastshare * 1000);
          const newShares = safeParseFloat(workerData.shares, 0);
          const newBestShare = safeParseFloat(workerData.bestshare, 0);
          const newBestEver = safeParseFloat(workerData.bestever, 0);

          const changed =
            (worker.userAgent || '') !== (token || '') ||
            (worker.userAgentRaw || '') !== (rawUa || '') ||
            Number(worker.hashrate1m || 0) !== Number(newHashrate1m || 0) ||
            Number(worker.hashrate5m || 0) !== Number(newHashrate5m || 0) ||
            Number(worker.hashrate1hr || 0) !== Number(newHashrate1hr || 0) ||
            Number(worker.hashrate1d || 0) !== Number(newHashrate1d || 0) ||
            Number(worker.hashrate7d || 0) !== Number(newHashrate7d || 0) ||
            Number(worker.shares || 0) !== Number(newShares || 0) ||
            Number(worker.bestShare || 0) !== Number(newBestShare || 0) ||
            Number(worker.bestEver || 0) !== Number(newBestEver || 0) ||
            (worker.lastUpdate?.getTime() || 0) !== newLastUpdate.getTime();

          if (changed) {
            worker.userAgent = token;
            worker.userAgentRaw = rawUa || null;
            worker.hashrate1m = newHashrate1m;
            worker.hashrate5m = newHashrate5m;
            worker.hashrate1hr = newHashrate1hr;
            worker.hashrate1d = newHashrate1d;
            worker.hashrate7d = newHashrate7d;
            worker.lastUpdate = newLastUpdate;
            worker.shares = newShares;
            worker.bestShare = newBestShare;
            worker.bestEver = newBestEver;
            await workerRepository.save(worker);
            anyChanged = true;
          }
        } else {
          await workerRepository.insert({
            userAddress: address,
            name: workerName,
            hashrate1m: convertHashrateFloat(workerData.hashrate1m),
            hashrate5m: convertHashrateFloat(workerData.hashrate5m),
            hashrate1hr: convertHashrateFloat(workerData.hashrate1hr),
            hashrate1d: convertHashrateFloat(workerData.hashrate1d),
            hashrate7d: convertHashrateFloat(workerData.hashrate7d),
            lastUpdate: new Date(workerData.lastshare * 1000),
            shares: safeParseFloat(workerData.shares, 0),
            bestShare: safeParseFloat(workerData.bestshare, 0),
            bestEver: safeParseFloat(workerData.bestever, 0),
            userAgent: token,
            userAgentRaw: rawUa || null,
            updatedAt: new Date().toISOString(),
          });
          anyChanged = true;
        }
      }
    });

    cacheDelete(`userWithWorkers:${address}`);
    cacheDelete(`userHistorical:${address}`);
    cacheDeletePrefix('topUser');
    cacheDeletePrefix('onlineDevices');
    cacheDeletePrefix(`workerWithStats:${address}:`);
    return anyChanged;
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

export async function getTopBestDiffs(limit: number = 10) {
  const db = await getDb();

  const rows: Array<{
    rank: number;
    difficulty: number;
    device: string;
    timestamp: string;
  }> = await db.query(
    `SELECT rank, difficulty, device, timestamp
     FROM "top_best_diffs"
     ORDER BY rank ASC
     LIMIT $1;`,
    [limit]
  );

  return rows.map((r) => ({
    rank: r.rank,
    difficulty: Number(r.difficulty || 0),
    device: r.device || 'Other',
    timestamp: new Date(r.timestamp),
  }));
}
