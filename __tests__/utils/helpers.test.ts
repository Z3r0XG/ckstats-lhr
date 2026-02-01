import {
  formatNumber,
  formatHashrate,
  convertHashrate,
  convertHashrateFloat,
  bigIntStringFromFloatLike,
  safeParseFloat,
  formatTimeAgo,
  formatDuration,
  formatDurationCapped,
  formatConciseTimeAgo,
  calculatePercentageChange,
  getPercentageChangeColor,
  calculateAverageTimeToBlock,
  calculateBlockChances,
  calculateProximityPercent,
  maskAddress,
} from '../../utils/helpers';

describe('Helper Functions', () => {
  describe('formatNumber', () => {
    it('formats numbers correctly', () => {
      expect(formatNumber(1000)).toBe('1.00 k');
      expect(formatNumber(1000000)).toBe('1.00 M');
      expect(formatNumber(1000000000)).toBe('1.00 G');
      expect(formatNumber(1000000000000)).toBe('1.00 T');
      expect(formatNumber(1000000000000000)).toBe('1.00 P');
      expect(formatNumber(1000000000000000000)).toBe('1.00 E');
      expect(formatNumber(1000000000000000000000)).toBe('1.00 Z');
      expect(formatNumber(999)).toBe('999');
      // BigInt-like string formatting: should preserve digits without precision loss
      expect(formatNumber('9007199254740993')).toBe('9,007,199,254,740,993');
      // Numeric string within safe range should be unit formatted
      expect(formatNumber('1283860')).toBe('1.28 M');
    });
  });

  describe('formatHashrate', () => {
    it('formats hashrates correctly', () => {
      expect(formatHashrate('1000')).toBe('1 kH/s');
      expect(formatHashrate('1000000')).toBe('1 MH/s');
      expect(formatHashrate('1000000000')).toBe('1 GH/s');
      expect(formatHashrate('1000000000000')).toBe('1 TH/s');
      expect(formatHashrate('1000000000000000')).toBe('1 PH/s');
      expect(formatHashrate('999')).toBe('999 H/s');
      expect(formatHashrate('1010000000000')).toBe('1.01 TH/s');
      expect(formatHashrate('1100000000000')).toBe('1.1 TH/s');
    });
  });

  describe('convertHashrate', () => {
    it('converts hashrates correctly', () => {
      expect(convertHashrate('1K')).toBe(BigInt(1000));
      expect(convertHashrate('1M')).toBe(BigInt(1000000));
      expect(convertHashrate('1G')).toBe(BigInt(1000000000));
      expect(convertHashrate('1T')).toBe(BigInt(1000000000000));
      expect(convertHashrate('1P')).toBe(BigInt(1000000000000000));
      expect(convertHashrate('1')).toBe(BigInt(1));
    });
  });

  describe('convertHashrateFloat', () => {
    it('converts hashrates to float correctly', () => {
      expect(convertHashrateFloat('1K')).toBe(1000);
      expect(convertHashrateFloat('1M')).toBe(1000000);
      expect(convertHashrateFloat('1.5M')).toBe(1500000);
      expect(convertHashrateFloat('2.5G')).toBe(2500000000);
      expect(convertHashrateFloat('1T')).toBe(1000000000000);
      expect(convertHashrateFloat('1')).toBe(1);
    });

    it('preserves fractional values', () => {
      expect(convertHashrateFloat('0.5')).toBe(0.5);
      expect(convertHashrateFloat('4.45352')).toBe(4.45352);
      expect(convertHashrateFloat('123.456')).toBe(123.456);
    });

    it('handles unit-suffixed fractional values', () => {
      expect(convertHashrateFloat('4.45352M')).toBe(4453520);
      expect(convertHashrateFloat('0.5k')).toBe(500);
      expect(convertHashrateFloat('1.234G')).toBe(1234000000);
    });

    it('handles edge cases', () => {
      expect(convertHashrateFloat('')).toBe(0);
      expect(convertHashrateFloat('0')).toBe(0);
      expect(convertHashrateFloat('invalid')).toBe(0);
    });
  });

  describe('formatTimeAgo', () => {
    it('formats time ago correctly', () => {
      const now = new Date();
      expect(formatTimeAgo(now, 2)).toBe('Recently');
      expect(formatTimeAgo(new Date(now.getTime() - 1 * 60000))).toBe(
        '1 min ago'
      );
      expect(formatTimeAgo(new Date(now.getTime() - 5 * 60000))).toBe(
        '5 mins ago'
      );
      expect(formatTimeAgo(new Date(now.getTime() - 65 * 60000))).toBe(
        '1 hour 5 mins ago'
      );
      expect(formatTimeAgo(new Date(now.getTime() - 25 * 60 * 60000))).toBe(
        '1 day 1 hour 0 min ago'
      );
    });
  });

  describe('formatConciseTimeAgo', () => {
    it('treats 1 and 1.0 as singular and drops trailing .0', () => {
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      expect(formatConciseTimeAgo(oneYearAgo)).toBe('1 year ago');
    });

    it('pluralizes when above one', () => {
      const onePointOneYearsAgo = Date.now() - 1.1 * 365 * 24 * 60 * 60 * 1000;
      expect(formatConciseTimeAgo(onePointOneYearsAgo)).toBe('1.1 years ago');
    });
  });

  describe('formatDuration', () => {
    it('formats duration correctly', () => {
      expect(formatDuration(60)).toBe('1m');
      expect(formatDuration(3600)).toBe('1h');
      expect(formatDuration(86400)).toBe('1d');
      expect(formatDuration(31536000)).toBe('1y');
      expect(formatDuration(31622400)).toBe('1y 1d');
      expect(formatDuration(9000000000000)).toBe('~∞');
    });
  });

  describe('formatDurationCapped', () => {
    it('returns N/A when above cap', () => {
      const over = 1000 * 31536000 + 1;
      expect(formatDurationCapped(over)).toBe('N/A');
    });

    it('formats normally when below cap', () => {
      expect(formatDurationCapped(3600)).toBe('1h');
    });
  });

  describe('calculatePercentageChange', () => {
    it('calculates percentage change correctly', () => {
      expect(calculatePercentageChange(110, 100)).toBe(10);
      expect(calculatePercentageChange(90, 100)).toBe(-10);
      expect(calculatePercentageChange(100, 100)).toBe(0);
      expect(calculatePercentageChange(100, 0)).toBe('N/A');
    });
  });

  describe('getPercentageChangeColor', () => {
    it('returns correct color for percentage change', () => {
      expect(getPercentageChangeColor(10)).toBe('text-success');
      expect(getPercentageChangeColor(-10)).toBe('text-error');
      expect(getPercentageChangeColor(0)).toBe('text-base-content');
      expect(getPercentageChangeColor('N/A')).toBe('text-base-content');
    });
  });

  describe('calculateAverageTimeToBlock', () => {
    it('calculates average time to block correctly', () => {
      expect(
        calculateAverageTimeToBlock(BigInt(1000000000000), 1, 'T')
      ).toBeCloseTo(4294967296);
      expect(
        calculateAverageTimeToBlock(BigInt(2000000000000), 1, 'T')
      ).toBeCloseTo(2147483648);
    });
  });

  describe('calculateBlockChances', () => {
    const computeExpected = (
      hashRate: number,
      difficulty: number,
      seconds: number
    ) => {
      const hashesPerDifficulty = Math.pow(2, 32);
      const lambda = (hashRate * seconds) / (difficulty * hashesPerDifficulty);
      const probability = 1 - Math.exp(-lambda);
      const pct = probability * 100;
      return pct >= 0.01 ? `${pct.toFixed(2)}%` : '<0.01%';
    };

    it('matches Poisson probability using network difficulty only', () => {
      // Chosen to yield mid-range probabilities (>0.01%) for multiple periods
      const hashRate = 5e11; // 500 GH/s
      const difficulty = 1e9; // network difficulty (absolute)

      const chances = calculateBlockChances(hashRate, difficulty);

      expect(chances['1h']).toBe(
        computeExpected(hashRate, difficulty, 3600)
      );
      expect(chances['1d']).toBe(
        computeExpected(hashRate, difficulty, 86400)
      );
      expect(chances['1w']).toBe(
        computeExpected(hashRate, difficulty, 604800)
      );
      expect(chances['1m']).toBe(
        computeExpected(hashRate, difficulty, 2592000)
      );
      expect(chances['1y']).toBe(
        computeExpected(hashRate, difficulty, 31536000)
      );
    });

    it('returns floor when probability is below 0.01%', () => {
      const hashRate = 1e9; // 1 GH/s
      const difficulty = 1e12; // high difficulty
      const chances = calculateBlockChances(hashRate, difficulty);
      expect(chances['1h']).toBe('<0.01%');
      expect(chances['1d']).toBe('<0.01%');
      expect(chances['1w']).toBe('<0.01%');
      expect(chances['1m']).toBe('<0.01%');
      expect(chances['1y']).toBe('<0.01%');
    });

    it('defaults when inputs are invalid or non-positive', () => {
      expect(calculateBlockChances(0, 1e6)['1d']).toBe('<0.01%');
      expect(calculateBlockChances(1e6, 0)['1d']).toBe('<0.01%');
      expect(calculateBlockChances(NaN, 1e6)['1d']).toBe('<0.01%');
      expect(calculateBlockChances(1e6, NaN)['1d']).toBe('<0.01%');
    });

    it('uses legacy accepted/diff fallback when netdiff is absent', () => {
      // Legacy formula: networkDiff = (accepted/(diff*100))*10000
      // Choose values to get mid-range probabilities and assert all periods match the derived expectations.
      const hashRate = 1e12; // 1 TH/s
      const diffPercent = 0.5; // pool diff percentage
      const accepted = 1e10; // accepted shares
      const legacyNetworkDiff = (accepted / (diffPercent * 100)) * 10000;

      const expected = (seconds: number) => {
        const hashesPerDifficulty = Math.pow(2, 32);
        const lambda = (hashRate * seconds) / (legacyNetworkDiff * hashesPerDifficulty);
        const p = 1 - Math.exp(-lambda);
        const pct = p * 100;
        return pct >= 0.01 ? `${pct.toFixed(2)}%` : '<0.01%';
      };

      const chances = calculateBlockChances(hashRate, null, diffPercent, accepted);
      expect(chances['1h']).toBe(expected(3600));
      expect(chances['1d']).toBe(expected(86400));
      expect(chances['1w']).toBe(expected(604800));
      expect(chances['1m']).toBe(expected(2592000));
      expect(chances['1y']).toBe(expected(31536000));
    });
  });
});

  describe('bigIntStringFromFloatLike', () => {
    it('converts floats and strings to BigInt strings preserving integer part', () => {
      expect(bigIntStringFromFloatLike('12345.678')).toBe('12345');
      expect(bigIntStringFromFloatLike(190827.81)).toBe('190827');
      expect(bigIntStringFromFloatLike('9007199254740993.5')).toBe('9007199254740993');
      expect(bigIntStringFromFloatLike(undefined)).toBe('0');
    });
  });

  describe('safeParseFloat', () => {
    it('parses floats safely and returns fallback on invalid', () => {
      expect(safeParseFloat(undefined, 0)).toBe(0);
      expect(safeParseFloat('12.34', 0)).toBe(12.34);
      expect(safeParseFloat('invalid', 0)).toBe(0);
    });
  });

  describe('calculateProximityPercent', () => {
    it('returns empty string for zero value', () => {
      expect(calculateProximityPercent(0, 1000)).toBe('');
    });

    it('returns empty string for negative value', () => {
      expect(calculateProximityPercent(-100, 1000)).toBe('');
    });

    it('returns empty string for null networkDiff', () => {
      expect(calculateProximityPercent(100, null)).toBe('');
    });

    it('returns empty string for undefined networkDiff', () => {
      expect(calculateProximityPercent(100, undefined)).toBe('');
    });

    it('returns empty string for zero networkDiff', () => {
      expect(calculateProximityPercent(100, 0)).toBe('');
    });

    it('returns empty string for negative networkDiff', () => {
      expect(calculateProximityPercent(100, -1000)).toBe('');
    });

    it('returns <0.01% when result rounds to zero but is not exactly zero', () => {
      expect(calculateProximityPercent(0.00001, 1000000)).toBe('<0.01%');
    });

    it('returns <0.01% for very small percentages', () => {
      expect(calculateProximityPercent(0.5, 10000)).toBe('<0.01%');
      expect(calculateProximityPercent(1, 50000)).toBe('<0.01%');
      expect(calculateProximityPercent(0.00001, 10000)).toBe('<0.01%');
    });

    it('formats normal percentages to 2 decimal places', () => {
      expect(calculateProximityPercent(5, 100)).toBe('5.00%');
      expect(calculateProximityPercent(10, 100)).toBe('10.00%');
      expect(calculateProximityPercent(50, 100)).toBe('50.00%');
      expect(calculateProximityPercent(1, 1000)).toBe('0.10%');
      expect(calculateProximityPercent(33, 1000)).toBe('3.30%');
    });

    it('handles large numbers correctly', () => {
      expect(calculateProximityPercent(1000000, 1000000000)).toBe('0.10%');
      expect(calculateProximityPercent(5000000, 1000000000)).toBe('0.50%');
    });

    it('handles small differences correctly', () => {
      expect(calculateProximityPercent(0.1, 100)).toBe('0.10%');
      expect(calculateProximityPercent(0.01, 100)).toBe('0.01%');
    });
  });

  describe('maskAddress', () => {
    it('masks bitcoin addresses correctly (first 6 + last 4 chars)', () => {
      // Real bitcoin address format
      const address = 'bc1qry58kv8zckwvj5csucwvf2yvjt5d98gdvt9mw';
      expect(maskAddress(address)).toBe('bc1qry...t9mw');
    });

    it('returns short addresses unchanged (< 10 chars)', () => {
      expect(maskAddress('addr1')).toBe('addr1');
      expect(maskAddress('short')).toBe('short');
      expect(maskAddress('abc')).toBe('abc');
      expect(maskAddress('1234567890')).toBe('1234567890'); // exactly 10 chars
    });

    it('returns empty string unchanged', () => {
      expect(maskAddress('')).toBe('');
    });

    it('masks various length addresses correctly', () => {
      // 11 character address
      expect(maskAddress('12345678901')).toBe('123456...8901');
      // 15 character address
      expect(maskAddress('123456789012345')).toBe('123456...2345');
      // 42 character address (typical length)
      expect(maskAddress('bc1qrystkj5csucwvf2yvjt5d98gdvt9mwabcdefg')).toBe(
        'bc1qry...defg'
      );
    });

    it('handles edge case of 11 character address (first maskable length)', () => {
      const addr = 'abcdefghijk'; // exactly 11 chars
      expect(maskAddress(addr)).toBe('abcdef...hijk');
    });
  });
