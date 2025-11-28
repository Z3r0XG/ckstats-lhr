import { computeRejectedPercent } from '../utils/helpers';

describe('computeRejectedPercent', () => {
  test('zero total returns null/ N/A and base color', () => {
    const res = computeRejectedPercent(0, 0);
    expect(res.pct).toBeNull();
    expect(res.formatted).toBeNull();
    expect(res.color).toBe('text-base-content');
  });

  test('below 0.5% => success color', () => {
    // 1 rejected / 1000 total => 0.10%
    const res = computeRejectedPercent(999, 1);
    expect(res.formatted).toBe('0.10%');
    expect(res.color).toBe('text-success');
  });

  test('exactly 0.5% => success color', () => {
    // 50 / 10000 = 0.50%
    const res = computeRejectedPercent(9950, 50);
    expect(res.formatted).toBe('0.50%');
    expect(res.color).toBe('text-success');
  });

  test('between 0.5% and 1% => warning color', () => {
    // 75 / 10000 = 0.75%
    const res = computeRejectedPercent(9925, 75);
    expect(res.formatted).toBe('0.75%');
    expect(res.color).toBe('text-warning');
  });

  test('above 1% => error color and rounding', () => {
    // 100 / 9100 = ~1.0989 -> formatted 1.10%
    const res = computeRejectedPercent(9000, 100);
    expect(res.formatted).toBe('1.10%');
    expect(res.color).toBe('text-error');
  });

  test('handles BigInt inputs and correct color at 1.00%', () => {
    const bigA = BigInt('1000000000000000000000000');
    const bigR = BigInt('10000000000000000000000'); // equals 1% of bigA
    const res = computeRejectedPercent(bigA, bigR);
    // rejected/(accepted+rejected) for these values ~= 0.990099% -> rounds to 0.99%
    expect(res.formatted).toBe('0.99%');
    expect(res.color).toBe('text-warning');
  });
});
