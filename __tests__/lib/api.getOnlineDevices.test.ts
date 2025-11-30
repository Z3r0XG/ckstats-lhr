import { getOnlineDevices } from '../../lib/api';
import * as dbModule from '../../lib/db';

describe('getOnlineDevices', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries Worker.lastUpdate and returns correct aggregated values', async () => {
    const fakeRows = [
      {
        client: 'NMMiner',
        activeworkers: '8',
        uniqueusers: '4',
        totalhashrate1hr: '123456',
        bestever: '725.5',
      },
    ];

    const fakeQuery = jest.fn(async (sql: string, params: any[]) => {
      // Assert SQL references lastUpdate, i.e. authoritative lastshare timestamp
      expect(sql).toMatch(/lastUpdate/);
      expect(params.length).toBeGreaterThanOrEqual(1);
      // return rows as if from db
      return fakeRows;
    });

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ query: fakeQuery } as any);

    const result = await getOnlineDevices(10, { windowMinutes: 60 });

    expect(fakeQuery).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].client).toBe('NMMiner');
    expect(result[0].activeWorkers).toBe(8);
    expect(result[0].hashrate1hr).toBe(123456);
    expect(result[0].bestEver).toBe(725.5);
  });
});
