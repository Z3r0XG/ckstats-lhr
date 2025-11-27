import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('Not Found', { status: 404 });
}

export async function POST() {
  return new NextResponse('Not Found', { status: 404 });
}
