import { TopUserDifficulty } from '../../../lib/types/dashboard';
import { testGeneratedAtField, testStaleDetection, testPayloadSize } from '../../testHelpers/asyncRefreshHookHelpers';

type TopDifficultiesPayload = {
  data: TopUserDifficulty[];
  generatedAt: string;
};

const mockPayload: TopDifficultiesPayload = {
  generatedAt: new Date().toISOString(),
  data: [
    {
      address: 'bc1q1234567890abcdef1234567890abcdef123456',
      workerCount: 5,
      difficulty: 50.0,
      bestShare: 45.5,
      hashrate1hr: 1000000,
      hashrate1d: 950000,
      hashrate7d: 900000,
    },
    {
      address: 'bc1qabcdef1234567890abcdef1234567890abcdef',
      workerCount: 3,
      difficulty: 48.0,
      bestShare: 43.0,
      hashrate1hr: 800000,
      hashrate1d: 750000,
      hashrate7d: 700000,
    },
  ],
};

describe('useTopDifficulties hook', () => {
  describe('TopDifficultiesPayload structure', () => {
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
      expect(entry).toHaveProperty('difficulty');
      expect(entry).toHaveProperty('bestShare');
      expect(entry).toHaveProperty('hashrate1hr');
      expect(entry).toHaveProperty('hashrate1d');
      expect(entry).toHaveProperty('hashrate7d');
    });

    test('difficulty values are numbers', () => {
      mockPayload.data.forEach((entry) => {
        expect(typeof entry.difficulty).toBe('number');
        expect(entry.difficulty).toBeGreaterThan(0);
      });
    });

    test('entries are sorted by difficulty descending', () => {
      for (let i = 0; i < mockPayload.data.length - 1; i++) {
        expect(mockPayload.data[i].difficulty).toBeGreaterThanOrEqual(
          mockPayload.data[i + 1].difficulty
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
      const largePayload: TopDifficultiesPayload = {
        ...mockPayload,
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            ...mockPayload.data[0],
            address: `bc1q${'0'.repeat(39 - i.toString().length)}${i}`,
            difficulty: 50 - i * 0.1,
          })),
      };

      const { sizeKb } = testPayloadSize(largePayload, 50);
      console.log(`TopDifficulties payload (100 entries): ${sizeKb.toFixed(2)} KB`);
    });
  });
});
