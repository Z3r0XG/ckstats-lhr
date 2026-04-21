/**
 * @jest-environment node
 */

import { getWorkerWithStats, cacheDelete } from '../../lib/api';
import * as dbModule from '../../lib/db';

describe('getWorkerWithStats — exact name lookup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockDb(findOneResult: any) {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(findOneResult),
    };
    jest.spyOn(dbModule, 'getDb').mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(mockRepo),
    } as any);
    return mockRepo;
  }

  it('passes worker name to DB without trimming', async () => {
    const spacedName = ' BiTaXe';
    const address = 'bc1qtestaddress';

    cacheDelete(`workerWithStats:${address}:${spacedName}`);
    const repo = mockDb(null);

    await getWorkerWithStats(address, spacedName);

    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: spacedName }),
      })
    );
  });

  it('sorts returned worker stats by timestamp descending', async () => {
    const address = 'bc1qtestaddress2';
    const name = 'BiTaXe';

    cacheDelete(`workerWithStats:${address}:${name}`);

    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-01-02T00:00:00Z');
    const t3 = new Date('2024-01-03T00:00:00Z');
    const worker = {
      id: 1,
      name,
      userAddress: address,
      stats: [
        { timestamp: t1 },
        { timestamp: t3 },
        { timestamp: t2 },
      ],
    };
    mockDb(worker);

    const result = await getWorkerWithStats(address, name);

    expect(result!.stats.map((s) => s.timestamp)).toEqual([t3, t2, t1]);
  });

  it('returns null when worker does not exist', async () => {
    const address = 'bc1qtestaddress4';
    const name = 'nonexistent';

    cacheDelete(`workerWithStats:${address}:${name}`);
    mockDb(null);

    const result = await getWorkerWithStats(address, name);
    expect(result).toBeNull();
  });
});
