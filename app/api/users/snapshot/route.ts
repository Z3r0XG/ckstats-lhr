import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getUserWithWorkersAndStats } from '../../../../lib/api';
import { getDb } from '../../../../lib/db';
import { User } from '../../../../lib/entities/User';
import { UserStats } from '../../../../lib/entities/UserStats';
import { Worker } from '../../../../lib/entities/Worker';

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

    const db = await getDb();

    const userRepo = db.getRepository(User);
    const userRow = await userRepo.findOne({
      where: { address },
      select: ['updatedAt'],
    });

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const statsMax = await db
      .getRepository(UserStats)
      .createQueryBuilder('s')
      .select('MAX(s.timestamp)', 'maxTs')
      .where('s.userAddress = :address', { address })
      .getRawOne();

    const workersMax = await db
      .getRepository(Worker)
      .createQueryBuilder('w')
      .select('MAX(w.lastUpdate)', 'maxW')
      .where('w.userAddress = :address', { address })
      .getRawOne();

    const userUpdatedAt = userRow.updatedAt
      ? new Date(userRow.updatedAt).getTime()
      : 0;
    const statsUpdatedAt = statsMax?.maxTs
      ? new Date(statsMax.maxTs).getTime()
      : 0;
    const workersUpdatedAt = workersMax?.maxW
      ? new Date(workersMax.maxW).getTime()
      : 0;

    const rawLastModifiedTs = Math.max(
      userUpdatedAt,
      statsUpdatedAt,
      workersUpdatedAt
    );
    const lastModifiedTs =
      Math.floor((rawLastModifiedTs || Date.now()) / 1000) * 1000;

    if (ifModifiedSince) {
      const sinceTs = Date.parse(ifModifiedSince);
      if (!isNaN(sinceTs) && sinceTs >= lastModifiedTs) {
        return new NextResponse(null, { status: 304 });
      }
    }

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
