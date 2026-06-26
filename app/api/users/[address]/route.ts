import { NextResponse } from 'next/server';

import {
  getCached,
  getUserWithWorkersAndStats,
  getUserHistoricalStats,
  getLatestPoolStats,
} from '../../../../lib/api';
import { serializeData } from '../../../../utils/helpers';
import { validateBitcoinAddress } from '../../../../utils/validateBitcoinAddress';

const USER_CACHE_SECONDS = 30;

export async function GET(
  request: Request,
  { params }: { params: { address: string } }
) {
  try {
    const address = decodeURIComponent(params.address);

    if (!validateBitcoinAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // Pre-serialized payload per address, rebuilt at most once per USER_CACHE_SECONDS; null = not found.
    const body = await getCached<string | null>(
      `userPayload:${address}`,
      USER_CACHE_SECONDS,
      async () => {
        const [userORM, poolStatsORM, historicalStatsORM] = await Promise.all([
          getUserWithWorkersAndStats(address),
          getLatestPoolStats(),
          getUserHistoricalStats(address),
        ]);

        if (!userORM) return null;

        return JSON.stringify({
          user: serializeData(userORM),
          poolStats: serializeData(poolStatsORM),
          historicalStats: serializeData(historicalStatsORM),
          generatedAt: new Date().toISOString(),
        });
      }
    );

    if (body === null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return new NextResponse(body, {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof URIError) {
      return NextResponse.json(
        { error: 'Invalid address encoding' },
        { status: 400 }
      );
    }
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
