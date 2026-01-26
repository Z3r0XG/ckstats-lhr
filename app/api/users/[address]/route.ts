import { NextResponse } from 'next/server';

import {
  getUserWithWorkersAndStats,
  getUserHistoricalStats,
  getLatestPoolStats,
} from '../../../../lib/api';
import { serializeData } from '../../../../utils/helpers';
import { validateBitcoinAddress } from '../../../../utils/validateBitcoinAddress';

export async function GET(
  request: Request,
  { params }: { params: { address: string } }
) {
  try {
    const address = params.address;

    if (!validateBitcoinAddress(address)) {
      return NextResponse.json(
        { error: 'Invalid Bitcoin address' },
        { status: 400 }
      );
    }

    const [userORM, poolStatsORM, historicalStatsORM] = await Promise.all([
      getUserWithWorkersAndStats(address),
      getLatestPoolStats(),
      getUserHistoricalStats(address),
    ]);

    if (!userORM) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = serializeData(userORM);
    const poolStats = serializeData(poolStatsORM);
    const historicalStats = serializeData(historicalStatsORM);

    const payload = {
      user,
      poolStats,
      historicalStats,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
