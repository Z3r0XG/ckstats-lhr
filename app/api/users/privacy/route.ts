import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getDb } from '../../../../lib/db';
import { User } from '../../../../lib/entities/User';

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository(User);
    const user = await repo.findOne({ where: { address } });

    return NextResponse.json({ isPublic: user?.isPublic ?? false });
  } catch (error) {
    console.error('Error fetching privacy state:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
