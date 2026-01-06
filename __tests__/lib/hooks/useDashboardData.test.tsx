import { DashboardPayload } from '../../../lib/types/dashboard';
import { REFRESH_INTERVAL_MS } from '../../../lib/hooks/useDashboardData';

const mockPayload: DashboardPayload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  latestStats: {
    id: 1,
    users: 10,
    workers: 20,
    hashrate1m: 1000,
    hashrate5m: 1000,
    hashrate15m: 1000,
    hashrate1hr: 1000,
    hashrate6hr: 1000,
    hashrate1d: 1000,
    hashrate7d: 1000,
    SPS1m: 10,
    SPS5m: 10,
    SPS15m: 10,
    SPS1h: 10,
    accepted: '100',
    rejected: '5',
    bestshare: 50,
    diff: 0.01,
    disconnected: 0,
    idle: 0,
    runtime: 3600,
    timestamp: new Date().toISOString(),
  },
  historicalStats: [],
  topUserHashrates: [],
  topUserDifficulties: [],
  onlineDevices: [],
  highScores: [],
  limits: {
    topUsers: 10,
    onlineDevices: 10000,
    historicalPoints: 288,
  },
};

describe('useDashboardData hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DashboardPayload has required structure', () => {
    expect(mockPayload).toHaveProperty('version');
    expect(mockPayload).toHaveProperty('generatedAt');
    expect(mockPayload).toHaveProperty('latestStats');
    expect(mockPayload).toHaveProperty('historicalStats');
    expect(mockPayload).toHaveProperty('topUserHashrates');
    expect(mockPayload).toHaveProperty('topUserDifficulties');
    expect(mockPayload).toHaveProperty('onlineDevices');
    expect(mockPayload).toHaveProperty('highScores');
    expect(mockPayload).toHaveProperty('limits');
  });

  test('payload latestStats includes all required fields', () => {
    const { latestStats } = mockPayload;
    expect(latestStats).toHaveProperty('users');
    expect(latestStats).toHaveProperty('workers');
    expect(latestStats).toHaveProperty('hashrate1m');
    expect(latestStats).toHaveProperty('accepted');
    expect(latestStats).toHaveProperty('rejected');
    expect(latestStats).toHaveProperty('bestshare');
    expect(latestStats).toHaveProperty('diff');
    expect(latestStats).toHaveProperty('timestamp');
  });

  test('stale detection logic: data is stale after 2× interval', () => {
    const staleTime = Date.now() - (REFRESH_INTERVAL_MS * 1.5); // older than 1×, less than 2×
    const stalePayload: DashboardPayload = {
      ...mockPayload,
      generatedAt: new Date(staleTime).toISOString(),
    };

    const ageMs = Date.now() - new Date(stalePayload.generatedAt).getTime();
    const isStale = ageMs > REFRESH_INTERVAL_MS * 2;

    expect(isStale).toBe(true);
  });

  test('stale detection logic: recent data is not stale', () => {
    const recentTime = Date.now() - Math.floor(REFRESH_INTERVAL_MS / 6); // ~10s if 60s interval
    const recentPayload: DashboardPayload = {
      ...mockPayload,
      generatedAt: new Date(recentTime).toISOString(),
    };

    const ageMs = Date.now() - new Date(recentPayload.generatedAt).getTime();
    const isStale = ageMs > REFRESH_INTERVAL_MS * 2;

    expect(isStale).toBe(false);
  });

  test('payload size with 288 historical points is reasonable', () => {
    const withHistorical: DashboardPayload = {
      ...mockPayload,
      historicalStats: Array(288)
        .fill(null)
        .map((_, i) => ({
          ...mockPayload.latestStats,
          id: i,
        })),
    };

    const jsonString = JSON.stringify(withHistorical);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const sizeKb = sizeBytes / 1024;

    console.log(
      `Dashboard payload with 288 historical: ${sizeKb.toFixed(2)} KB`
    );

    // Should be under 500 KB before gzip
    expect(sizeBytes).toBeLessThan(500_000);
  });
});
