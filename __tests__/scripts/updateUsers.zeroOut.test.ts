/**
 * @jest-environment node
 */

import { zeroOutUnseenWorkers } from '../../scripts/updateUsers';
import * as apiModule from '../../lib/api';

jest.mock('../../lib/db');
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  cacheDelete: jest.fn(),
  cacheDeletePrefix: jest.fn(),
}));

const ADDRESS = 'bc1qtestaddress';

function makeWorker(name: string, id: number) {
  return {
    id,
    name,
    userAddress: ADDRESS,
    hashrate1m: 500000,
    hashrate5m: 500000,
    hashrate1hr: 500000,
    hashrate1d: 500000,
    hashrate7d: 500000,
    shares: 1000,
    bestShare: 500,
    bestEver: 800,
  };
}

function makeRepos(dbWorkers: ReturnType<typeof makeWorker>[]) {
  const savedWorkers: any[] = [];
  const savedStats: any[] = [];

  const workerRepo = {
    find: jest.fn().mockResolvedValue(dbWorkers),
    save: jest.fn().mockImplementation(async (w) => { savedWorkers.push({ ...w }); return w; }),
  };

  const statsRepo = {
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation(async (s) => { savedStats.push({ ...s }); return s; }),
  };

  return { workerRepo, statsRepo, savedWorkers, savedStats };
}

describe('zeroOutUnseenWorkers', () => {
  afterEach(() => jest.clearAllMocks());

  it('zeros hashrates and writes offline WorkerStats for workers not in seenWorkerNames', async () => {
    const workers = [makeWorker('active', 1), makeWorker('stale', 2)];
    const { workerRepo, statsRepo, savedWorkers, savedStats } = makeRepos(workers);
    const seen = new Set(['active']);

    const count = await zeroOutUnseenWorkers(ADDRESS, seen, workerRepo, statsRepo);

    expect(count).toBe(1);
    expect(savedWorkers).toHaveLength(1);
    expect(savedWorkers[0].name).toBe('stale');
    expect(savedWorkers[0].hashrate1m).toBe(0);
    expect(savedWorkers[0].hashrate5m).toBe(0);
    expect(savedWorkers[0].hashrate1hr).toBe(0);
    expect(savedWorkers[0].hashrate1d).toBe(0);
    expect(savedWorkers[0].hashrate7d).toBe(0);

    expect(savedStats).toHaveLength(1);
    expect(savedStats[0].started).toBe('0');
    expect(savedStats[0].workerId).toBe(2);
    expect(savedStats[0].shares).toBe(1000);
    expect(savedStats[0].bestShare).toBe(500);
    expect(savedStats[0].bestEver).toBe(800);
  });

  it('does not touch workers present in seenWorkerNames', async () => {
    const workers = [makeWorker('active', 1)];
    const { workerRepo, statsRepo, savedWorkers, savedStats } = makeRepos(workers);
    const seen = new Set(['active']);

    const count = await zeroOutUnseenWorkers(ADDRESS, seen, workerRepo, statsRepo);

    expect(count).toBe(0);
    expect(savedWorkers).toHaveLength(0);
    expect(savedStats).toHaveLength(0);
  });

  it('zeros all workers when seenWorkerNames is empty', async () => {
    const workers = [makeWorker('workerA', 1), makeWorker('workerB', 2)];
    const { workerRepo, statsRepo, savedWorkers, savedStats } = makeRepos(workers);
    const seen = new Set<string>();

    const count = await zeroOutUnseenWorkers(ADDRESS, seen, workerRepo, statsRepo);

    expect(count).toBe(2);
    expect(savedWorkers).toHaveLength(2);
    expect(savedStats).toHaveLength(2);
    expect(savedStats.every(s => s.started === '0')).toBe(true);
  });

  it('preserves historical share fields on the WorkerStats record', async () => {
    const worker = makeWorker('stale', 1);
    worker.shares = 99999;
    worker.bestShare = 12345;
    worker.bestEver = 67890;
    const { workerRepo, statsRepo, savedStats } = makeRepos([worker]);

    await zeroOutUnseenWorkers(ADDRESS, new Set(), workerRepo, statsRepo);

    expect(savedStats[0].shares).toBe(99999);
    expect(savedStats[0].bestShare).toBe(12345);
    expect(savedStats[0].bestEver).toBe(67890);
  });

  it('handles worker names with leading spaces exactly (no trimming)', async () => {
    const spacedWorker = makeWorker(' BiTaXe', 1);
    const trimmedWorker = makeWorker('BiTaXe', 2);
    const { workerRepo, statsRepo, savedWorkers } = makeRepos([spacedWorker, trimmedWorker]);
    const seen = new Set(['BiTaXe']);

    await zeroOutUnseenWorkers(ADDRESS, seen, workerRepo, statsRepo);

    expect(savedWorkers).toHaveLength(1);
    expect(savedWorkers[0].name).toBe(' BiTaXe');
  });

  it('invalidates cache for each zeroed worker', async () => {
    const workers = [makeWorker(' Roman1', 1), makeWorker('Roman1', 2)];
    const { workerRepo, statsRepo } = makeRepos(workers);
    const seen = new Set<string>();

    await zeroOutUnseenWorkers(ADDRESS, seen, workerRepo, statsRepo);

    const cacheDelete = apiModule.cacheDelete as jest.Mock;
    expect(cacheDelete).toHaveBeenCalledWith(`workerWithStats:${ADDRESS}: Roman1`);
    expect(cacheDelete).toHaveBeenCalledWith(`workerWithStats:${ADDRESS}:Roman1`);
  });
});
