import { getTopUserDifficulties, getTopUserHashrates } from '../../lib/api';
import * as dbModule from '../../lib/db';

jest.mock('../../lib/db');

describe('Top User Leaderboards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTopUserDifficulties', () => {
    it('returns users sorted by bestEver (difficulty) in descending order', async () => {
      const fakeData = [
        {
          id: 1,
          userAddress: 'addr1',
          workerCount: 5,
          bestEver: 50.0,
          bestShare: 25.5,
          hashrate1hr: 1000000,
          hashrate1d: 950000,
          hashrate7d: 900000,
          timestamp: new Date('2025-01-31T12:00:00Z'),
        },
        {
          id: 2,
          userAddress: 'addr2',
          workerCount: 3,
          bestEver: 48.0,
          bestShare: 24.0,
          hashrate1hr: 800000,
          hashrate1d: 750000,
          hashrate7d: 700000,
          timestamp: new Date('2025-01-31T11:00:00Z'),
        },
      ];

      const chain = {
        innerJoin() {
          return this;
        },
        select() {
          return this;
        },
        where() {
          return this;
        },
        andWhere() {
          return this;
        },
        orderBy() {
          return this;
        },
        take() {
          return this;
        },
        async getMany() {
          return fakeData;
        },
      } as any;

      jest
        .spyOn(dbModule, 'getDb')
        .mockResolvedValue({
          getRepository: () => ({
            createQueryBuilder: () => chain,
          }),
        } as any);

      const result = await getTopUserDifficulties(10);

      expect(result).toHaveLength(2);
      expect(result[0].difficulty).toBe(50.0);
      expect(result[1].difficulty).toBe(48.0);
      expect(result[0].workerCount).toBe(5);
    });
  });

  describe('getTopUserHashrates', () => {
    it('returns users sorted by hashrate1hr in descending order', async () => {
      const fakeData = [
        {
          id: 1,
          userAddress: 'addr1',
          workerCount: 10,
          hashrate1hr: 5000000,
          hashrate1d: 4800000,
          hashrate7d: 4600000,
          bestShare: 100.0,
          bestEver: 45.0,
          timestamp: new Date('2025-01-31T12:00:00Z'),
        },
        {
          id: 2,
          userAddress: 'addr2',
          workerCount: 8,
          hashrate1hr: 4200000,
          hashrate1d: 4000000,
          hashrate7d: 3800000,
          bestShare: 80.0,
          bestEver: 42.0,
          timestamp: new Date('2025-01-31T11:00:00Z'),
        },
      ];

      const chain = {
        innerJoin() {
          return this;
        },
        select() {
          return this;
        },
        where() {
          return this;
        },
        andWhere() {
          return this;
        },
        orderBy() {
          return this;
        },
        take() {
          return this;
        },
        async getMany() {
          return fakeData;
        },
      } as any;

      jest
        .spyOn(dbModule, 'getDb')
        .mockResolvedValue({
          getRepository: () => ({
            createQueryBuilder: () => chain,
          }),
        } as any);

      const result = await getTopUserHashrates(10);

      expect(result).toHaveLength(2);
      expect(result[0].hashrate1hr).toBe(5000000);
      expect(result[1].hashrate1hr).toBe(4200000);
      expect(result[0].workerCount).toBe(10);
    });

    it('returns array of results with expected fields', async () => {
      const fakeData = [
        {
          id: 1,
          userAddress: 'addr1',
          workerCount: 5,
          hashrate1hr: 2000000,
          hashrate1d: 1900000,
          hashrate7d: 1800000,
          bestShare: 50.0,
          bestEver: 40.0,
          timestamp: new Date(),
        },
      ];

      const chain = {
        innerJoin() {
          return this;
        },
        select() {
          return this;
        },
        where() {
          return this;
        },
        andWhere() {
          return this;
        },
        orderBy() {
          return this;
        },
        take() {
          return this;
        },
        async getMany() {
          return fakeData;
        },
      } as any;

      jest
        .spyOn(dbModule, 'getDb')
        .mockResolvedValue({
          getRepository: () => ({
            createQueryBuilder: () => chain,
          }),
        } as any);

      const result = await getTopUserHashrates(10);

      expect(result[0]).toHaveProperty('address');
      expect(result[0]).toHaveProperty('workerCount');
      expect(result[0]).toHaveProperty('hashrate1hr');
      expect(result[0]).toHaveProperty('hashrate1d');
      expect(result[0]).toHaveProperty('bestEver');
    });
  });
});
