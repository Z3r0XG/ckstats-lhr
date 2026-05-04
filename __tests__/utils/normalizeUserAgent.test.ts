import { normalizeUserAgent } from '../../utils/helpers';

describe('normalizeUserAgent', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(normalizeUserAgent(undefined)).toBe('');
    expect(normalizeUserAgent('')).toBe('');
  });

  it('removes control characters but preserves Unicode', () => {
    expect(normalizeUserAgent('NerdOCTAXE-γ')).toBe('NerdOCTAXE-γ');
    expect(normalizeUserAgent('NerdOCTAXE-γ\x01\x02')).toBe('NerdOCTAXE-γ');
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

  // Real-world UA strings observed in production.
  // Add new entries here as new UAs are discovered.
  // Each input flows through all rules naturally; no assumption is made about which rule fires.
  it.each([
    // bosminer family
    ['2022-09-27-0-26ba61b9-22.08.1-plus;bosminer-plus-am1-s9 0.9.0-26ba61b9', 'bosminer'],
    ['2026-02-13-0-db69f9bc-26.01-plus;bosminer-plus-tuner 0.9.0-db69f9bc',     'bosminer'],
    ['2026-04-14-0-912d084c-26.04-plus;bosminer-plus-tuner 0.9.0-912d084c',     'bosminer'],
    // Antminer — slash-date format
    ['Antminer BHB42XXX/Mon Dec 22 17:19:30 CST 8888',           'Antminer BHB42XXX'],
    ['Antminer S19 XP/Fri Apr 12 14:53:57 CST 2024',             'Antminer S19 XP'],
    ['Antminer S19e XP Hyd./Tue May 14 14:46:20 CST 2024',       'Antminer S19e XP Hyd.'],
    ['Antminer S19j Pro+/Wed Jun 28 17:54:07 CST 2023',          'Antminer S19j Pro+'],
    ['Antminer S19k Pro/Tue Jun 24 16:41:27 CST 2025',           'Antminer S19k Pro'],
    ['Antminer S21 Pro/Fri Aug 30 19:35:17 CST 2024',            'Antminer S21 Pro'],
    ['Antminer S21 Pro/Thu Mar 27 15:00:36 CST 2025',            'Antminer S21 Pro'],
    ['Antminer S21 XP Hyd./Mon Jan 6 15:07:13 CST 2025',         'Antminer S21 XP Hyd.'],
    ['Antminer S21+ Hyd./Wed Apr 2 20:27:32 CST 2025',           'Antminer S21+ Hyd.'],
    ['Antminer S21+ Hyd./Wed Apr 2 20:27:32 CST 20255',          'Antminer S21+ Hyd.'],
    ['Antminer S21+/Tue Apr 22 15:05:57 CST 2025',               'Antminer S21+'],
    ['Antminer S21/Fri Feb  2 17:03:40 CST 2024',                'Antminer S21'],
    ['Antminer S21/Fri Oct 11 16:34:48 CST 2024',                'Antminer S21'],
    ['Antminer S21/Sat Dec  2 10:40:05 CST 2023',                'Antminer S21'],
    // Antminer — pipe-delimited LUXminer format
    ['Antminer S19j Pro+|LUXminer 2026.3.30.174759-b99dff377|BHB42612|BHB42612|BHB42612|',            'Antminer S19j Pro+'],
    ['Antminer S19k Pro|LUXminer 2026.3.30.174759-b99dff377|BHB56902|BHB56902|BHB56902|altair_tech',  'Antminer S19k Pro'],
    ['Antminer S19k Pro|LUXminer 2026.4.3.192353-6ab4e5077|BHB56902|BHB56902|BHB56902|altair_tech',  'Antminer S19k Pro'],
    ['Antminer S19k Pro|LUXminer 2026.4.3.192353-6ab4e5077|BHB56903|BHB56903|BHB56903|',             'Antminer S19k Pro'],
    ['Antminer S21|LUXminer 2026.3.2.193145-42668da4d|BHB68606|Unknown|Unknown|altairtech',           'Antminer S21'],
    // Antminer — no version suffix
    ['Antminer T21', 'Antminer T21'],
    ['Antminer',     'Antminer'],
    // bitaxe — all slash-separated, Rule 1 stops at first /
    ['bitaxe/BM1366/early-access-2026-03',             'bitaxe'],
    ['bitaxe/BM1366/v2.8.1-LV07',                      'bitaxe'],
    ['bitaxe/BM1366/v2.11.0',                          'bitaxe'],
    ['bitaxe/BM1366/v2.12.2-2.1.1',                    'bitaxe'],
    ['bitaxe/BM1366/v2.13.0',                          'bitaxe'],
    ['bitaxe/BM1366/v2.13.1',                          'bitaxe'],
    ['bitaxe/BM1366/v2.13.1-hexos.1',                  'bitaxe'],
    ['bitaxe/BM1368/2.9.0-TCH-All-In-One',             'bitaxe'],
    ['bitaxe/BM1368/v2.11.0',                          'bitaxe'],
    ['bitaxe/BM1368/v2.11.1-dirty',                    'bitaxe'],
    ['bitaxe/BM1368/v2.11.4-TCH',                      'bitaxe'],
    ['bitaxe/BM1368/v2.11.4-TCH-dirty',                'bitaxe'],
    ['bitaxe/BM1368/v2.12.2',                          'bitaxe'],
    ['bitaxe/BM1368/v2.13.0',                          'bitaxe'],
    ['bitaxe/BM1368/v2.13.0b8',                        'bitaxe'],
    ['bitaxe/BM1368/v2.13.1',                          'bitaxe'],
    ['bitaxe/BM1368/v2.13.1-hexos.1',                  'bitaxe'],
    ['bitaxe/BM1370/v2.5.1',                           'bitaxe'],
    ['bitaxe/BM1370/v2.8.1',                           'bitaxe'],
    ['bitaxe/BM1370/v2.9.0',                           'bitaxe'],
    ['bitaxe/BM1370/v2.9.0b3',                         'bitaxe'],
    ['bitaxe/BM1370/v2.10.0',                          'bitaxe'],
    ['bitaxe/BM1370/v2.10.0-4-gbbddfdc-dirty',         'bitaxe'],
    ['bitaxe/BM1370/v2.10.1',                          'bitaxe'],
    ['bitaxe/BM1370/v2.11.0',                          'bitaxe'],
    ['bitaxe/BM1370/v2.11.0-5-g8dc659c-dirty',         'bitaxe'],
    ['bitaxe/BM1370/v2.11.1-TCH',                      'bitaxe'],
    ['bitaxe/BM1370/v2.11.4-TCH',                      'bitaxe'],
    ['bitaxe/BM1370/v2.12.0',                          'bitaxe'],
    ['bitaxe/BM1370/v2.12.2',                          'bitaxe'],
    ['bitaxe/BM1370/v2.12.2-dirty',                    'bitaxe'],
    ['bitaxe/BM1370/v2.13.0',                          'bitaxe'],
    ['bitaxe/BM1370/v2.13.0b1',                        'bitaxe'],
    ['bitaxe/BM1370/v2.13.0b1-28-gdee4339-dirty',      'bitaxe'],
    ['bitaxe/BM1370/v2.13.1',                          'bitaxe'],
    ['bitaxe/BM1370/v2.13.1-hexos.1',                  'bitaxe'],
    ['bitaxe/BM1370/v2.13.1-hexos.1-dev.1-1-gf7bb94', 'bitaxe'],
    ['bitaxe/BM1370/v2.13.1-hexos.1-dev.4',            'bitaxe'],
    ['bitaxe/BM1370/v2.13.1-hexos.2-dev.1',            'bitaxe'],
    ['bitaxe/BM1370/v2.13.1-hexos.2-dev.1-dirty',      'bitaxe'],
    ['bitaxe/BM1370/v2.13.2',                          'bitaxe'],
    ['bitaxe/BM1370/v2.13.2-4-g4781e1f-dirty',         'bitaxe'],
    ['bitaxe/BM1370/v2.14.0b1',                        'bitaxe'],
    // Bitaxe — standalone, no slash
    ['Bitaxe', 'Bitaxe'],
    // bitdsk
    ['bitdsk/D12',    'bitdsk'],
    ['bitdsk/D12-T',  'bitdsk'],
    ['bitdsk/N5.Rex', 'bitdsk'],
    ['bitdsk/N8-T',   'bitdsk'],
    ['bitdsk/S1',     'bitdsk'],
    // bitforge
    ['bitforge/BM1370/v1.1', 'bitforge'],
    // BitsyMiner
    ['BitsyMiner/v1.0.0',     'BitsyMiner'],
    ['BitsyMiner/v1.5.11',    'BitsyMiner'],
    ['BitsyMiner/v1.5.16',    'BitsyMiner'],
    ['BitsyMinerOpen/v1.2.0', 'BitsyMinerOpen'],
    // standard miners
    ['bfgminer/5.4.2',              'bfgminer'],
    ['bmminer/2.0.0',               'bmminer'],
    ['bmminer/2.0.0/Antminer S9/14000', 'bmminer'],
    ['bmminer/4.11.1 rwglr',        'bmminer'],
    ['btc-go-miner/1.0',            'btc-go-miner'],
    ['btc-miner/asm/1.0',           'btc-miner'],
    ['btc-py-miner/1.0',            'btc-py-miner'],
    ['ccminer/0.5.1',               'ccminer'],
    ['ccminer/2.2',                 'ccminer'],
    ['ccminer/2.3.1',               'ccminer'],
    ['cgminer/3.7.3-nicehash-3',    'cgminer'],
    ['cgminer/4.11.1',              'cgminer'],
    ['cgminer/4.12.0-wrk',          'cgminer'],
    ['cgminer/4.13.5',              'cgminer'],
    ['sgminer/4.1.0',               'sgminer'],
    ['whatsminer/v1.0',             'whatsminer'],
    ['whatsminer/v1.1',             'whatsminer'],
    // cpuminer family
    ['cpuminer-multi/1.3.1',   'cpuminer'],
    ['cpuminer-multi/1.3.6',   'cpuminer'],
    ['cpuminer-multi/1.3.7',   'cpuminer'],
    ['cpuminer-opt-25.5-x64W', 'cpuminer'],
    ['cpuminer-opt-26.1-armL', 'cpuminer'],
    ['cpuminer-opt-26.1-x64L', 'cpuminer'],
    ['cpuminer-opt-26.1-x64W', 'cpuminer'],
    ['cpuminer/2.3.3',         'cpuminer'],
    ['cpuminer/2.5.1',         'cpuminer'],
    // Disruptor
    ['Disruptor/BM1366/v1.0.2', 'Disruptor'],
    // ESP32
    ['ESP32 TacoMiner', 'ESP32 TacoMiner'],
    ['ESP32s3-Taco/1.1', 'ESP32s3-Taco'],
    ['esp32s3-toy/1.0',  'esp32s3-toy'],
    // ForgeMiner
    ['ForgeMiner', 'ForgeMiner'],
    // GekkoAxe
    ['GekkoAxe-GT/v2.13.1-gekko.2-dev.2',           'GekkoAxe-GT'],
    ['GekkoAxe-GT/v2.13.1-gekko.2-dev.3-dirty',     'GekkoAxe-GT'],
    ['GekkoAxe-GT/v2.13.1-gekko.2-dev.4',           'GekkoAxe-GT'],
    ['GekkoAxe-GT/v2.13.1-gekko.2-dev.5',           'GekkoAxe-GT'],
    ['GekkoAxe-GT/v2.13.1-hexos.2-dev.1',           'GekkoAxe-GT'],
    ['GekkoAxe-GT/v2.13.1-hexos.2-dev.1-5-g7c71d3', 'GekkoAxe-GT'],
    // misc
    ['GoProdMiner/1.0',         'GoProdMiner'],
    ['GreenBit',                'GreenBit'],
    ['HAN_SOLOminer/V1.8.3',   'HAN_SOLOminer'],
    ['HashrateDashboard/1.0',   'HashrateDashboard'],
    ['HeliosMiner/V1.8.3',     'HeliosMiner'],
    ['HeliosMiner/v1.1.0',     'HeliosMiner'],
    ['JingleMiner',             'JingleMiner'],
    ['LeafMiner/0.0.16',        'LeafMiner'],
    // LuckyMiner
    ['LuckyMiner BM1366',        'LuckyMiner'],
    ['LuckyMiner/BM1366/1.0.0',  'LuckyMiner'],
    ['LuckyMiner/BM1366/1.1.0',  'LuckyMiner'],
    ['LuckyMiner/BM1366/1.2.0',  'LuckyMiner'],
    ['LuckyMiner/BM1368/v1.0.0', 'LuckyMiner'],
    ['LuckyMiner/V1.7.0',        'LuckyMiner'],
    ['LuckyMiner/V1.8.3',        'LuckyMiner'],
    // misc
    ['MRR-Hash/1.0.0',            'MRR-Hash'],
    ['Magicminer/BM1370/1.0',     'Magicminer'],
    ['Miner/BM1366',              'Miner'],
    ['MiningRigRentals/Test/1.0', 'MiningRigRentals'],
    ['MvIiIaX_Nerd',              'MvIiIaX_Nerd'],
    // NMAxe
    ['NMAxe/v2.9.21',      'NMAxe'],
    ['NMAxe/v2.9.31',      'NMAxe'],
    ['NMAxe/v3.0.10',      'NMAxe'],
    ['NMAxe/v3.0.11',      'NMAxe'],
    ['NMAxeGamma/v2.9.21', 'NMAxeGamma'],
    ['NMAxeGamma/v2.9.31', 'NMAxeGamma'],
    ['NMAxeGamma/v3.0.10', 'NMAxeGamma'],
    ['NMAxeGamma/v3.0.11', 'NMAxeGamma'],
    // NMMiner / Nerd Miner (bare)
    ['NMMiner',    'NMMiner'],
    ['Nerd Miner', 'Nerd Miner'],
    // NerdAxe
    ['NerdAxe/BM1366/v1.0.36',        'NerdAxe'],
    ['NerdAxe/BM1366/v1.0.37-beta3',  'NerdAxe'],
    ['NerdAxe/BM1370/v1.0.36',        'NerdAxe'],
    ['NerdAxe/BM1370/v1.0.37-alpha3', 'NerdAxe'],
    ['NerdAxe/BM1370/v1.0.37-alpha4', 'NerdAxe'],
    ['NerdAxe/BM1370/v1.0.37-beta2',  'NerdAxe'],
    ['NerdAxe/BM1370/v1.0.37-rc2',    'NerdAxe'],
    // NerdMinerV2
    ['NerdMinerV2',          'NerdMinerV2'],
    ['NerdMinerV2/',         'NerdMinerV2'],
    ['NerdMinerV2/V1.7.0',   'NerdMinerV2'],
    ['NerdMinerV2/V1.8.2',   'NerdMinerV2'],
    ['NerdMinerV2/V1.8.3',   'NerdMinerV2'],
    ['NerdMinerV2/V1.8.3.2', 'NerdMinerV2'],
    // NerdNOS
    ['NerdNOS/V1.0.4', 'NerdNOS'],
    // NerdOCTAXE-γ
    ['NerdOCTAXE-γ/BM1370/TNA-V4.3',                        'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.34.1',                       'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.35',                         'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.36',                         'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.36-2-g3a2c1bcf',            'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.36-3-gbc42d4d7',            'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.36-beta2',                  'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.37-beta2',                  'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.37-beta3',                  'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.37-beta3-tuning-mod-dirty', 'NerdOCTAXE-γ'],
    ['NerdOCTAXE-γ/BM1370/v1.0.37-rc2',                    'NerdOCTAXE-γ'],
    // NerdQAxe++
    ['NerdQAxe++/BM1370/TNA-V3.4LAN/BDOC',         'NerdQAxe++'],
    ['NerdQAxe++/BM1370/TNA-v3.5',                 'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.31',                  'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.32',                  'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.32-test2',            'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.32.1',                'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.34.1',                'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.35',                  'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.35-2-g92ce878',       'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.35-dirty',            'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.36',                  'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.36-1-g1cb9f62a',      'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.36-1-g600b3916-dirty','NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.37-alpha2',            'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.37-alpha3',            'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.37-beta2',             'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.37-beta3',             'NerdQAxe++'],
    ['NerdQAxe++/BM1370/v1.0.37-rc2',               'NerdQAxe++'],
    // NerdQAxe+
    ['NerdQAxe+/BM1368/v1.0.34.1', 'NerdQAxe+'],
    // NerdQX
    ['NerdQX/BM1370/v1.0.36-1-g1cb9f62a', 'NerdQX'],
    ['NerdQX/BM1370/v1.0.36-3-gbc42d4d7', 'NerdQX'],
    ['NerdQX/BM1370/v1.0.37-beta2',        'NerdQX'],
    // misc
    ['NiceHash/1.0.0', 'NiceHash'],
    ['Other',          'Other'],
    ['Rkminer',        'Rkminer'],
    ['Rkminer/2.0',    'Rkminer'],
    // SparkMiner
    ['SparkMiner/v2.9.2', 'SparkMiner'],
    ['SparkMiner/v2.9.5', 'SparkMiner'],
    // Zyber8S
    ['Zyber8S/BM1368/Zyber-v2.8.0-TCH', 'Zyber8S'],
    // sm-miner family
    ['sm-miner v8.16.67.1 2020-09-23, msp ver 0x8168', 'sm-miner'],
    // xminer
    ['xminer-1.2.7',     'xminer'],
    ['xminer-1.2.6-rc5', 'xminer'],
    ['xminer-1.2.6-hf2', 'xminer'],
    ['xminer-1.2.6-hf3', 'xminer'],
  ] as [string, string][])('real UA: "%s" → "%s"', (input, expected) => {
    expect(normalizeUserAgent(input)).toBe(expected);
  });

  // Rule boundary conditions — synthetic inputs documenting what each rule does and does NOT match.
  // These complement the real-world table by covering edge cases not present in known UA strings.
  it.each([
    // Rule 1: paren stop
    ['SomeMiner(v2)',        'SomeMiner'],
    // Rule 2: BM suffix — must NOT fire without correct separator/casing/digits
    ['FooMiner-BM',                  'FooMiner-BM'],        // no digits
    ['SomeMinerBM1366',              'SomeMinerBM1366'],    // no separator
    ['BM1366',                       'BM1366'],             // standalone chip
    ['FooMiner-bm1366',              'FooMiner-bm1366'],    // lowercase
    ['FooMiner\u00A0BM1366',         'FooMiner\u00A0BM1366'], // NBSP separator
    ['cpuminer-BM1366',              'cpuminer'],           // Rule 2 then Rule 4
    // Rule 3: bosminer case-insensitive
    ['BOSminer/1.0',                 'bosminer'],
    // Rule 4: cpuminer casing preserved; cpuminers-* must NOT collapse
    ['CPUMiner',                     'CPUMiner'],
    ['CPUMINER-multi',               'CPUMINER'],
    ['cpuminers-variant',            'cpuminers-variant'],
    // Rule 4b: sm-miner casing preserved
    ['SM-Miner v1.0',                'SM-Miner'],
    // Rule 5: trailing dot and bare dash must NOT be stripped
    ['FooMiner-v2',                  'FooMiner'],           // v-prefixed version stripped
    ['FooMiner-v2.3.1',              'FooMiner'],           // v-prefixed dotted version stripped
    ['foo-1.',                       'foo-1.'],
    ['foo-',                         'foo-'],
    ['FooMiner-2.0-alpha1',          'FooMiner'],           // pre-release stripped
    ['FooMiner-2.0-beta',            'FooMiner'],           // bare word pre-release stripped
    // Rule 6: space-separated dotted version stripped; bare number (no dot) must NOT be stripped
    ['Nerd Miner 1.0',               'Nerd Miner'],
    ['LUXminer 2026.3.30.174759-b99dff377', 'LUXminer'],
    ['SomeMiner v2.3.1',             'SomeMiner'],
    ['SomeMiner 2',                  'SomeMiner 2'],        // no dot — NOT stripped
  ] as [string, string][])('boundary: "%s" → "%s"', (input, expected) => {
    expect(normalizeUserAgent(input)).toBe(expected);
  });
});
