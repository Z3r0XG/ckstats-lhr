import { convertHashrateFloat, convertHashrate } from '../../utils/helpers';

describe('convertHashrateFloat', () => {
  test('parses micro (u) and unicode µ correctly', () => {
    expect(convertHashrateFloat('370u')).toBeCloseTo(0.00037);
    expect(convertHashrateFloat('939u')).toBeCloseTo(0.000939);
    expect(convertHashrateFloat('2µ')).toBeCloseTo(2e-6);
  });

  test('parses milli (m) vs mega (M) correctly', () => {
    expect(convertHashrateFloat('370m')).toBeCloseTo(0.37);
    expect(convertHashrateFloat('370M')).toBeCloseTo(370_000_000);
  });

  test('parses plain numbers and decimals', () => {
    expect(convertHashrateFloat('0')).toBeCloseTo(0);
    expect(convertHashrateFloat('1.23M')).toBeCloseTo(1_230_000);
    expect(convertHashrateFloat('123')).toBeCloseTo(123);
  });
});

describe('convertHashrate (bigint)', () => {
  test('returns BigInt for large units and 0 for sub-1 values', () => {
    expect(convertHashrate('370M').toString()).toBe('370000000');
    // micro values below 1 H/s should round to 0 for bigint conversion
    expect(convertHashrate('370u').toString()).toBe('0');
    expect(convertHashrate('1.5k').toString()).toBe('1500');
  });
});
import { convertHashrate } from '../../utils/helpers';

describe('convertHashrate edge cases', () => {
  it('treats values smaller than 1 H/s as 0', () => {
    expect(convertHashrate('0.5')).toBe(BigInt(0));
    expect(convertHashrate('0.9')).toBe(BigInt(0));
  });

  it('parses scientific notation correctly', () => {
    expect(convertHashrate('1e3')).toBe(BigInt(1000));
    expect(convertHashrate('1.5e3')).toBe(BigInt(1500));
    expect(convertHashrate('1e-1')).toBe(BigInt(0));
    expect(convertHashrate('2.3e6')).toBe(BigInt(2300000));
  });

  it('handles large values without overflow', () => {
    const v = '9007199254740991';
    expect(convertHashrate(v)).toBe(BigInt(v));
  });
});
