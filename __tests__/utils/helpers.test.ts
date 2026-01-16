import {
  formatNumber,
  formatHashrate,
  convertHashrate,
  convertHashrateFloat,
  bigIntStringFromFloatLike,
  safeParseFloat,
  formatTimeAgo,
  formatDuration,
  formatConciseTimeAgo,
  calculatePercentageChange,
  getPercentageChangeColor,
  calculateAverageTimeToBlock,
  calculateBlockChances,
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
    it('calculates block chances correctly', () => {
      const chances = calculateBlockChances(
        BigInt(1000000000000),
        1,
        BigInt(100000000000000)
      );
      expect(chances['1h']).toBe('<0.001%');
      expect(chances['1d']).toMatch(/\d+\.\d{3}%|<0\.001%/);
      expect(chances['1w']).toMatch(/\d+\.\d{3}%|<0\.001%/);
      expect(chances['1m']).toMatch(/\d+\.\d{3}%|<0\.001%/);
      expect(chances['1y']).toMatch(/\d+\.\d{3}%|<0\.001%/);
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
