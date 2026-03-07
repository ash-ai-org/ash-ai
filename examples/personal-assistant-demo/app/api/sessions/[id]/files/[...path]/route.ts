import { ashClient } from '@/lib/ash';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await params;
  const filePath = path.join('/');

  try {
    const upstream = await ashClient.downloadSessionFileRaw(id, filePath);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Disposition': upstream.headers.get('Content-Disposition') || `attachment; filename="${filePath.split('/').pop()}"`,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Failed to download file' },
      { status: 500 },
    );
  }
}
