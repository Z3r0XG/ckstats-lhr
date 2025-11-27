import {
  calculatePercentageChange,
  getHistoricalPercentageChange,
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
  }
  return arr;
}

function computePercentForKey(stats: any, historical: any[], key: string) {
  return getHistoricalPercentageChange(stats, historical, key);
}

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
