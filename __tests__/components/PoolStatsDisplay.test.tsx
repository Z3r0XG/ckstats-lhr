import {
  calculatePercentageChange,
  getHistoricalPercentageChange,
  getPercentageChangeColor,
  computeRejectedPercent,
  calculateProximityPercent,
  computeAcceptedPct,
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

const HOUR_MS = 60 * 60 * 1000;
const ANCHOR_MS = 1_700_000_000_000; // fixed, deterministic "newest sample" time

function plantAll(value: number) {
  return {
    hashrate1m: value,
    hashrate5m: value,
    hashrate15m: value,
    hashrate1hr: value,
    hashrate6hr: value,
    hashrate1d: value,
    hashrate7d: value,
  };
}

// Build `len` samples newest-first (timestamp DESC), each `stepMs` older than the previous, anchored
// at ANCHOR_MS. `overrides` plants known baseline values at specific sample indices. This mirrors the
// real historical query (timestamp DESC) so tests exercise the time-window selection, not a fixed
// record offset.
function makeHistorical(
  len: number,
  stepMs: number,
  overrides: Record<number, Record<string, number>> = {}
) {
  return new Array(len).fill(0).map((_, i) => ({
    timestamp: new Date(ANCHOR_MS - i * stepMs).toISOString(),
    ...plantAll(1_000_000),
    ...(overrides[i] ?? {}),
  }));
}

function computePercentForKey(stats: any, historical: any[], key: string) {
  return getHistoricalPercentageChange(stats, historical, key);
}

describe('PoolStatsDisplay data transformations', () => {
  test('returns N/A for empty history', () => {
    expect(computePercentForKey(latestStats, [], 'hashrate1m')).toBe('N/A');
  });

  test('returns N/A when history does not span the 24h window', () => {
    // 10 hourly samples only reach 9h back — no sample is ever 24h old.
    const hist = makeHistorical(10, HOUR_MS);
    expect(computePercentForKey(latestStats, hist, 'hashrate1m')).toBe('N/A');
  });

  test('compares against the first sample at least 24h before the latest', () => {
    // Hourly spacing: the sample exactly 24h before the anchor is index 24.
    const baseline = 2_000_000;
    const hist = makeHistorical(48, HOUR_MS, { 24: plantAll(baseline) });
    const pct = computePercentForKey(latestStats, hist, 'hashrate1m');
    expect(pct).toBe(
      calculatePercentageChange(Number(latestStats.hashrate1m), baseline)
    );
    expect(pct).not.toBe('N/A');
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
    expect(result01.formatted).toBe('0.1%');

    // 0.75% rejected (75 out of 10000)
    const result075 = computeRejectedPercent(9925, 75);
    expect(result075.color).toBe('text-warning');
    expect(result075.formatted).toBe('0.75%');

    // 1.1% rejected (110 out of 10000)
    const result11 = computeRejectedPercent(9890, 110);
    expect(result11.color).toBe('text-error');
    expect(result11.formatted).toBe('1.1%');
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

  test('window is cadence-independent: finer spacing still anchors at 24h', () => {
    // 30-min spacing: the sample exactly 24h before the anchor is index 48 (vs index 24 at
    // hourly spacing). The old fixed 120-record offset would land in a totally different place.
    const baseline = 2_500_000;
    const hist = makeHistorical(96, HOUR_MS / 2, { 48: plantAll(baseline) });
    const pct = computePercentForKey(latestStats, hist, 'hashrate1d');
    expect(pct).toBe(
      calculatePercentageChange(Number(latestStats.hashrate1d), baseline)
    );
    expect(pct).not.toBe('N/A');
  });
});

describe('PoolStatsDisplay shareCount stat logic', () => {
  test('accepted% with total zero => "0%"', () => {
    expect(computeAcceptedPct(0, 0)).toBe('0%');
  });

  test('accepted% all accepted => "100%"', () => {
    expect(computeAcceptedPct(1000, 0)).toBe('100%');
  });

  test('accepted% just below 100 but above 99.99 => ">99.99%"', () => {
    // 9999 accepted, 1 rejected: 9999/10000 = 99.99% accepted → exactly 99.99 not > 99.99
    // Use 99999 accepted, 1 rejected: 99999/100000 = 99.999% > 99.99
    expect(computeAcceptedPct(99999, 1)).toBe('>99.99%');
  });

  test('accepted% exactly 99.99 => formatted as "99.99%"', () => {
    // 9999 accepted, 1 rejected = 99.99% exactly → not > 99.99
    expect(computeAcceptedPct(9999, 1)).toBe('99.99%');
  });

  test('accepted% normal case => formatted to 2 decimal places', () => {
    // 980 accepted, 20 rejected = 98% accepted (trailing zeros dropped)
    expect(computeAcceptedPct(980, 20)).toBe('98%');
  });

  test('accepted% null inputs => null', () => {
    expect(computeAcceptedPct(null, null)).toBeNull();
    expect(computeAcceptedPct(undefined, undefined)).toBeNull();
  });

  test('accepted% one input null => null', () => {
    expect(computeAcceptedPct(1000, null)).toBeNull();
    expect(computeAcceptedPct(null, 1000)).toBeNull();
  });

  test('accepted% non-numeric string inputs => null', () => {
    expect(computeAcceptedPct('abc', 'xyz')).toBeNull();
    expect(computeAcceptedPct('', '')).toBe('0%'); // Number('') === 0, total === 0
  });
});
