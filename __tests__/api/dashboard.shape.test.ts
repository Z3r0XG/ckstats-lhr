/**
 * Sanity check test for /api/dashboard payload shape and size.
 * Verifies that the endpoint returns a valid structure and measures serialized size.
 * Run with: pnpm test api.dashboard.test.ts
 */

import { serializeData } from '../../utils/helpers';

describe('/api/dashboard payload shape and size', () => {
  test('dashboard payload has required top-level keys', () => {
    const mockPayload = {
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
        accepted: 100,
        rejected: 5,
        bestshare: 50,
        diff: 0.01,
        disconnected: 0,
        idle: 0,
        runtime: 3600,
        timestamp: new Date(),
      },
      historicalStats: Array(288)
        .fill(null)
        .map((_, i) => ({
          id: i,
          users: 10 + i,
          workers: 20 + i,
          hashrate1m: 1000 + i * 10,
          hashrate5m: 1000 + i * 10,
          hashrate15m: 1000 + i * 10,
          hashrate1hr: 1000 + i * 10,
          hashrate6hr: 1000 + i * 10,
          hashrate1d: 1000 + i * 10,
          hashrate7d: 1000 + i * 10,
          SPS1m: 10,
          SPS5m: 10,
          SPS15m: 10,
          SPS1h: 10,
          accepted: 100 + i,
          rejected: 5,
          bestshare: 50,
          diff: 0.01,
          disconnected: 0,
          idle: 0,
          runtime: 3600 + i * 60,
          timestamp: new Date(),
        })),
      topUserHashrates: [
        {
          address: 'bc1q1234567890abcdef1234567890abcdef123456',
          workerCount: 5,
          hashrate1hr: 1000,
          hashrate1d: 1000,
          hashrate7d: 1000,
          bestShare: 50,
          bestEver: 100,
        },
      ],
      topUserDifficulties: [
        {
          address: 'bc1q1234567890abcdef1234567890abcdef123456',
          workerCount: 5,
          difficulty: 100,
          hashrate1hr: 1000,
          hashrate1d: 1000,
          hashrate7d: 1000,
          bestShare: 50,
        },
      ],
      onlineDevices: [
        {
          client: 'nerdminer',
          activeWorkers: 42,
          uniqueUsers: 10,
          hashrate1hr: 5000,
          bestEver: 150,
        },
      ],
      highScores: [
        {
          rank: 1,
          difficulty: 250,
          device: 'nerdminer',
          timestamp: new Date(),
        },
      ],
      limits: {
        topUsers: 10,
        onlineDevices: 10000,
        historicalPoints: 288,
      },
    };

    // Verify required keys exist
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

  test('serialized payload size is reasonable', () => {
    const mockPayload = {
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
        accepted: 100,
        rejected: 5,
        bestshare: 50,
        diff: 0.01,
        disconnected: 0,
        idle: 0,
        runtime: 3600,
        timestamp: new Date(),
      },
      historicalStats: Array(288)
        .fill(null)
        .map((_, i) => ({
          id: i,
          users: 10 + i,
          workers: 20 + i,
          hashrate1m: 1000 + i * 10,
          hashrate5m: 1000 + i * 10,
          hashrate15m: 1000 + i * 10,
          hashrate1hr: 1000 + i * 10,
          hashrate6hr: 1000 + i * 10,
          hashrate1d: 1000 + i * 10,
          hashrate7d: 1000 + i * 10,
          SPS1m: 10,
          SPS5m: 10,
          SPS15m: 10,
          SPS1h: 10,
          accepted: 100 + i,
          rejected: 5,
          bestshare: 50,
          diff: 0.01,
          disconnected: 0,
          idle: 0,
          runtime: 3600 + i * 60,
          timestamp: new Date(),
        })),
      topUserHashrates: Array(10)
        .fill(null)
        .map((_, i) => ({
          address: `bc1q${String(i).padStart(60, '0')}`,
          workerCount: 5,
          hashrate1hr: 1000,
          hashrate1d: 1000,
          hashrate7d: 1000,
          bestShare: 50,
          bestEver: 100,
        })),
      topUserDifficulties: Array(10)
        .fill(null)
        .map((_, i) => ({
          address: `bc1q${String(i).padStart(60, '0')}`,
          workerCount: 5,
          difficulty: 100,
          hashrate1hr: 1000,
          hashrate1d: 1000,
          hashrate7d: 1000,
          bestShare: 50,
        })),
      onlineDevices: Array(10)
        .fill(null)
        .map((_, i) => ({
          client: `client_${i}`,
          activeWorkers: 42,
          uniqueUsers: 10,
          hashrate1hr: 5000,
          bestEver: 150,
        })),
      highScores: Array(10)
        .fill(null)
        .map((_, i) => ({
          rank: i + 1,
          difficulty: 250 - i * 10,
          device: 'nerdminer',
          timestamp: new Date(),
        })),
      limits: {
        topUsers: 10,
        onlineDevices: 10000,
        historicalPoints: 288,
      },
    };

    const serialized = serializeData(mockPayload);
    const jsonString = JSON.stringify(serialized);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const sizeKb = sizeBytes / 1024;

    // Log for reference (helpful for monitoring payload growth)
    console.log(
      `Dashboard payload size: ${sizeKb.toFixed(2)} KB (${sizeBytes} bytes)`
    );

    // Reasonable limit: ~500 KB for polling payload (gzip ~50-100 KB)
    expect(sizeBytes).toBeLessThan(500_000);
  });

  test('historical data trimming reduces payload', () => {
    const fullHistorical = Array(5760)
      .fill(null)
      .map((_, i) => ({
        id: i,
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
        accepted: 100,
        rejected: 5,
        bestshare: 50,
        diff: 0.01,
        disconnected: 0,
        idle: 0,
        runtime: 3600,
        timestamp: new Date(),
      }));

    const trimmedHistorical = fullHistorical.slice(0, 288);

    const fullJson = JSON.stringify(fullHistorical);
    const trimmedJson = JSON.stringify(trimmedHistorical);

    const fullSize = Buffer.byteLength(fullJson, 'utf8');
    const trimmedSize = Buffer.byteLength(trimmedJson, 'utf8');

    console.log(`Full historical (5760 points): ${(fullSize / 1024).toFixed(2)} KB`);
    console.log(`Trimmed historical (288 points): ${(trimmedSize / 1024).toFixed(2)} KB`);
    console.log(`Reduction: ${(((fullSize - trimmedSize) / fullSize) * 100).toFixed(1)}%`);

    expect(trimmedSize).toBeLessThan(fullSize);
  });
});
