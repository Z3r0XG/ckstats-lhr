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

  it('does not find a trimmed worker when looking up a spaced name', async () => {
    const spacedName = ' BiTaXe';
    const address = 'bc1qtestaddress2';

    cacheDelete(`workerWithStats:${address}:${spacedName}`);

    const trimmedWorker = { id: 1, name: 'BiTaXe', userAddress: address, stats: [] };
    const repo = mockDb(trimmedWorker);

    const result = await getWorkerWithStats(address, spacedName);

    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: spacedName }),
      })
    );
    expect(result).toBe(trimmedWorker);
  });

  it('finds a worker whose name has a trailing space exactly', async () => {
    const trailingName = 'AO1 ';
    const address = 'bc1qtestaddress3';

    cacheDelete(`workerWithStats:${address}:${trailingName}`);

    const worker = { id: 2, name: trailingName, userAddress: address, stats: [] };
    const repo = mockDb(worker);

    const result = await getWorkerWithStats(address, trailingName);

    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: trailingName }),
      })
    );
    expect(result).toBe(worker);
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
