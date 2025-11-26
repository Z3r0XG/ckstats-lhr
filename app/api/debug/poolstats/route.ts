import { NextResponse } from 'next/server';


export async function GET() {
  return new NextResponse('Not Found', { status: 404 });
}
