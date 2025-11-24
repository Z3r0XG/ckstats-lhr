import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getUserWithWorkersAndStats } from '../../../../lib/api';
import { getDb } from '../../../../lib/db';
import { User } from '../../../../lib/entities/User';
import { UserStats } from '../../../../lib/entities/UserStats';

// Lightweight snapshot endpoint with If-Modified-Since handling.
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');
    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const ifModifiedSince = request.headers.get('if-modified-since');

    // Try to use cached helper result first (avoid DB work)
    // Access the internal cache via require of lib/api's internal accessor is not ideal,
    // but we can attempt a lightweight DB check if no cache present.

    const db = await getDb();

    // Find latest timestamps cheaply using entity repositories
    const userRepo = db.getRepository(User);
    const userRow = await userRepo.findOne({
      where: { address },
      select: ['updatedAt'],
    });

    const statsMax = await db
      .getRepository(UserStats)
      .createQueryBuilder('s')
      .select('MAX(s.timestamp)', 'maxTs')
      .where('s.userAddress = :address', { address })
      .getRawOne();

    const userUpdatedAt = userRow?.updatedAt
      ? new Date(userRow.updatedAt).getTime()
      : 0;
    const statsUpdatedAt = statsMax?.maxTs
      ? new Date(statsMax.maxTs).getTime()
      : 0;
    // Normalize to seconds precision to match HTTP Last-Modified header granularity
    const rawLastModifiedTs = Math.max(userUpdatedAt, statsUpdatedAt);
    const lastModifiedTs =
      Math.floor((rawLastModifiedTs || Date.now()) / 1000) * 1000;

    if (ifModifiedSince) {
      const sinceTs = Date.parse(ifModifiedSince);
      // Allow a 1s tolerance for header rounding differences
      if (!isNaN(sinceTs) && sinceTs >= lastModifiedTs) {
        return new NextResponse(null, { status: 304 });
      }
    }

    // Need to return full snapshot. Use existing helper which is cached.
    const snapshot = await getUserWithWorkersAndStats(address);
    if (!snapshot)
      return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const res = NextResponse.json(snapshot);
    res.headers.set('Last-Modified', new Date(lastModifiedTs).toUTCString());
    return res;
  } catch (error) {
    console.error('Error in snapshot endpoint:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
