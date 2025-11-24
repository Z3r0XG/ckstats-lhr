import { NextResponse } from 'next/server';

// This debug route was used only for local testing. It now returns 404
// to avoid exposing debug functionality in production builds. If you need
// to re-enable it for local debugging, restore the previous implementation
// from the feature branch history.

export async function GET() {
  return new NextResponse('Not Found', { status: 404 });
}

export async function POST() {
  return new NextResponse('Not Found', { status: 404 });
}
