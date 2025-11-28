import * as fs from 'fs';

import { getDb } from './db';
import { PoolStats } from './entities/PoolStats';
import { User } from './entities/User';
import { UserStats } from './entities/UserStats';
import { Worker } from './entities/Worker';
import {
  convertHashrateFloat,
  normalizeUserAgent,
  parseWorkerName,
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
  if (entry && entry.expires > now) return entry.value as T;

  const pending = _pendingLoads.get(key);
  if (pending) {
    try {
      return (await pending) as T;
    } catch (e) {
      console.debug('pending load failed', e);
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

// Backwards-compatibility aliases
export const getTopClients = getOnlineDevices;
export const getTopClientsFromTable = getOnlineDevicesFromTable;

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

    user.workers.sort((a, b) => Number(b.hashrate5m) - Number(a.hashrate5m));

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

export async function getOnlineDevices(
  limit: number = 10,
  opts?: { windowMinutes?: number }
) {
  const windowMinutes = opts?.windowMinutes ?? 60;
  const key = `onlineDevices:${limit}:${windowMinutes}`;

  return getCached(key, 60, async () => {
    const db = await getDb();
    const repository = db.getRepository(Worker);
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);
    const rows: Array<{
      client: string;
      activeworkers: string;
      uniqueusers: string;
      totalhashrate1hr: string;
      bestever: string;
    }> = await repository
      .createQueryBuilder('worker')
      .select("COALESCE(NULLIF(worker.userAgent, ''), 'Unknown')", 'client')
      .addSelect('COUNT(*)', 'activeworkers')
      .addSelect('COUNT(DISTINCT worker.userAddress)', 'uniqueusers')
      .addSelect('SUM(COALESCE(worker.hashrate1hr, 0))', 'totalhashrate1hr')
      .addSelect('MAX(COALESCE(worker.bestEver, 0))', 'bestever')
      .where('worker.userAgent IS NOT NULL')
      .andWhere("worker.userAgent <> ''")
      .andWhere('worker.lastUpdate >= :threshold', { threshold })
      .groupBy('worker.userAgent')
      .orderBy('totalhashrate1hr', 'DESC')
      .addOrderBy('client', 'ASC')
      .limit(limit)
      .getRawMany();

    return rows.map((r) => ({
      client: r.client,
      activeWorkers: Number(r.activeworkers || 0),
      uniqueUsers: Number(r.uniqueusers || 0),
      hashrate1hr: Number(r.totalhashrate1hr || 0),
      bestEver: Number(r.bestever || 0),
    }));
  });
}

export async function getOnlineDevicesFromTable(
  limit: number = 10,
  windowMinutes: number = 60
) {
  const key = `onlineDevicesTable:${limit}:${windowMinutes}`;
  return getCached(key, 60, async () => {
    const db = await getDb();
    const rows: Array<{
      client: string;
      active_workers: number;
      total_hashrate1hr: number;
      best_active: number;
      rank: number | null;
      computed_at: string;
    }> = await db.query(
      `SELECT client, active_workers, total_hashrate1hr, best_active, rank, computed_at
       FROM "online_devices"
       WHERE window_minutes = $1
       ORDER BY total_hashrate1hr DESC, client ASC
       LIMIT $2;`,
      [windowMinutes, limit]
    );

    return rows.map((r) => ({
      client: r.client,
      activeWorkers: Number(r.active_workers || 0),
      hashrate1hr: Number(r.total_hashrate1hr || 0),
      bestEver: Number(r.best_active || 0),
      rank: r.rank ?? null,
      computedAt: r.computed_at,
    }));
  });
}

export async function resetUserActive(address: string): Promise<void> {
  const db = await getDb();
  const userRepository = db.getRepository(User);
  await userRepository.update(address, { isActive: true });
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
      if (error.cause?.code == 'ERR_INVALID_URL') {
        userData = JSON.parse(fs.readFileSync(apiUrl, 'utf-8'));
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
        lastShare: BigInt(userData.lastshare).toString(),
        workerCount: userData.workers,
        shares: BigInt(userData.shares).toString(),
        bestShare: parseFloat(userData.bestshare),
        bestEver: parseFloat(userData.bestever) || 0,
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
          const newShares = workerData.shares;
          const newBestShare = parseFloat(workerData.bestshare);
          const newBestEver = parseFloat(workerData.bestever) || 0;

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
            shares: workerData.shares,
            bestShare: parseFloat(workerData.bestshare),
            bestEver: parseFloat(workerData.bestever) || 0,
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
