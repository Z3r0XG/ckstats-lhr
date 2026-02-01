import {
  calculatePercentageChange,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  computeRejectedPercent,
  calculateProximityPercent,
} from '../../utils/helpers';

const latestStats = {
  hashrate1m: 4_000_000,
  hashrate5m: 3_900_000,
  hashrate15m: 3_800_000,
  hashrate1hr: 3_700_000,
  hashrate6hr: 4_000_000,
  hashrate1d: 3_160_000,
  hashrate7d: 801_000,
};

function makeHistorical(len: number, valueAt119: number) {
  const arr = new Array(len).fill(0).map((_, i) => ({
    hashrate1m: 1_000_000 + (len - i) * 1000,
    hashrate5m: 1_000_000,
    hashrate15m: 1_000_000,
    hashrate1hr: 1_000_000,
    hashrate6hr: 1_000_000,
    hashrate1d: 1_000_000,
    hashrate7d: 1_000_000,
  }));
  if (len > 119) {
    arr[119].hashrate1m = valueAt119;
    arr[119].hashrate5m = valueAt119;
    arr[119].hashrate15m = valueAt119;
    arr[119].hashrate1hr = valueAt119;
    arr[119].hashrate6hr = valueAt119;
    arr[119].hashrate1d = valueAt119;
    arr[119].hashrate7d = valueAt119;
  }
  return arr;
}

function computePercentForKey(stats: any, historical: any[], key: string) {
  return getHistoricalPercentageChange(stats, historical, key);
}

describe('PoolStatsDisplay data transformations', () => {
  test('returns N/A when fewer than 120 historical samples', () => {
    const hist = makeHistorical(100, 0);
    expect(computePercentForKey(latestStats, hist, 'hashrate1m')).toBe('N/A');
  });

  test('computes percent using index 119 baseline when >=120 samples', () => {
    const baseline = 2_000_000;
    const hist = makeHistorical(200, baseline);
    const pct = computePercentForKey(latestStats, hist, 'hashrate1m');
    const expected = calculatePercentageChange(
      Number(latestStats.hashrate1m),
      baseline
    );
    expect(pct).toBe(expected);
  });

  test('percentage change color matches thresholds: positive=success, zero=base, negative=error', () => {
    expect(getPercentageChangeColor(5)).toBe('text-success');
    expect(getPercentageChangeColor(0)).toBe('text-base-content');
    expect(getPercentageChangeColor(-10)).toBe('text-error');
  });

  test('rejected percent thresholds: <=0.5%=success, <=1%=warning, >1%=error', () => {
    // 0.1% rejected (1 out of 1000)
    const result01 = computeRejectedPercent(999, 1);
    expect(result01.color).toBe('text-success');
    expect(result01.formatted).toBe('0.10%');
    
    // 0.75% rejected (75 out of 10000)
    const result075 = computeRejectedPercent(9925, 75);
    expect(result075.color).toBe('text-warning');
    expect(result075.formatted).toBe('0.75%');
    
    // 1.1% rejected (110 out of 10000)
    const result11 = computeRejectedPercent(9890, 110);
    expect(result11.color).toBe('text-error');
    expect(result11.formatted).toBe('1.10%');
  });

  test('proximity percent (share difficulty vs network difficulty)', () => {
    // User diff 50, network diff 1000 = 5%
    const proximity = calculateProximityPercent(50, 1000);
    expect(proximity).toBe('5.00%');
    expect(typeof proximity).toBe('string');
  });

  test('rejected percent returns null for zero total', () => {
    const result = computeRejectedPercent(0, 0);
    expect(result.pct).toBeNull();
    expect(result.formatted).toBeNull();
  });

  test('proximity percent returns empty string for invalid inputs', () => {
    expect(calculateProximityPercent(0, 1000)).toBe('');
    expect(calculateProximityPercent(100, 0)).toBe('');
    expect(calculateProximityPercent(100, null)).toBe('');
  });

  test('percentage change uses baseline from index 119 of historical data', () => {
    const baseline1m = 3_000_000;
    const baseline1d = 2_500_000;
    const baseline1hr = 3_500_000;
    const baseline7d = 1_500_000;
    
    // Test hashrate1m
    const histFor1m = makeHistorical(200, baseline1m);
    const hist1mChange = computePercentForKey(latestStats, histFor1m, 'hashrate1m');
    const expected1m = calculatePercentageChange(Number(latestStats.hashrate1m), baseline1m);
    expect(hist1mChange).toBe(expected1m);
    expect(hist1mChange).not.toBe('N/A');
    
    // Test hashrate1d
    const histFor1d = makeHistorical(200, baseline1d);
    const hist1dChange = computePercentForKey(latestStats, histFor1d, 'hashrate1d');
    const expected1d = calculatePercentageChange(Number(latestStats.hashrate1d), baseline1d);
    expect(hist1dChange).toBe(expected1d);
    expect(hist1dChange).not.toBe('N/A');
    
    // Test hashrate1hr
    const histFor1hr = makeHistorical(200, baseline1hr);
    const hist1hrChange = computePercentForKey(latestStats, histFor1hr, 'hashrate1hr');
    const expected1hr = calculatePercentageChange(Number(latestStats.hashrate1hr), baseline1hr);
    expect(hist1hrChange).toBe(expected1hr);
    expect(hist1hrChange).not.toBe('N/A');
    
    // Test hashrate7d
    const histFor7d = makeHistorical(200, baseline7d);
    const hist7dChange = computePercentForKey(latestStats, histFor7d, 'hashrate7d');
    const expected7d = calculatePercentageChange(Number(latestStats.hashrate7d), baseline7d);
    expect(hist7dChange).toBe(expected7d);
    expect(hist7dChange).not.toBe('N/A');
  });
});
