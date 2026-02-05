import { UserDataPayload } from '../../../lib/types/user';
import { 
  testGeneratedAtField, 
  testStaleDetection, 
  expectBigIntSerialized, 
  expectDateSerialized,
  testPayloadSize 
} from '../../testHelpers/asyncRefreshHookHelpers';

const mockPayload: UserDataPayload = {
  generatedAt: new Date().toISOString(),
  user: {
    address: 'bc1q1234567890abcdef1234567890abcdef123456',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    authorised: '1000000',
    isActive: true,
    isPublic: true,
    workers: [
      {
        id: 1,
        name: 'worker1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hashrate1m: 1000000,
        hashrate5m: 950000,
        hashrate1hr: 900000,
        hashrate1d: 850000,
        hashrate7d: 800000,
        lastUpdate: new Date().toISOString(),
        shares: '50000',
        bestShare: 45.5,
        bestEver: 50.0,
        userAddress: 'bc1q1234567890abcdef1234567890abcdef123456',
        userAgent: 'CGMiner/4.10.0',
        userAgentRaw: 'CGMiner/4.10.0',
        latestStats: {
          id: 1,
          workerId: 1,
          hashrate1m: 1000000,
          hashrate5m: 950000,
          hashrate1hr: 900000,
          hashrate1d: 850000,
          hashrate7d: 800000,
          started: '10000',
          shares: '50000',
          bestShare: 45.5,
          bestEver: 50.0,
          timestamp: new Date().toISOString(),
        },
      },
    ],
    stats: [
      {
        id: 1,
        userAddress: 'bc1q1234567890abcdef1234567890abcdef123456',
        hashrate1m: 1000000,
        hashrate5m: 950000,
        hashrate1hr: 900000,
        hashrate1d: 850000,
        hashrate7d: 800000,
        lastShare: '5000',
        workerCount: 1,
        shares: '50000',
        bestShare: 45.5,
        bestEver: 50.0,
        timestamp: new Date().toISOString(),
      },
    ],
  },
  poolStats: {
    id: 1,
    users: 100,
    workers: 200,
    hashrate1m: 10000000,
    hashrate5m: 9500000,
    hashrate15m: 9000000,
    hashrate1hr: 8500000,
    hashrate6hr: 8000000,
    hashrate1d: 7500000,
    hashrate7d: 7000000,
    SPS1m: 100,
    SPS5m: 95,
    SPS15m: 90,
    SPS1h: 85,
    accepted: '100000',
    rejected: '5000',
    bestshare: 55.0,
    diff: 0.01,
    disconnected: 5,
    idle: 10,
    runtime: 86400,
    timestamp: new Date().toISOString(),
  },
  historicalStats: [
    {
      id: 1,
      userAddress: 'bc1q1234567890abcdef1234567890abcdef123456',
      hashrate1m: 1000000,
      hashrate5m: 950000,
      hashrate1hr: 900000,
      hashrate1d: 850000,
      hashrate7d: 800000,
      lastShare: '5000',
      workerCount: 1,
      shares: '50000',
      bestShare: 45.5,
      bestEver: 50.0,
      timestamp: new Date().toISOString(),
    },
  ],
};

describe('useUserData hook', () => {
  describe('UserDataPayload structure', () => {
    test('has required top-level fields', () => {
      expect(mockPayload).toHaveProperty('user');
      expect(mockPayload).toHaveProperty('poolStats');
      expect(mockPayload).toHaveProperty('historicalStats');
      expect(mockPayload).toHaveProperty('generatedAt');
    });

    test('generatedAt is valid ISO timestamp', () => {
      testGeneratedAtField(mockPayload);
    });

    test('user has required fields', () => {
      const { user } = mockPayload;
      expect(user).toHaveProperty('address');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('updatedAt');
      expect(user).toHaveProperty('authorised');
      expect(user).toHaveProperty('workers');
      expect(user).toHaveProperty('stats');
      expect(user).toHaveProperty('isActive');
      expect(user).toHaveProperty('isPublic');
    });

    test('user.authorised is serialized bigint (string)', () => {
      expectBigIntSerialized(mockPayload.user.authorised);
    });

    test('user date fields are serialized ISO strings', () => {
      expectDateSerialized(mockPayload.user.createdAt);
      expectDateSerialized(mockPayload.user.updatedAt);
    });
  });

  describe('Worker serialization', () => {
    test('worker has all required fields', () => {
      const worker = mockPayload.user.workers[0];
      expect(worker).toHaveProperty('id');
      expect(worker).toHaveProperty('name');
      expect(worker).toHaveProperty('createdAt');
      expect(worker).toHaveProperty('updatedAt');
      expect(worker).toHaveProperty('hashrate1m');
      expect(worker).toHaveProperty('lastUpdate');
      expect(worker).toHaveProperty('shares');
      expect(worker).toHaveProperty('bestShare');
      expect(worker).toHaveProperty('bestEver');
      expect(worker).toHaveProperty('userAgent');
      expect(worker).toHaveProperty('latestStats');
    });

    test('worker.shares is serialized bigint (string)', () => {
      expectBigIntSerialized(mockPayload.user.workers[0].shares);
    });

    test('worker date fields are serialized ISO strings', () => {
      const worker = mockPayload.user.workers[0];
      expectDateSerialized(worker.createdAt);
      expectDateSerialized(worker.updatedAt);
      expectDateSerialized(worker.lastUpdate);
    });

    test('worker.latestStats has required fields when present', () => {
      const stats = mockPayload.user.workers[0].latestStats!;
      expect(stats).toHaveProperty('workerId');
      expect(stats).toHaveProperty('hashrate1m');
      expect(stats).toHaveProperty('started');
      expect(stats).toHaveProperty('shares');
      expect(stats).toHaveProperty('bestShare');
      expect(stats).toHaveProperty('timestamp');
    });

    test('worker.latestStats bigints are serialized (strings)', () => {
      const stats = mockPayload.user.workers[0].latestStats!;
      expectBigIntSerialized(stats.started);
      expectBigIntSerialized(stats.shares);
    });

    test('worker.latestStats.timestamp is serialized ISO string', () => {
      const stats = mockPayload.user.workers[0].latestStats!;
      expectDateSerialized(stats.timestamp);
    });
  });

  describe('UserStats serialization', () => {
    test('userStats has all required fields', () => {
      const stats = mockPayload.user.stats[0];
      expect(stats).toHaveProperty('userAddress');
      expect(stats).toHaveProperty('hashrate1m');
      expect(stats).toHaveProperty('lastShare');
      expect(stats).toHaveProperty('workerCount');
      expect(stats).toHaveProperty('shares');
      expect(stats).toHaveProperty('bestShare');
      expect(stats).toHaveProperty('bestEver');
      expect(stats).toHaveProperty('timestamp');
    });

    test('userStats bigints are serialized (strings)', () => {
      const stats = mockPayload.user.stats[0];
      expectBigIntSerialized(stats.lastShare);
      expectBigIntSerialized(stats.shares);
    });

    test('userStats.timestamp is serialized ISO string', () => {
      expectDateSerialized(mockPayload.user.stats[0].timestamp);
    });
  });

  describe('Stale detection', () => {
    test('detects stale vs fresh data based on 2× refresh interval', () => {
      testStaleDetection((ageMs) => ({
        ...mockPayload,
        generatedAt: new Date(ageMs).toISOString(),
      }));
    });
  });

  describe('Payload size', () => {
    test('payload with typical user data is under 100 KB', () => {
      const { sizeKb } = testPayloadSize(mockPayload, 100);
      console.log(`UserData payload (1 worker, 1 stat): ${sizeKb.toFixed(2)} KB`);
    });

    test('payload with multiple workers and historical stats is reasonable', () => {
      const largePayload: UserDataPayload = {
        ...mockPayload,
        user: {
          ...mockPayload.user,
          workers: Array(10)
            .fill(null)
            .map((_, i) => ({
              ...mockPayload.user.workers[0],
              id: i,
              name: `worker${i}`,
            })),
        },
        historicalStats: Array(288)
          .fill(null)
          .map((_, i) => ({
            ...mockPayload.user.stats[0],
            id: i,
          })),
      };

      const { sizeKb } = testPayloadSize(largePayload, 500);
      console.log(
        `UserData payload (10 workers, 288 historical): ${sizeKb.toFixed(2)} KB`
      );
    });
  });
});
