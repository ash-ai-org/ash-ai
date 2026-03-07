import { ashClient } from '@/lib/ash';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await ashClient.getSessionFiles(id);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Failed to list files' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { files, targetPath } = (await req.json()) as {
      files: { path: string; content: string; mimeType?: string }[];
      targetPath?: string;
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'files array is required' }, { status: 400 });
    }

    const result = await ashClient.writeSessionFiles(id, files, targetPath);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Failed to upload files' },
      { status: 500 },
    );
  }
}
