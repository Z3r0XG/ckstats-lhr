import { TopUserHashrate } from '../../../lib/types/dashboard';
import { testGeneratedAtField, testStaleDetection, testPayloadSize } from '../../testHelpers/asyncRefreshHookHelpers';

type TopHashratesPayload = {
  data: TopUserHashrate[];
  generatedAt: string;
};

const mockPayload: TopHashratesPayload = {
  generatedAt: new Date().toISOString(),
  data: [
    {
      address: 'bc1q1234567890abcdef1234567890abcdef123456',
      workerCount: 10,
      hashrate1hr: 5000000,
      hashrate1d: 4800000,
      hashrate7d: 4600000,
      bestShare: 50.0,
      bestEver: 55.0,
    },
    {
      address: 'bc1qabcdef1234567890abcdef1234567890abcdef',
      workerCount: 8,
      hashrate1hr: 4200000,
      hashrate1d: 4000000,
      hashrate7d: 3800000,
      bestShare: 45.0,
      bestEver: 48.0,
    },
  ],
};

describe('useTopHashrates hook', () => {
  describe('TopHashratesPayload structure', () => {
    test('has required top-level fields', () => {
      expect(mockPayload).toHaveProperty('data');
      expect(mockPayload).toHaveProperty('generatedAt');
      expect(Array.isArray(mockPayload.data)).toBe(true);
    });

    test('generatedAt is valid ISO timestamp', () => {
      testGeneratedAtField(mockPayload);
    });

    test('data entries have required fields', () => {
      const entry = mockPayload.data[0];
      expect(entry).toHaveProperty('address');
      expect(entry).toHaveProperty('workerCount');
      expect(entry).toHaveProperty('hashrate1hr');
      expect(entry).toHaveProperty('hashrate1d');
      expect(entry).toHaveProperty('hashrate7d');
      expect(entry).toHaveProperty('bestShare');
      expect(entry).toHaveProperty('bestEver');
    });

    test('hashrate values are numbers', () => {
      mockPayload.data.forEach((entry) => {
        expect(typeof entry.hashrate1hr).toBe('number');
        expect(entry.hashrate1hr).toBeGreaterThanOrEqual(0);
      });
    });

    test('entries are sorted by hashrate1hr descending', () => {
      for (let i = 0; i < mockPayload.data.length - 1; i++) {
        expect(mockPayload.data[i].hashrate1hr).toBeGreaterThanOrEqual(
          mockPayload.data[i + 1].hashrate1hr
        );
      }
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
    test('payload with 100 entries is under 50 KB', () => {
      const largePayload: TopHashratesPayload = {
        ...mockPayload,
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            ...mockPayload.data[0],
            address: `bc1q${'0'.repeat(39 - i.toString().length)}${i}`,
            hashrate1hr: 5000000 - i * 10000,
          })),
      };

      const { sizeKb } = testPayloadSize(largePayload, 50);
      console.log(`TopHashrates payload (100 entries): ${sizeKb.toFixed(2)} KB`);
    });
  });
});
