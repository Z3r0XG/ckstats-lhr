import { convertHashrate } from '../../../utils/helpers';

describe('convertHashrate dry-run integration', () => {
  const inputs = [
    '',
    '0.5',
    '1e3',
    '1.2M',
    '-5',
    '900719925474099112345',
    'abc',
    '  2.5k  ',
    '+42',
    '0',
    '0.999',
    '1.000',
    '1e-3',
  ];

  it('does not throw and returns non-negative bigint for many inputs', () => {
    for (const input of inputs) {
      expect(() => convertHashrate(input as string)).not.toThrow();
      const out = convertHashrate(input as string);
      expect(typeof out).toBe('bigint');
      expect(out >= BigInt(0)).toBe(true);
    }
  });

  it('random fuzz quick check', () => {
    // quick small fuzz: generate many random strings and make sure it doesn't crash
    const alphabet = '0123456789.eE+-kKmMgGtTpPeEzZ ';
    for (let i = 0; i < 200; i++) {
      let s = '';
      const len = Math.floor(Math.random() * 10) + 1;
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(() => convertHashrate(s)).not.toThrow();
      const out = convertHashrate(s as string);
      expect(typeof out).toBe('bigint');
      expect(out >= BigInt(0)).toBe(true);
    }
  });
});
