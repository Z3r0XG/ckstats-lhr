import { getOnlineDevices, getTopBestDiffs } from '../../lib/api';
import * as dbModule from '../../lib/db';

describe('getOnlineDevices', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries online_devices table and returns correct aggregated values', async () => {
    const fakeRows = [
      {
        client: 'NMMiner',
        active_workers: '8',
        total_hashrate: '123456',
        bestshare: 25.926,
        computed_at: new Date().toISOString(),
      },
    ];

    const fakeQuery = jest.fn(async (sql: string, params: any[]) => {
      expect(sql).toMatch(/online_devices/);
      expect(sql).toMatch(/active_workers\s*>\s*0/);
      expect(params.length).toBe(1);
      return fakeRows;
    });

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ query: fakeQuery } as any);

    const result = await getOnlineDevices(10);

    expect(fakeQuery).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].client).toBe('NMMiner');
    expect(result[0].activeWorkers).toBe(8);
    expect(result[0].uniqueUsers).toBe(0);
    expect(result[0].hashrate1hr).toBe(123456);
    expect(result[0].bestEver).toBe(25.926);
  });
});

describe('getTopBestDiffs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries top_best_diffs table and returns top workers', async () => {
    const now = new Date();
    const fakeRows = [
      {
        rank: 1,
        difficulty: 25.926,
        device: 'NMMiner',
        timestamp: now.toISOString(),
      },
      {
        rank: 2,
        difficulty: 20.5,
        device: 'ESP32',
        timestamp: new Date(now.getTime() - 60000).toISOString(),
      },
    ];

    const fakeQuery = jest.fn(async (sql: string, params: any[]) => {
      expect(sql).toMatch(/top_best_diffs/);
      expect(sql).toMatch(/ORDER BY rank ASC/);
      expect(params.length).toBe(1);
      expect(params[0]).toBe(10);
      return fakeRows;
    });

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ query: fakeQuery } as any);

    const result = await getTopBestDiffs(10);

    expect(fakeQuery).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].difficulty).toBe(25.926);
    expect(result[0].device).toBe('NMMiner');
    expect(result[1].difficulty).toBe(20.5);
    expect(result[1].device).toBe('ESP32');
  });

  it('returns device as "Other" when null in database', async () => {
    const fakeRows = [
      {
        rank: 1,
        difficulty: 15.5,
        device: null,
        timestamp: new Date().toISOString(),
      },
    ];

    const fakeQuery = jest.fn(async () => fakeRows);

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ query: fakeQuery } as any);

    const result = await getTopBestDiffs(10);

    expect(result[0].device).toBe('Other');
  });

  it('respects the limit parameter', async () => {
    const fakeQuery = jest.fn(async (sql: string, params: any[]) => {
      expect(params[0]).toBe(5);
      return [];
    });

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ query: fakeQuery } as any);

    await getTopBestDiffs(5);

    expect(fakeQuery).toHaveBeenCalled();
  });
});
