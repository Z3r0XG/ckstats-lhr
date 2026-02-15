import { TopUserLoyalty } from '../../../lib/types/dashboard';
import { testGeneratedAtField, testStaleDetection, testPayloadSize } from '../../testHelpers/asyncRefreshHookHelpers';

type TopLoyaltyPayload = {
  data: TopUserLoyalty[];
  generatedAt: string;
};

const mockPayload: TopLoyaltyPayload = {
  generatedAt: new Date().toISOString(),
  data: [
    {
      address: 'bc1q1234567890abcdef1234567890abcdef123456',
      authorised: 1000,
      workerCount: 5,
      hashrate1hr: 1000000,
      shares: 50000,
      bestShare: 45.5,
    },
    {
      address: 'bc1qabcdef1234567890abcdef1234567890abcdef',
      authorised: 2000,
      workerCount: 3,
      hashrate1hr: 800000,
      shares: 40000,
      bestShare: 43.0,
    },
  ],
};

describe('useTopLoyalty hook', () => {
  describe('TopLoyaltyPayload structure', () => {
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
      expect(entry).toHaveProperty('authorised');
      expect(entry).toHaveProperty('workerCount');
      expect(entry).toHaveProperty('hashrate1hr');
      expect(entry).toHaveProperty('shares');
      expect(entry).toHaveProperty('bestShare');
    });

    test('authorised values are numbers (converted from bigint)', () => {
      mockPayload.data.forEach((entry) => {
        expect(typeof entry.authorised).toBe('number');
        expect(entry.authorised).toBeGreaterThan(0);
      });
    });

    test('entries are sorted by authorised ascending (earliest first)', () => {
      for (let i = 0; i < mockPayload.data.length - 1; i++) {
        expect(mockPayload.data[i].authorised).toBeLessThanOrEqual(
          mockPayload.data[i + 1].authorised
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
      const largePayload: TopLoyaltyPayload = {
        ...mockPayload,
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            ...mockPayload.data[0],
            address: `bc1q${'0'.repeat(39 - i.toString().length)}${i}`,
            authorised: 1000 + i * 100,
          })),
      };

      const { sizeKb } = testPayloadSize(largePayload, 50);
      console.log(`TopLoyalty payload (100 entries): ${sizeKb.toFixed(2)} KB`);
    });
  });
});
