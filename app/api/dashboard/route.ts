import { NextResponse } from 'next/server';

import {
  getCached,
  getHistoricalPoolStats,
  getLatestPoolStats,
  getOnlineDevices,
  getTopBestDiffs,
  getTopUserDifficulties,
  getTopUserHashrates,
  getTopUserLoyalty,
} from '../../../lib/api';
import { getServiceSnapshot } from '../../../lib/poolHealth';
import { serializeData } from '../../../utils/helpers';

export const dynamic = 'force-dynamic';

const DASHBOARD_TOP_LIMIT = 10;
const DASHBOARD_ONLINE_LIMIT = 10000;
const DASHBOARD_CACHE_SECONDS = 30;

export async function GET(request: Request) {
  try {
    // Debug mode: force error for testing
    const { searchParams } = new URL(request.url);
    if (searchParams.get('debug_error') === 'true') {
      return NextResponse.json(
        { error: 'Debug mode: Simulated fetch error' },
        { status: 500 }
      );
    }
    // Resolve latest stats first (getLatestPoolStats is cached); only the built payload is cached
    // below, so a "no stats" 503 is never stored.
    const latestStats = await getLatestPoolStats();
    if (!latestStats) {
      return NextResponse.json(
        { error: 'No stats available' },
        { status: 503 }
      );
    }

    // Pre-serialized payload, rebuilt at most once per DASHBOARD_CACHE_SECONDS.
    const body = await getCached<string>(
      'dashboardBody',
      DASHBOARD_CACHE_SECONDS,
      async () => {
        const [
          historicalStats,
          topHashrates,
          topDifficulties,
          topLoyalty,
          onlineDevices,
          highScores,
        ] = await Promise.all([
          getHistoricalPoolStats(),
          getTopUserHashrates(DASHBOARD_TOP_LIMIT),
          getTopUserDifficulties(DASHBOARD_TOP_LIMIT),
          getTopUserLoyalty(DASHBOARD_TOP_LIMIT),
          getOnlineDevices(DASHBOARD_ONLINE_LIMIT),
          getTopBestDiffs(DASHBOARD_TOP_LIMIT),
        ]);

        return JSON.stringify({
          version: 1,
          generatedAt: new Date().toISOString(),
          latestStats: serializeData(latestStats),
          historicalStats: serializeData(historicalStats),
          topUserHashrates: serializeData(topHashrates),
          topUserDifficulties: serializeData(topDifficulties),
          topUserLoyalty: serializeData(topLoyalty),
          onlineDevices: serializeData(onlineDevices),
          highScores: serializeData(highScores),
          service: getServiceSnapshot(),
          limits: {
            topUsers: DASHBOARD_TOP_LIMIT,
            onlineDevices: DASHBOARD_ONLINE_LIMIT,
            historicalPoints: (historicalStats || []).length,
          },
        });
      }
    );

    return new NextResponse(body, {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Error building dashboard payload:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
