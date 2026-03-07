import { ashClient } from '@/lib/ash';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await ashClient.resumeSession(id);
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to resume session' },
      { status: 500 },
    );
  }
}
