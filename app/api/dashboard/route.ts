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

// Thrown by the loader when there are no stats; getCached does not store a throw, so it is mapped
// to 503 by the handler rather than cached.
class NoStatsError extends Error {}

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
    // Built + cached at most once per DASHBOARD_CACHE_SECONDS; the loader throws NoStatsError on the
    // empty state.
    const body = await getCached<string>(
      'dashboardBody',
      DASHBOARD_CACHE_SECONDS,
      async () => {
        const [
          latestStats,
          historicalStats,
          topHashrates,
          topDifficulties,
          topLoyalty,
          onlineDevices,
          highScores,
        ] = await Promise.all([
          getLatestPoolStats(),
          getHistoricalPoolStats(),
          getTopUserHashrates(DASHBOARD_TOP_LIMIT),
          getTopUserDifficulties(DASHBOARD_TOP_LIMIT),
          getTopUserLoyalty(DASHBOARD_TOP_LIMIT),
          getOnlineDevices(DASHBOARD_ONLINE_LIMIT),
          getTopBestDiffs(DASHBOARD_TOP_LIMIT),
        ]);

        if (!latestStats) throw new NoStatsError();

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
    if (error instanceof NoStatsError) {
      return NextResponse.json(
        { error: 'No stats available' },
        { status: 503 }
      );
    }
    console.error('Error building dashboard payload:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
