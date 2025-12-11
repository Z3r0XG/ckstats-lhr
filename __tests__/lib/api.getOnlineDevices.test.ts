import { getOnlineDevices } from '../../lib/api';
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
        total_hashrate1hr: '123456',
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
