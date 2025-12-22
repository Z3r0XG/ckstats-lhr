import {
  getWorkerUserAgentDisplay,
  compareWorkerUserAgentStrings,
} from '../../utils/helpers';

describe('getWorkerUserAgentDisplay', () => {
  it('returns the raw user agent when it is non-empty', () => {
    expect(getWorkerUserAgentDisplay('Nerd Miner/1.0')).toBe('Nerd Miner/1.0');
    expect(getWorkerUserAgentDisplay('  Miner/1.0  ')).toBe('  Miner/1.0  ');
  });

  it('returns N/A for null or undefined values', () => {
    expect(getWorkerUserAgentDisplay(null)).toBe('N/A');
    expect(getWorkerUserAgentDisplay(undefined)).toBe('N/A');
  });

  it('returns N/A for values that are whitespace only', () => {
    expect(getWorkerUserAgentDisplay('   ')).toBe('N/A');
  });
});

describe('compareWorkerUserAgentStrings', () => {
  it('treats trimmed values as equal', () => {
    expect(compareWorkerUserAgentStrings('foo', 'foo ')).toBe(0);
  });

  it('orders empty/unspecified strings before actual content', () => {
    expect(compareWorkerUserAgentStrings('', 'miner')).toBe(-1);
    expect(compareWorkerUserAgentStrings(null, 'miner')).toBe(-1);
  });

  it('falls back to standard string ordering when both values exist', () => {
    expect(compareWorkerUserAgentStrings('alpha', 'beta')).toBe(-1);
    expect(compareWorkerUserAgentStrings('beta', 'alpha')).toBe(1);
  });
});
