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
    expect(normalizeUserAgent('Miner\u0085Name')).toBe('MinerName'); // C1 control (NEL) stripped
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
    expect(normalizeUserAgent('Name\u00A0Test')).toBe('Name\u00A0Test'); // NBSP is not a word boundary
    expect(normalizeUserAgent('👩\u200D🔬/1')).toBe('👩\u200D🔬'); // ZWJ sequence
  });

  // Rule 1 – slash/paren/pipe stop
  it('Rule 1: truncates at first /, (, or |', () => {
    expect(normalizeUserAgent('SomeMiner(v2)')).toBe('SomeMiner');
    expect(normalizeUserAgent('Miner(build123)/extra')).toBe('Miner');
    expect(normalizeUserAgent('Antminer S19k Pro|LUXminer 2026.3.30.174759-b99dff377|BHB56902|BHB56902|BHB56902|altair_tech')).toBe('Antminer S19k Pro');
    expect(normalizeUserAgent('SomeMiner|FirmwareName|chipX')).toBe('SomeMiner');
  });

  // Rule 2 – BM chip suffix strip
  it('Rule 2: strips trailing BM chip suffix (space or dash separator, uppercase only)', () => {
    expect(normalizeUserAgent('LuckyMiner BM1366')).toBe('LuckyMiner');
    expect(normalizeUserAgent('LuckyMiner-BM1366')).toBe('LuckyMiner');
    expect(normalizeUserAgent('Miner BM1397')).toBe('Miner');
    // bare "-BM" / " BM" with no digits must NOT be stripped
    expect(normalizeUserAgent('FooMiner-BM')).toBe('FooMiner-BM');
    expect(normalizeUserAgent('FooMiner BM')).toBe('FooMiner BM');
    // no separator before BM must NOT be stripped
    expect(normalizeUserAgent('SomeMinerBM1366')).toBe('SomeMinerBM1366');
    // standalone chip model must NOT be stripped
    expect(normalizeUserAgent('BM1366')).toBe('BM1366');
    // lowercase bm must NOT be stripped
    expect(normalizeUserAgent('FooMiner-bm1366')).toBe('FooMiner-bm1366');
    // NBSP separator must NOT be stripped (only ASCII space or hyphen match)
    expect(normalizeUserAgent('FooMiner\u00A0BM1366')).toBe('FooMiner\u00A0BM1366');
    // slash-based BM already handled by Rule 1
    expect(normalizeUserAgent('LuckyMiner/BM1366/1.2.0')).toBe('LuckyMiner');
    expect(normalizeUserAgent('NerdQAxe++/BM1370/v1.0.36')).toBe('NerdQAxe++');
    expect(normalizeUserAgent('bitaxe/BM1370/v2.13.0')).toBe('bitaxe');
    // Rule 2 fires before Rule 3: cpuminer-BM1366 -> cpuminer
    expect(normalizeUserAgent('cpuminer-BM1366')).toBe('cpuminer');
  });

  // Rule 3 – bosminer family collapse
  it('Rule 3: collapses bosminer family to "bosminer"', () => {
    // full UA from PR description
    expect(normalizeUserAgent('2026-02-13-0-db69f9bc-26.01-plus;bosminer-plus-tuner 0.9.0-db69f9bc')).toBe('bosminer');
    expect(normalizeUserAgent('bosminer-plus-tuner 0.9.0')).toBe('bosminer');
    expect(normalizeUserAgent('bosminer-tuner')).toBe('bosminer');
    expect(normalizeUserAgent('bosminer')).toBe('bosminer');
    expect(normalizeUserAgent('BOSminer/1.0')).toBe('bosminer');
  });

  // Rule 4 – cpuminer family collapse
  it('Rule 4: collapses cpuminer family, preserves input casing, does not match cpuminers-*', () => {
    expect(normalizeUserAgent('cpuminer-2.5.1')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer-multi/1.3.7')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer-opt/3.8.4')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer-opt-v2.5.0')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer_gc3355/3.0')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer/2.5.1')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer')).toBe('cpuminer');
    expect(normalizeUserAgent('cpuminer-multi (linux)')).toBe('cpuminer');
    // preserves input casing
    expect(normalizeUserAgent('CPUMiner')).toBe('CPUMiner');
    expect(normalizeUserAgent('CPUMINER-multi')).toBe('CPUMINER');
    // cpuminers-* is a distinct product and must NOT collapse
    expect(normalizeUserAgent('cpuminers-variant')).toBe('cpuminers-variant');
  });

  // Rule 5 – dash-version strip
  it('Rule 5: strips trailing dash-version suffix', () => {
    expect(normalizeUserAgent('ViperMiner-1.3')).toBe('ViperMiner');
    expect(normalizeUserAgent('Miner-2')).toBe('Miner');
    expect(normalizeUserAgent('some-miner-1.0.0')).toBe('some-miner');
    expect(normalizeUserAgent('xminer-1.2.7')).toBe('xminer');
    expect(normalizeUserAgent('FooMiner-2.0')).toBe('FooMiner');
    // non-digit suffix preserved
    expect(normalizeUserAgent('NerdOCTAXE-γ')).toBe('NerdOCTAXE-γ');
    // trailing dot must NOT be stripped
    expect(normalizeUserAgent('foo-1.')).toBe('foo-1.');
    // dot-led suffix must NOT be stripped
    expect(normalizeUserAgent('foo-.1')).toBe('foo-.1');
    // bare dash must NOT be stripped
    expect(normalizeUserAgent('foo-')).toBe('foo-');
    // v-prefixed version must NOT be stripped
    expect(normalizeUserAgent('FooMiner-v2')).toBe('FooMiner-v2');
  });

  // Additional preserved names (no rule should fire)
  it('preserves names that match no rule', () => {
    expect(normalizeUserAgent('cgminer/4.5.15')).toBe('cgminer');
    expect(normalizeUserAgent(' BM1387 Miner ')).toBe('BM1387 Miner');
    expect(normalizeUserAgent('Nerd Miner')).toBe('Nerd Miner');
    expect(normalizeUserAgent('ESP32 TacoMiner')).toBe('ESP32 TacoMiner');
    expect(normalizeUserAgent('stratum-ping/1.0.0')).toBe('stratum-ping');
    expect(normalizeUserAgent('esp32s3-toy/1.0')).toBe('esp32s3-toy');
    expect(normalizeUserAgent('GreenBit')).toBe('GreenBit');
    expect(normalizeUserAgent('NMMiner')).toBe('NMMiner');
    // Antminer with date-string version segment after slash
    expect(normalizeUserAgent('Antminer S19k Pro/Fri Oct 10 11:13:07 CST 2025')).toBe('Antminer S19k Pro');
  });
});
