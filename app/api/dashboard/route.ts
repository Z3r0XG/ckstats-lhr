import { NextResponse } from 'next/server';

import {
  getHistoricalPoolStats,
  getLatestPoolStats,
  getOnlineDevices,
  getTopBestDiffs,
  getTopUserDifficulties,
  getTopUserHashrates,
  getTopUserLoyalty,
} from '../../../lib/api';
import { serializeData } from '../../../utils/helpers';

export const dynamic = 'force-dynamic';

const DASHBOARD_TOP_LIMIT = 10;
const DASHBOARD_ONLINE_LIMIT = 10000;

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

    if (!latestStats) {
      return NextResponse.json(
        { error: 'No stats available' },
        { status: 503 }
      );
    }

    const maskAddress = (addr: string) =>
      typeof addr === 'string' && addr.length > 10
        ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
        : addr;

    const maskedTopHashrates = (topHashrates || []).map((u) => ({
      ...u,
      address: maskAddress(u.address),
    }));
    const maskedTopDifficulties = (topDifficulties || []).map((u) => ({
      ...u,
      address: maskAddress(u.address),
    }));
    const maskedTopLoyalty = (topLoyalty || []).map((u) => ({
      ...u,
      address: maskAddress(u.address),
    }));

    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      latestStats: serializeData(latestStats),
      historicalStats: serializeData(historicalStats),
      topUserHashrates: serializeData(maskedTopHashrates),
      topUserDifficulties: serializeData(maskedTopDifficulties),
      topUserLoyalty: serializeData(maskedTopLoyalty),
      onlineDevices: serializeData(onlineDevices),
      highScores: serializeData(highScores),
      limits: {
        topUsers: DASHBOARD_TOP_LIMIT,
        onlineDevices: DASHBOARD_ONLINE_LIMIT,
        historicalPoints: (historicalStats || []).length,
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
