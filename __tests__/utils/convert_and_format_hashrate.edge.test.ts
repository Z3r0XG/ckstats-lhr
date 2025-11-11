import { convertHashrate, formatHashrate } from '../../utils/helpers';

describe('convertHashrate & formatHashrate - edge cases', () => {
  test('convertHashrate handles decimals, sub-unit and malformed inputs', () => {
    expect(convertHashrate('0.5')).toBe(BigInt(0));
    expect(convertHashrate('0.999')).toBe(BigInt(0));
    expect(convertHashrate('0.5K')).toBe(BigInt(500));
    expect(convertHashrate('1.234K')).toBe(BigInt(1234));
    expect(convertHashrate('1e-3')).toBe(BigInt(0));
    expect(convertHashrate('abc')).toBe(BigInt(0));
  });

  test('convertHashrate preserves very large integer strings via BigInt path', () => {
    const big = '900719925474099312345';
    expect(convertHashrate(big)).toBe(BigInt(big));
  });

  test('formatHashrate floors sub-1 values to 0 H/s', () => {
    expect(formatHashrate('0')).toBe('0 H/s');
    expect(formatHashrate('0.5')).toBe('0 H/s');
    expect(formatHashrate(0)).toBe('0 H/s');
  });

  test('formatHashrate formats decimals and large units', () => {
    // 1.234K -> 1234 -> 1.23 kH/s
    expect(formatHashrate('1.234K')).toMatch(/^1\.23\s?kH\/s$/);

    // Very large number should end with a recognized unit (e.g., ZH/s)
    const huge = '1000000000000000000000000'; // 1e24
    expect(formatHashrate(huge)).toMatch(/ZH\/s$/);
  });
});
