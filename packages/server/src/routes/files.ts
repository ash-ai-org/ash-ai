import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { getSession } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { FileEntry } from '@ash-ai/shared';

// Same skip list as state-persistence.ts — no value showing these to clients
const SKIP_NAMES = new Set([
  'node_modules', '.git', '__pycache__', '.cache', '.npm',
  '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp',
]);

const SKIP_EXTENSIONS = new Set(['.sock', '.lock', '.pid']);

// Max file size we'll return inline (1 MB)
const MAX_FILE_SIZE = 1_048_576;

/**
 * Recursively list files in a directory, returning flat paths relative to root.
 */
function listFiles(dir: string, root: string): FileEntry[] {
  const entries: FileEntry[] = [];

  let items: string[];
  try {
    items = readdirSync(dir);
  } catch {
    return entries;
  }

  for (const name of items) {
    if (SKIP_NAMES.has(name)) continue;
    if (SKIP_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) continue;

    const fullPath = join(dir, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      entries.push(...listFiles(fullPath, root));
    } else if (st.isFile()) {
      entries.push({
        path: relative(root, fullPath),
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }
  }

  return entries;
}

/**
 * Resolve the workspace directory for a session.
 * Prefers the live sandbox workspace; falls back to persisted snapshot.
 * Returns { dir, source } or null if neither exists.
 */
async function resolveWorkspace(
  coordinator: RunnerCoordinator,
  dataDir: string,
  session: { id: string; sandboxId: string; runnerId?: string | null },
): Promise<{ dir: string; source: 'sandbox' | 'snapshot' } | null> {
  // Try live sandbox first
  try {
    const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
    const sandbox = backend.getSandbox(session.sandboxId);
    if (sandbox && existsSync(sandbox.workspaceDir)) {
      return { dir: sandbox.workspaceDir, source: 'sandbox' };
    }
  } catch { /* runner gone */ }

  // Fall back to persisted snapshot
  const snapshotDir = join(dataDir, 'sessions', session.id, 'workspace');
  if (existsSync(snapshotDir)) {
    return { dir: snapshotDir, source: 'snapshot' };
  }

  return null;
}

const idParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
} as const;

export function fileRoutes(app: FastifyInstance, coordinator: RunnerCoordinator, dataDir: string): void {
  // List files in session workspace
  app.get<{ Params: { id: string } }>('/api/sessions/:id/files', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        200: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  size: { type: 'integer' },
                  modifiedAt: { type: 'string', format: 'date-time' },
                },
                required: ['path', 'size', 'modifiedAt'],
              },
            },
            source: { type: 'string', enum: ['sandbox', 'snapshot'] },
          },
          required: ['files', 'source'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const workspace = await resolveWorkspace(coordinator, dataDir, session);
    if (!workspace) {
      return reply.status(404).send({ error: 'No workspace available for this session', statusCode: 404 });
    }

    const files = listFiles(workspace.dir, workspace.dir);
    return reply.send({ files, source: workspace.source });
  });

  // Get single file content
  app.get<{ Params: { id: string; '*': string } }>('/api/sessions/:id/files/*', {
    schema: {
      tags: ['sessions'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          '*': { type: 'string' },
        },
        required: ['id', '*'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            size: { type: 'integer' },
            source: { type: 'string', enum: ['sandbox', 'snapshot'] },
          },
          required: ['path', 'content', 'size', 'source'],
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const filePath = req.params['*'];
    if (!filePath) {
      return reply.status(400).send({ error: 'File path required', statusCode: 400 });
    }

    // Path traversal protection
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return reply.status(400).send({ error: 'Invalid file path', statusCode: 400 });
    }

    const workspace = await resolveWorkspace(coordinator, dataDir, session);
    if (!workspace) {
      return reply.status(404).send({ error: 'No workspace available for this session', statusCode: 404 });
    }

    const fullPath = join(workspace.dir, filePath);

    // Ensure resolved path is still within workspace (belt and suspenders)
    if (!fullPath.startsWith(workspace.dir)) {
      return reply.status(400).send({ error: 'Invalid file path', statusCode: 400 });
    }

    let st;
    try {
      st = statSync(fullPath);
    } catch {
      return reply.status(404).send({ error: 'File not found', statusCode: 404 });
    }

    if (!st.isFile()) {
      return reply.status(400).send({ error: 'Path is not a file', statusCode: 400 });
    }

    if (st.size > MAX_FILE_SIZE) {
      return reply.status(400).send({ error: `File too large (${st.size} bytes, max ${MAX_FILE_SIZE})`, statusCode: 400 });
    }

    const content = readFileSync(fullPath, 'utf-8');
    return reply.send({
      path: filePath,
      content,
      size: st.size,
      source: workspace.source,
    });
  });
}
