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

    // Resolve the user first (getUserWithWorkersAndStats is cached); only built payloads are cached
    // below, so a not-found response is never stored.
    const userORM = await getUserWithWorkersAndStats(address);
    if (!userORM) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Pre-serialized payload per address, rebuilt at most once per USER_CACHE_SECONDS.
    const body = await getCached<string>(
      `userPayload:${address}`,
      USER_CACHE_SECONDS,
      async () => {
        const [poolStatsORM, historicalStatsORM] = await Promise.all([
          getLatestPoolStats(),
          getUserHistoricalStats(address),
        ]);
        return JSON.stringify({
          user: serializeData(userORM),
          poolStats: serializeData(poolStatsORM),
          historicalStats: serializeData(historicalStatsORM),
          generatedAt: new Date().toISOString(),
        });
      }
    );

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
