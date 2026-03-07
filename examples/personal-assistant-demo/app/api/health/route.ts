import { ashClient } from '@/lib/ash';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const health = await ashClient.health();
    return NextResponse.json(health);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to reach Ash server' },
      { status: 502 },
    );
  }
}
