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

// Thrown by the loader when the user is not found; getCached does not store a throw, so it is mapped
// to 404 by the handler rather than cached.
class UserNotFoundError extends Error {}

export async function GET(
  request: Request,
  { params }: { params: { address: string } }
) {
  try {
    const address = decodeURIComponent(params.address);

    if (!validateBitcoinAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // Built + cached per address at most once per USER_CACHE_SECONDS; the loader throws
    // UserNotFoundError when the user is absent.
    const body = await getCached<string>(
      `userPayload:${address}`,
      USER_CACHE_SECONDS,
      async () => {
        const [userORM, poolStatsORM, historicalStatsORM] = await Promise.all([
          getUserWithWorkersAndStats(address),
          getLatestPoolStats(),
          getUserHistoricalStats(address),
        ]);

        if (!userORM) throw new UserNotFoundError();

        return JSON.stringify({
          user: serializeData(userORM),
          poolStats: serializeData(poolStatsORM),
          historicalStats: serializeData(historicalStatsORM),
          generatedAt: new Date().toISOString(),
        });
      }
    );

    return new NextResponse(body, {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
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
