import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync, readFileSync, existsSync, createReadStream, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, relative, basename, extname, dirname, resolve, normalize } from 'node:path';
import { getSession } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { FileEntry, WriteFileInput, WriteFileResult } from '@ash-ai/shared';

// Always skip — these are large/noisy and never useful to browse
const ALWAYS_SKIP = new Set([
  'node_modules', '.git', '__pycache__',
]);

// Additional dirs to skip when includeHidden is false
const HIDDEN_SKIP = new Set([
  '.cache', '.npm', '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp',
]);

const SKIP_EXTENSIONS = new Set(['.sock', '.lock', '.pid']);

// Max file size for JSON mode (1 MB) — encoding huge files as JSON strings is wasteful
const MAX_JSON_FILE_SIZE = 1_048_576;

// Max file size for raw streaming (100 MB) — prevent abuse
const MAX_RAW_FILE_SIZE = 104_857_600;

// Max decoded size for a single file write (50 MB)
const MAX_WRITE_FILE_SIZE = 52_428_800;

// Max total decoded size per batch write request (100 MB)
const MAX_WRITE_BATCH_SIZE = 104_857_600;

// Max files per batch write
const MAX_WRITE_BATCH_FILES = 500;

/** Simple extension → MIME type map. No external dependency needed. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/plain',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.sql': 'text/x-sql',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Recursively list files in a directory, returning flat paths relative to root.
 * When includeHidden is true (the default), only ALWAYS_SKIP dirs are filtered.
 * When false, HIDDEN_SKIP dirs are also filtered out.
 */
function listFiles(dir: string, root: string, includeHidden = true): FileEntry[] {
  const entries: FileEntry[] = [];

  let items: string[];
  try {
    items = readdirSync(dir);
  } catch {
    return entries;
  }

  for (const name of items) {
    if (ALWAYS_SKIP.has(name)) continue;
    if (!includeHidden && HIDDEN_SKIP.has(name)) continue;
    if (SKIP_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) continue;

    const fullPath = join(dir, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      entries.push(...listFiles(fullPath, root, includeHidden));
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
  app.get<{ Params: { id: string }; Querystring: { includeHidden?: string } }>('/api/sessions/:id/files', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: {
          includeHidden: { type: 'string', enum: ['true', 'false'] },
        },
      },
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

    // Default to true — show hidden dirs like .claude
    const includeHidden = req.query.includeHidden !== 'false';
    const files = listFiles(workspace.dir, workspace.dir, includeHidden);
    return reply.send({ files, source: workspace.source });
  });

  // Get single file content (raw by default, JSON with ?format=json)
  app.get<{ Params: { id: string; '*': string }; Querystring: { format?: string } }>('/api/sessions/:id/files/*', {
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
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'raw'] },
        },
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

    const format = req.query.format;

    // JSON mode: backwards-compatible JSON-wrapped response
    if (format === 'json') {
      if (st.size > MAX_JSON_FILE_SIZE) {
        return reply.status(400).send({ error: `File too large (${st.size} bytes, max ${MAX_JSON_FILE_SIZE})`, statusCode: 400 });
      }

      const content = readFileSync(fullPath, 'utf-8');
      return reply.send({
        path: filePath,
        content,
        size: st.size,
        source: workspace.source,
      });
    }

    // Raw mode (default): stream file bytes with proper headers
    if (st.size > MAX_RAW_FILE_SIZE) {
      return reply.status(400).send({ error: `File too large (${st.size} bytes, max ${MAX_RAW_FILE_SIZE})`, statusCode: 400 });
    }

    const fileName = basename(filePath);
    const mimeType = getMimeType(filePath);

    void reply
      .header('Content-Type', mimeType)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
      .header('Content-Length', st.size)
      .header('X-Ash-Source', workspace.source);

    const stream = createReadStream(fullPath);
    return reply.send(stream);
  });

  // Write files to session workspace (batch)
  app.post<{ Params: { id: string }; Body: { files: WriteFileInput[]; targetPath?: string } }>('/api/sessions/:id/files', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      body: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                mimeType: { type: 'string' },
              },
              required: ['path', 'content'],
            },
            minItems: 1,
            maxItems: MAX_WRITE_BATCH_FILES,
          },
          targetPath: { type: 'string', default: '.' },
        },
        required: ['files'],
      },
    },
    // Increase body limit for large file uploads (base64 expands ~33%)
    bodyLimit: MAX_WRITE_BATCH_SIZE * 2,
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const workspace = await resolveWorkspace(coordinator, dataDir, session);
    if (!workspace) {
      return reply.status(404).send({ error: 'No workspace available for this session', statusCode: 404 });
    }

    const { files, targetPath = '.' } = req.body;
    const results: WriteFileResult[] = [];
    let totalSize = 0;

    for (const file of files) {
      const relPath = targetPath === '.' ? file.path : join(targetPath, file.path);

      // Path traversal protection
      if (relPath.includes('..') || relPath.startsWith('/')) {
        results.push({ path: file.path, written: false, error: 'Invalid file path' });
        continue;
      }

      const fullPath = join(workspace.dir, relPath);
      const resolved = resolve(fullPath);

      // Belt and suspenders: ensure resolved path is within workspace
      if (!resolved.startsWith(resolve(workspace.dir))) {
        results.push({ path: file.path, written: false, error: 'Invalid file path' });
        continue;
      }

      try {
        const decoded = Buffer.from(file.content, 'base64');

        if (decoded.length > MAX_WRITE_FILE_SIZE) {
          results.push({ path: file.path, written: false, error: `File too large (${decoded.length} bytes, max ${MAX_WRITE_FILE_SIZE})` });
          continue;
        }

        totalSize += decoded.length;
        if (totalSize > MAX_WRITE_BATCH_SIZE) {
          results.push({ path: file.path, written: false, error: 'Batch size limit exceeded' });
          continue;
        }

        // Ensure parent directory exists
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, decoded);

        const st = statSync(fullPath);
        results.push({ path: file.path, written: true, size: st.size });
      } catch (err) {
        results.push({
          path: file.path,
          written: false,
          error: err instanceof Error ? err.message : 'Write failed',
        });
      }
    }

    return reply.send({ files: results });
  });

  // Delete a file from session workspace
  app.delete<{ Params: { id: string; '*': string } }>('/api/sessions/:id/files/*', {
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
    const resolved = resolve(fullPath);

    if (!resolved.startsWith(resolve(workspace.dir))) {
      return reply.status(400).send({ error: 'Invalid file path', statusCode: 400 });
    }

    try {
      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: 'File not found', statusCode: 404 });
      }

      const st = statSync(fullPath);
      if (!st.isFile()) {
        return reply.status(400).send({ error: 'Path is not a file', statusCode: 400 });
      }

      unlinkSync(fullPath);
      return reply.send({ path: filePath, deleted: true });
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Delete failed',
        statusCode: 500,
      });
    }
  });
}
