import { ashClient } from '@/lib/ash';
import { NextRequest } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { content } = (await req.json()) as { content: string };

  if (!content) {
    return new Response(JSON.stringify({ error: 'content is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await ashClient.sendMessage(id, content, { includePartialMessages: true });

    // Pipe the raw SSE stream from the Ash server through to the browser
    if (!res.body) {
      return new Response(JSON.stringify({ error: 'No response body' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to send message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
