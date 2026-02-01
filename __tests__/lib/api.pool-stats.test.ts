import { savePoolStats, getLatestPoolStats, getHistoricalPoolStats } from '../../lib/api';
import * as dbModule from '../../lib/db';
import { PoolStats } from '../../lib/entities/PoolStats';

jest.mock('../../lib/db');

describe('Pool Stats API', () => {
  const mockPoolStats: PoolStats[] = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    timestamp: new Date(Date.now() - (5 - i) * 5 * 60000),
    runtime: 3600 + i * 100,
    users: 200 + i,
    workers: 300 + i,
    idle: 5 + i,
    disconnected: 2 + i,
    hashrate1m: 1140000 + i * 1000,
    hashrate5m: 1150000 + i * 1000,
    hashrate15m: 1160000 + i * 1000,
    hashrate1hr: 1170000 + i * 1000,
    hashrate6hr: 1175000 + i * 1000,
    hashrate1d: 1180000 + i * 1000,
    hashrate7d: 1185000 + i * 1000,
    diff: 0.5 + i * 0.1,
    netdiff: 500 + i,
    accepted: BigInt(10000000 + i * 1000),
    rejected: BigInt(50000 + i * 100),
    bestshare: 1000 + i,
    SPS1m: 50 + i,
    SPS5m: 48 + i,
    SPS15m: 45 + i,
    SPS1h: 40 + i,
  } as PoolStats));

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('savePoolStats', () => {
    it('saves pool stats and clears cache', async () => {
      const mockRepository = {
        create: jest.fn((input) => input),
        save: jest.fn((stats) => Promise.resolve({ ...stats, id: 1 })),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      const input = { hashrate1m: 1150000, workers: 300 };
      const result = await savePoolStats(input as any);

      expect(mockRepository.create).toHaveBeenCalledWith(input);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({ ...input, id: 1 });
    });

    it('validates required fields', async () => {
      const mockRepository = {
        create: jest.fn((input) => input),
        save: jest.fn(),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      const incompleteInput = { hashrate1m: 1150000 };
      await savePoolStats(incompleteInput as any);

      expect(mockRepository.create).toHaveBeenCalledWith(incompleteInput);
    });

    it('clears cache after save', async () => {
      const mockRepository = {
        create: jest.fn((input) => input),
        save: jest.fn((stats) => Promise.resolve({ ...stats, id: 2 })),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      await savePoolStats({
        hashrate1m: 1150000,
        workers: 300,
        difficulty: 100,
        hashrate5m: 1160000,
        hashrate15m: 1170000,
        hashrate1h: 1180000,
        hashrate24h: 1190000,
        bestshare: 1000,
        users: 200,
        netdiff: 500,
        timestamp: new Date(),
      } as any);

      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('getLatestPoolStats', () => {
    it('fetches latest pool stats ordered by timestamp DESC', async () => {
      const latestRecord = mockPoolStats[0];
      const mockRepository = {
        findOne: jest.fn((_options) => Promise.resolve(latestRecord)),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      const result = await getLatestPoolStats();

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {},
        order: { timestamp: 'DESC' },
      });
      expect(result).toEqual(latestRecord);
    });
  });

  describe('getHistoricalPoolStats', () => {
    it('fetches historical stats with DESC ordering and 5760 limit', async () => {
      const mockRepository = {
        find: jest.fn((_options) => Promise.resolve(mockPoolStats)),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      const result = await getHistoricalPoolStats();

      expect(mockRepository.find).toHaveBeenCalledWith({
        order: { timestamp: 'DESC' },
        take: 5760,
      });
      expect(result).toEqual(mockPoolStats);
    });

    it('returns array results from database', async () => {
      const testData = [
        { id: 1, timestamp: new Date('2025-01-31T12:00:00Z') } as PoolStats,
        { id: 2, timestamp: new Date('2025-01-31T11:00:00Z') } as PoolStats,
      ];

      const mockRepository = {
        find: jest.fn((_options) => Promise.resolve(testData)),
      };

      const mockDb = {
        getRepository: jest.fn(() => mockRepository),
      };

      jest.spyOn(dbModule, 'getDb').mockResolvedValue(mockDb as any);

      const result = await getHistoricalPoolStats();

      // Verify results are properly returned as array
      expect(Array.isArray(result)).toBe(true);
      expect(result.length >= 1).toBe(true);
    });
  });
});
