import { NextResponse } from 'next/server';

import {
  getHistoricalPoolStats,
  getLatestPoolStats,
  getOnlineDevices,
  getTopBestDiffs,
  getTopUserDifficulties,
  getTopUserHashrates,
} from '../../../lib/api';
import { serializeData } from '../../../utils/helpers';

export const revalidate = 5;

const DASHBOARD_TOP_LIMIT = 10;
const DASHBOARD_ONLINE_LIMIT = 10000;
const DASHBOARD_HISTORICAL_POINTS = 5760; // Match official ckstats default data points

export async function GET() {
  try {
    const [
      latestStats,
      historicalStats,
      topHashrates,
      topDifficulties,
      onlineDevices,
      highScores,
    ] = await Promise.all([
      getLatestPoolStats(),
      getHistoricalPoolStats(),
      getTopUserHashrates(DASHBOARD_TOP_LIMIT),
      getTopUserDifficulties(DASHBOARD_TOP_LIMIT),
      getOnlineDevices(DASHBOARD_ONLINE_LIMIT),
      getTopBestDiffs(DASHBOARD_TOP_LIMIT),
    ]);

    if (!latestStats) {
      return NextResponse.json(
        { error: 'No stats available' },
        { status: 503 }
      );
    }

    const trimmedHistorical = (historicalStats || []).slice(
      0,
      DASHBOARD_HISTORICAL_POINTS
    );

    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      latestStats: serializeData(latestStats),
      historicalStats: serializeData(trimmedHistorical),
      topUserHashrates: serializeData(topHashrates),
      topUserDifficulties: serializeData(topDifficulties),
      onlineDevices: serializeData(onlineDevices),
      highScores: serializeData(highScores),
      limits: {
        topUsers: DASHBOARD_TOP_LIMIT,
        onlineDevices: DASHBOARD_ONLINE_LIMIT,
        historicalPoints: DASHBOARD_HISTORICAL_POINTS,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error building dashboard payload:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
