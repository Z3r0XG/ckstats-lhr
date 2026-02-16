import { getTopUserLoyalty } from '../../lib/api';
import * as dbModule from '../../lib/db';

describe('getTopUserLoyalty', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns users ordered by earliest authorised timestamp (ascending)', async () => {
    const fakeRows = [
      { userStats_userAddress: 'addr2', userStats_workerCount: 1, userStats_hashrate1hr: 0, userStats_hashrate1d: 0, userStats_hashrate7d: 0, userStats_bestShare: 0, userStats_shares: 200, userStats_timestamp: 0, user_authorised: '1000' },
      { userStats_userAddress: 'addr1', userStats_workerCount: 1, userStats_hashrate1hr: 0, userStats_hashrate1d: 0, userStats_hashrate7d: 0, userStats_bestShare: 0, userStats_shares: 100, userStats_timestamp: 0, user_authorised: '2000' },
      { userStats_userAddress: 'addr3', userStats_workerCount: 1, userStats_hashrate1hr: 0, userStats_hashrate1d: 0, userStats_hashrate7d: 0, userStats_bestShare: 0, userStats_shares: 300, userStats_timestamp: 0, user_authorised: '3000' },
    ];

    const calls = {
      orderBy: null as { field: string; direction: string } | null,
      limit: null as number | null,
    };

    const chain = {
      innerJoin() { return this; },
      select() { return this; },
      where() { return this; },
      andWhere() { return this; },
      orderBy(field: string, direction: string) {
        calls.orderBy = { field, direction };
        return this;
      },
      take() { return this; },
      limit(value: number) {
        calls.limit = value;
        return this;
      },
      async getRawMany() { return fakeRows; },
    } as any;
    const fakeCreate = jest.fn(() => chain);

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ getRepository: () => ({ createQueryBuilder: fakeCreate }) } as any);

    const res = await getTopUserLoyalty(10);

    // Verify query building
    expect(calls.orderBy).toEqual({ field: 'user.authorised', direction: 'ASC' });
    expect(calls.limit).toBe(10);

    // Verify results
    expect(res).toHaveLength(3);
    expect(res[0].address).toBe('addr2');
    expect(res[0].authorised).toBe(1000);
    expect(res[0].workerCount).toBe(1);
    expect(res[0].hashrate1hr).toBe(0);
    expect(res[0].shares).toBe(200);
    expect(res[0].bestShare).toBe(0);
    expect(res[1].address).toBe('addr1');
    expect(res[2].address).toBe('addr3');
  });

  it('respects limit and filters out users with authorised <= 0', async () => {
    const fakeRows = [
      { userStats_userAddress: 'addr1', userStats_workerCount: 1, userStats_hashrate1hr: 0, userStats_hashrate1d: 0, userStats_hashrate7d: 0, userStats_bestShare: 0, userStats_shares: 100, userStats_timestamp: 0, user_authorised: '2000' },
      { userStats_userAddress: 'addr3', userStats_workerCount: 1, userStats_hashrate1hr: 0, userStats_hashrate1d: 0, userStats_hashrate7d: 0, userStats_bestShare: 0, userStats_shares: 300, userStats_timestamp: 0, user_authorised: '3000' },
    ];

    const calls = { limit: null as number | null };

    const chain = {
      innerJoin() { return this; },
      select() { return this; },
      where() { return this; },
      andWhere() { return this; },
      orderBy() { return this; },
      take() { return this; },
      limit(value: number) {
        calls.limit = value;
        return this;
      },
      async getRawMany() { return fakeRows; },
    } as any;
    const fakeCreate = jest.fn(() => chain);

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({ getRepository: () => ({ createQueryBuilder: fakeCreate }) } as any);

    const res = await getTopUserLoyalty(2);

    // Verify limit was applied
    expect(calls.limit).toBe(2);

    // Verify filtering: only users with authorised > 0 are returned (SQL filters out authorised <= 0)
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.authorised)).toEqual([2000, 3000]);
    expect(res.every((r) => r.authorised > 0)).toBe(true);
  });

  it('sanitizes negative limit to 1', async () => {
    const calls = { limit: null as number | null };
    const chain = {
      innerJoin() { return this; },
      select() { return this; },
      where() { return this; },
      andWhere() { return this; },
      orderBy() { return this; },
      take() { return this; },
      limit(value: number) { calls.limit = value; return this; },
      async getRawMany() { return []; },
    } as any;

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({
      getRepository: () => ({ createQueryBuilder: () => chain }),
    } as any);

    await getTopUserLoyalty(-10);
    expect(calls.limit).toBe(1);
  });

  it('sanitizes float limit by flooring', async () => {
    const calls = { limit: null as number | null };
    const chain = {
      innerJoin() { return this; },
      select() { return this; },
      where() { return this; },
      andWhere() { return this; },
      orderBy() { return this; },
      take() { return this; },
      limit(value: number) { calls.limit = value; return this; },
      async getRawMany() { return []; },
    } as any;

    jest.spyOn(dbModule, 'getDb').mockResolvedValue({
      getRepository: () => ({ createQueryBuilder: () => chain }),
    } as any);

    await getTopUserLoyalty(7.8);
    expect(calls.limit).toBe(7);
  });
});