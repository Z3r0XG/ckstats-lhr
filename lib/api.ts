import * as fs from 'fs';

import { getDb } from './db';
import { PoolStats } from './entities/PoolStats';
import { User } from './entities/User';
import { UserStats } from './entities/UserStats';
import { Worker } from './entities/Worker';
import { convertHashrateFloat } from '../utils/helpers';

const HISTORICAL_DATA_POINTS = 5760;

// Simple in-memory TTL cache suitable for single-instance deployments.
type CacheEntry = { expires: number; value: any };
const _cache = new Map<string, CacheEntry>();

// Map of in-flight loader promises to dedupe concurrent loads for the same key.
const _pendingLoads = new Map<string, Promise<any>>();

// Jitter: add small jitter to spread revalidation load slightly.
// Note: this uses a multiplier in range [0.9, 1.1], so a 60s TTL may expire
// between ~54s and ~66s. This intentionally allows some early/late expiry
// to reduce stampeding under high concurrency.
const _JITTER_MIN = 0.9;
const _JITTER_RANGE = 0.2;

async function getCached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && entry.expires > now) return entry.value as T;

  // If a load for this key is already in-flight, await and reuse it.
  const pending = _pendingLoads.get(key);
  if (pending) {
    // debug-level log to help trace duplicate-load scenarios during testing
    try {
      // eslint-disable-next-line no-console
      console.debug('[cache] waiting for pending load', key);
      return (await pending) as T;
    } catch {
      // If pending failed, fall through to attempt a fresh load
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
  // Snapshot keys first to avoid issues deleting while iterating. This is
  // slightly more memory-heavy but safe for correctness; if performance
  // becomes an issue, consider a bounded cache or LRU implementation.
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

// Periodic incremental cleanup to remove expired entries even if they are
// never accessed again. This keeps memory bounded for long-running processes.
// These values are intentionally hard-coded for predictable behavior in
// single-host deployments: run every 60s and process 500 keys per tick.
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
  // debug-level log for visibility during testing
  // eslint-disable-next-line no-console
  console.debug('[cache] cleanup tick processed', processed);
}

const _cleanupTimer = setInterval(_cacheCleanupTick, CACHE_CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();

// Export cache helpers for testing and controlled eviction in other modules
export { getCached, cacheDelete, cacheDeletePrefix, cacheGet };

// Test/debug helpers (safe to export for local testing). These are lightweight
// helpers to populate the cache and inspect current state without changing
// production behavior. They are intended for local debugging and tests.
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
  // Evict pool stats caches so next reads are fresh
  cacheDelete('latestPoolStats');
  cacheDelete('historicalPoolStats');
  return saved;
}

export async function getLatestPoolStats(): Promise<PoolStats | null> {
  return getCached('latestPoolStats', 5, async () => {
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
  return getCached(key, 3, async () => {
    const db = await getDb();
    const userRepository = db.getRepository(User);

    const user = await userRepository.findOne({
      where: { address },
      relations: {
        workers: true,
        stats: true,
      },
      relationLoadStrategy: 'query',
    });

    if (!user) return null;

    // Sort workers by hashrate
    user.workers.sort((a, b) => Number(b.hashrate5m) - Number(a.hashrate5m));

    // Sort stats by timestamp and take the most recent
    user.stats.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      ...user,
      stats: user.stats.slice(0, 1),
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
  return getCached(key, 5, async () => {
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
      // Sort stats by timestamp after loading
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
      .distinctOn(['userStats.userAddress'])
      .orderBy('userStats.userAddress', 'ASC')
      .addOrderBy('userStats.timestamp', 'DESC')
      .getMany();

    const sortedUsers = topUsers
      .sort((a, b) => Number(b.bestEver) - Number(a.bestEver))
      .slice(0, limit);

    return sortedUsers.map((stats) => ({
      address: stats.userAddress,
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

    // First get the latest stats for each user
    const topUsers = await repository
      .createQueryBuilder('userStats')
      .innerJoinAndSelect('userStats.user', 'user')
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
      .distinctOn(['userStats.userAddress'])
      .orderBy('userStats.userAddress', 'ASC')
      .addOrderBy('userStats.timestamp', 'DESC')
      .getMany();

    // Then sort by hashrate and take the top N
    const sortedUsers = topUsers
      .sort((a, b) => Number(b.hashrate1hr) - Number(a.hashrate1hr))
      .slice(0, limit);

    return sortedUsers.map((stats) => ({
      address: stats.userAddress,
      workerCount: stats.workerCount,
      hashrate1hr: stats.hashrate1hr,
      hashrate1d: stats.hashrate1d,
      hashrate7d: stats.hashrate7d,
      bestShare: stats.bestShare,
      bestEver: stats.bestEver,
    }));
  });
}

export async function resetUserActive(address: string): Promise<void> {
  const db = await getDb();
  const userRepository = db.getRepository(User);
  await userRepository.update(address, { isActive: true });
}

export async function updateSingleUser(address: string): Promise<void> {
  // Perform a last minute check to prevent directory traversal vulnerabilities
  if (/[^a-zA-Z0-9]/.test(address)) {
    throw new Error('updateSingleUser(): address contains invalid characters');
  }

  const apiUrl =
    (process.env.API_URL || 'https://solo.ckpool.org') + `/users/${address}`;

  if (!apiUrl) {
    throw new Error('API_URL is not defined in environment variables');
  }

  console.log('Attempting to update user stats for:', address);

  try {
    let userData;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      userData = await response.json();
    } catch (error: any) {
      if (error.cause?.code == 'ERR_INVALID_URL') {
        userData = JSON.parse(fs.readFileSync(apiUrl, 'utf-8'));
      } else throw error;
    }

    console.log('API URL:', apiUrl);
    console.log('Response:', userData);

    const db = await getDb();
    await db.transaction(async (manager) => {
      // Update or create user
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({ where: { address } });
      if (user) {
        user.authorised = userData.authorised;
        user.isActive = true;
        await userRepository.save(user);
      } else {
        await userRepository.insert({
          address,
          authorised: userData.authorised,
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }

      // Create a new UserStats entry
      const userStatsRepository = manager.getRepository(UserStats);
      const userStats = userStatsRepository.create({
        userAddress: address,
        // preserve fractional hashrates as numbers
        hashrate1m: convertHashrateFloat(userData.hashrate1m),
        hashrate5m: convertHashrateFloat(userData.hashrate5m),
        hashrate1hr: convertHashrateFloat(userData.hashrate1hr),
        hashrate1d: convertHashrateFloat(userData.hashrate1d),
        hashrate7d: convertHashrateFloat(userData.hashrate7d),
        // lastShare and shares are counters - keep as strings for bigint safety
        lastShare: BigInt(userData.lastshare).toString(),
        workerCount: userData.workers,
        shares: BigInt(userData.shares).toString(),
        bestShare: parseFloat(userData.bestshare),
        // store bestEver as a number (double precision) to preserve fractional difficulty
        bestEver: parseFloat(userData.bestever) || 0,
      });
      await userStatsRepository.save(userStats);

      // Update or create workers
      const workerRepository = manager.getRepository(Worker);
      for (const workerData of userData.worker) {
        const workerName = workerData.workername.split('.')[1];
        const worker = await workerRepository.findOne({
          where: {
            userAddress: address,
            name: workerName,
          },
        });
        if (worker) {
          worker.hashrate1m = convertHashrateFloat(workerData.hashrate1m);
          worker.hashrate5m = convertHashrateFloat(workerData.hashrate5m);
          worker.hashrate1hr = convertHashrateFloat(workerData.hashrate1hr);
          worker.hashrate1d = convertHashrateFloat(workerData.hashrate1d);
          worker.hashrate7d = convertHashrateFloat(workerData.hashrate7d);
          worker.lastUpdate = new Date(workerData.lastshare * 1000);
          worker.shares = workerData.shares;
          worker.bestShare = parseFloat(workerData.bestshare);
          worker.bestEver = parseFloat(workerData.bestever) || 0;
          await workerRepository.save(worker);
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
            shares: workerData.shares,
            bestShare: parseFloat(workerData.bestshare),
            bestEver: parseFloat(workerData.bestever) || 0,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });
    console.log(`Updated user and workers for: ${address}`);
    // Evict caches related to this user so future reads are fresh
    cacheDelete(`userWithWorkers:${address}`);
    cacheDelete(`userHistorical:${address}`);
    // evict top lists (coarse)
    cacheDeletePrefix('topUser');
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
  // Evict caches for this user so reads reflect new privacy immediately
  cacheDelete(`userWithWorkers:${address}`);
  cacheDelete(`userHistorical:${address}`);
  cacheDeletePrefix('topUser');

  return { isPublic: newIsPublic };
}
