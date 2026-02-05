import { NextResponse } from 'next/server';

import { getTopUserLoyalty } from '../../../lib/api';
import { serializeData } from '../../../utils/helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit')) || 100;

    const loyalty = await getTopUserLoyalty(limit);

    const payload = {
      data: serializeData(loyalty),
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching top loyalty:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
