import { normalizeUserAgent } from '../../utils/helpers';

describe('normalizeUserAgent', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(normalizeUserAgent(undefined)).toBe('');
    expect(normalizeUserAgent('')).toBe('');
  });

  it('removes control characters but preserves Unicode', () => {
    expect(normalizeUserAgent('NerdOCTAXE-γ')).toBe('NerdOCTAXE-γ');
    expect(normalizeUserAgent('NerdOCTAXE-γ\x01\x02')).toBe('NerdOCTAXE-γ');
    expect(normalizeUserAgent('Nerd Miner/1.0')).toBe('Nerd Miner');
    expect(normalizeUserAgent('Nerd Miner 1.0')).toBe('Nerd Miner 1.0');
  });

  it('truncates to 256 Unicode code points (does not split surrogate pairs)', () => {
    const longName = 'A'.repeat(300) + 'γ';
    const result = normalizeUserAgent(longName);
    expect(Array.from(result).length).toBe(256);
    expect(result.startsWith('A'.repeat(256))).toBe(true);
    expect(result.endsWith('γ')).toBe(false); // truncated by code points
  });

  it('preserves Unicode at the end if within 256 code points', () => {
    const name = 'A'.repeat(255) + 'γ';
    const result = normalizeUserAgent(name);
    expect(Array.from(result).length).toBe(256);
    expect(result.endsWith('γ')).toBe(true);
  });

  it('preserves emoji, combining marks and NBSP', () => {
    expect(normalizeUserAgent('Miner🚀/v1')).toBe('Miner🚀');
    expect(normalizeUserAgent('e\u0301')).toBe('e\u0301'); // e + combining acute
    expect(normalizeUserAgent('Name\u00A0Test')).toBe('Name\u00A0Test'.split('/')[0].split(' ')[0]);
    expect(normalizeUserAgent('👩\u200D🔬/1')).toBe('👩\u200D🔬'); // ZWJ sequence
  });
});
