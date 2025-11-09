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
