import { calculateBackoff } from '../../../lib/hooks/queryHelpers';

describe('calculateBackoff', () => {
  const BASE_INTERVAL = 60_000; // 60 seconds
  const MAX_INTERVAL = 120_000; // 120 seconds

  test('first attempt returns base interval', () => {
    expect(calculateBackoff(1, BASE_INTERVAL, MAX_INTERVAL)).toBe(60_000);
  });

  test('second attempt doubles the interval', () => {
    expect(calculateBackoff(2, BASE_INTERVAL, MAX_INTERVAL)).toBe(120_000);
  });

  test('third attempt is capped at max interval', () => {
    // Would be 240s (60 * 2^2) but capped at 120s
    expect(calculateBackoff(3, BASE_INTERVAL, MAX_INTERVAL)).toBe(120_000);
  });

  test('fourth attempt is still capped at max interval', () => {
    // Would be 480s (60 * 2^3) but capped at 120s
    expect(calculateBackoff(4, BASE_INTERVAL, MAX_INTERVAL)).toBe(120_000);
  });

  test('handles edge case: zero attempts returns base interval', () => {
    // 2^(-1) = 0.5, so 60000 * 0.5 = 30000
    expect(calculateBackoff(0, BASE_INTERVAL, MAX_INTERVAL)).toBe(30_000);
  });

  test('works with different base intervals', () => {
    expect(calculateBackoff(1, 30_000, 120_000)).toBe(30_000);
    expect(calculateBackoff(2, 30_000, 120_000)).toBe(60_000);
    expect(calculateBackoff(3, 30_000, 120_000)).toBe(120_000);
  });

  test('respects different max intervals', () => {
    expect(calculateBackoff(1, 60_000, 60_000)).toBe(60_000);
    expect(calculateBackoff(2, 60_000, 60_000)).toBe(60_000); // Capped at max
    expect(calculateBackoff(3, 60_000, 240_000)).toBe(240_000);
  });

  test('exponential growth follows 2^(n-1) pattern', () => {
    const base = 10_000;
    const max = 1_000_000;

    expect(calculateBackoff(1, base, max)).toBe(10_000); // 10 * 2^0
    expect(calculateBackoff(2, base, max)).toBe(20_000); // 10 * 2^1
    expect(calculateBackoff(3, base, max)).toBe(40_000); // 10 * 2^2
    expect(calculateBackoff(4, base, max)).toBe(80_000); // 10 * 2^3
    expect(calculateBackoff(5, base, max)).toBe(160_000); // 10 * 2^4
  });
});
