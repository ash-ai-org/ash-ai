import { ashClient } from '@/lib/ash';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const agent = req.nextUrl.searchParams.get('agent') || undefined;
    const sessions = await ashClient.listSessions(agent);
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list sessions' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agent } = (await req.json()) as { agent: string };
    if (!agent) {
      return NextResponse.json({ error: 'agent is required' }, { status: 400 });
    }
    const session = await ashClient.createSession(agent);
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create session' },
      { status: 500 },
    );
  }
}
