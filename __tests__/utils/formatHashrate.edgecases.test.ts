import { formatHashrate } from '../../utils/helpers';

describe('formatHashrate edge cases', () => {
  it('zero variants should produce 0 H/s', () => {
    expect(formatHashrate('0', true)).toBe('0 H/s');
    expect(formatHashrate(0, true)).toBe('0 H/s');
    expect(formatHashrate(0n, true)).toBe('0 H/s');
    expect(formatHashrate('0.0', true)).toBe('0 H/s');
  });

  it('tiny fractional values should produce <1 H/s when requested', () => {
    expect(formatHashrate('0.5', true)).toBe('<1 H/s');
    expect(formatHashrate(0.5, true)).toBe('<1 H/s');
    expect(formatHashrate('0.0001', true)).toBe('<1 H/s');
  });

  it('tiny fractional values should show number when showLessThanOne is false', () => {
    expect(formatHashrate('0.5', false)).toBe('0.5 H/s');
    expect(formatHashrate(0.25, false)).toBe('0.25 H/s');
  });

  it('large values use ISO units', () => {
    expect(formatHashrate('1000', true)).toBe('1 kH/s');
    expect(formatHashrate('1500000', true)).toBe('1.5 MH/s');
  });
});
