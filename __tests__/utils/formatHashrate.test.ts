import { formatHashrate } from '../../utils/helpers';

describe('formatHashrate', () => {
  it('renders 0 H/s for exact zero even when showLessThanOne is true', () => {
    expect(formatHashrate(0, true)).toBe('0 H/s');
    expect(formatHashrate('0', true)).toBe('0 H/s');
  });

  it('renders 0 H/s when showLessThanOne is false', () => {
    expect(formatHashrate(0)).toBe('0 H/s');
  });

  it('renders large values with units', () => {
    expect(formatHashrate(1500)).toContain('kH/s');
  });
});
