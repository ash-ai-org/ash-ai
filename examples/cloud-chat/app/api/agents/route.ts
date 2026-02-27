import { ashClient } from '@/lib/ash-cloud';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const agents = await ashClient.listAgents();
    return NextResponse.json({ agents });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list agents' },
      { status: 500 },
    );
  }
}
