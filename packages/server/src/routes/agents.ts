import type { FastifyInstance } from 'fastify';
import { existsSync, readdirSync, statSync, readFileSync, createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, relative, basename, extname, dirname, resolve, sep } from 'node:path';
import { upsertAgent, getAgent, listAgents, updateAgent, deleteAgent } from '../db/index.js';
import type { FileEntry } from '@ash-ai/shared';
import type { SandboxPool } from '@ash-ai/sandbox';
import { syncAgentToCloud } from '@ash-ai/sandbox';

// Same skip list as files.ts
const SKIP_NAMES = new Set([
  'node_modules', '.git', '__pycache__', '.cache', '.npm',
  '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp',
]);

const SKIP_EXTENSIONS = new Set(['.sock', '.lock', '.pid']);

const MAX_JSON_FILE_SIZE = 1_048_576;

function listFilesRecursive(dir: string, root: string): FileEntry[] {
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
      entries.push(...listFilesRecursive(fullPath, root));
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

const nameParam = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const;

/** Redact env values so API responses don't leak secrets. Returns key names with masked values. */
function redactEnv(env: Record<string, string> | null | undefined): Record<string, string> | undefined {
  if (!env || Object.keys(env).length === 0) return undefined;
  const redacted: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    redacted[key] = '***';
  }
  return redacted;
}

/** Return agent object with env values redacted. */
function redactAgent<T extends { env?: Record<string, string> | null }>(agent: T): T {
  return { ...agent, env: redactEnv(agent.env) };
}

export function agentRoutes(app: FastifyInstance, dataDir: string, pool?: SandboxPool | null): void {
  // Deploy agent (provide local path to agent directory, or create managed agent from systemPrompt/files)
  app.post('/api/agents', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
      },
    },
    schema: {
      tags: ['agents'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255, pattern: '^[a-zA-Z0-9_-]+$' },
          path: { type: 'string', maxLength: 4096 },
          systemPrompt: { type: 'string', maxLength: 1_000_000 },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
          env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Default environment variables injected into every session sandbox' },
        },
        required: ['name'],
      },
      response: {
        201: {
          type: 'object',
          properties: { agent: { $ref: 'Agent#' } },
          required: ['agent'],
        },
        400: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const { name, path: inputPath, systemPrompt, files, env } = req.body as {
      name: string;
      path?: string;
      systemPrompt?: string;
      files?: Array<{ path: string; content: string }>;
      env?: Record<string, string>;
    };

    let resolvedPath: string;

    if (inputPath) {
      // CLI deploy flow: resolve provided path
      resolvedPath = isAbsolute(inputPath) ? inputPath : join(dataDir, inputPath);

      // Validate: CLAUDE.md must exist
      if (!existsSync(join(resolvedPath, 'CLAUDE.md'))) {
        return reply.status(400).send({ error: 'Agent directory must contain CLAUDE.md', statusCode: 400 });
      }
    } else {
      // Managed agent: create directory at dataDir/agents/<name>/
      resolvedPath = join(dataDir, 'agents', name);
      mkdirSync(resolvedPath, { recursive: true });

      // Write uploaded files (base64-decoded)
      let hasClaudeMd = false;
      if (files && files.length > 0) {
        for (const file of files) {
          // Path traversal protection
          if (file.path.includes('..') || file.path.startsWith('/')) continue;
          const fileDest = resolve(join(resolvedPath, file.path));
          const resolvedBase = resolve(resolvedPath);
          if (!fileDest.startsWith(resolvedBase + sep)) continue;
          mkdirSync(dirname(fileDest), { recursive: true });
          writeFileSync(fileDest, Buffer.from(file.content, 'base64'));
          if (file.path === 'CLAUDE.md') hasClaudeMd = true;
        }
      }

      // Write CLAUDE.md from systemPrompt if not already provided via files
      if (!hasClaudeMd && systemPrompt) {
        writeFileSync(join(resolvedPath, 'CLAUDE.md'), systemPrompt);
        hasClaudeMd = true;
      }

      // Write placeholder CLAUDE.md if nothing else created it
      if (!hasClaudeMd) {
        writeFileSync(join(resolvedPath, 'CLAUDE.md'), `# ${name}\n`);
      }
    }

    const agent = await upsertAgent(name, resolvedPath, req.tenantId, env);

    // Best-effort backup to cloud storage (non-blocking)
    syncAgentToCloud(name, resolvedPath, req.tenantId).catch((err) =>
      console.error(`[agents] Cloud sync failed for ${name}:`, err)
    );

    // Pre-warm sandboxes (defaults to 1 if not configured)
    const preWarmCount = (agent.config as Record<string, unknown> | undefined)?.preWarmCount;
    const warmCount = typeof preWarmCount === 'number' ? preWarmCount : 1;
    if (pool && warmCount > 0) {
      pool.warmUp(agent.name, agent.path, warmCount, agent.env ? { extraEnv: agent.env } : undefined).catch((err) =>
        console.error(`[server] Pre-warm failed for ${agent.name}:`, err)
      );
    }

    return reply.status(201).send({ agent: redactAgent(agent) });
  });

  // List agents
  app.get('/api/agents', {
    schema: {
      tags: ['agents'],
      response: {
        200: {
          type: 'object',
          properties: {
            agents: { type: 'array', items: { $ref: 'Agent#' } },
          },
          required: ['agents'],
        },
      },
    },
  }, async (req, reply) => {
    const agents = await listAgents(req.tenantId);
    return reply.send({ agents: agents.map(redactAgent) });
  });

  // Get agent
  app.get<{ Params: { name: string } }>('/api/agents/:name', {
    schema: {
      tags: ['agents'],
      params: nameParam,
      response: {
        200: {
          type: 'object',
          properties: { agent: { $ref: 'Agent#' } },
          required: ['agent'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }
    return reply.send({ agent: redactAgent(agent) });
  });

  // Delete agent
  app.delete<{ Params: { name: string } }>('/api/agents/:name', {
    schema: {
      tags: ['agents'],
      params: nameParam,
      response: {
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const deleted = await deleteAgent(req.params.name, req.tenantId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }
    return reply.send({ ok: true });
  });

  // Update agent
  app.patch<{ Params: { name: string } }>('/api/agents/:name', {
    schema: {
      tags: ['agents'],
      params: nameParam,
      body: {
        type: 'object',
        properties: {
          env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Default environment variables injected into every session sandbox' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { agent: { $ref: 'Agent#' } },
          required: ['agent'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const { env } = req.body as { env?: Record<string, string> };

    const existing = await getAgent(req.params.name, req.tenantId);
    if (!existing) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const agent = await updateAgent(req.params.name, { env }, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }
    return reply.send({ agent: redactAgent(agent) });
  });

  // List files in agent directory
  app.get<{ Params: { name: string } }>('/api/agents/:name/files', {
    schema: {
      tags: ['agents'],
      params: nameParam,
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
          },
          required: ['files'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    if (!existsSync(agent.path)) {
      return reply.status(404).send({ error: 'Agent directory not found on disk', statusCode: 404 });
    }

    const files = listFilesRecursive(agent.path, agent.path);
    return reply.send({ files });
  });

  // Get single file from agent directory
  app.get<{ Params: { name: string; '*': string }; Querystring: { format?: string } }>('/api/agents/:name/files/*', {
    schema: {
      tags: ['agents'],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          '*': { type: 'string' },
        },
        required: ['name', '*'],
      },
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'raw'] },
        },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const filePath = req.params['*'];
    if (!filePath) {
      return reply.status(400).send({ error: 'File path required', statusCode: 400 });
    }

    // Path traversal protection
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return reply.status(400).send({ error: 'Invalid file path', statusCode: 400 });
    }

    const fullPath = join(agent.path, filePath);

    // Belt and suspenders: ensure resolved path stays within agent dir
    if (!fullPath.startsWith(agent.path)) {
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

    // Default to JSON mode for agent config files (typically small text)
    const format = req.query.format ?? 'json';

    if (format === 'json') {
      if (st.size > MAX_JSON_FILE_SIZE) {
        return reply.status(400).send({ error: `File too large (${st.size} bytes, max ${MAX_JSON_FILE_SIZE})`, statusCode: 400 });
      }
      const content = readFileSync(fullPath, 'utf-8');
      return reply.send({ path: filePath, content, size: st.size });
    }

    // Raw mode
    const fileName = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = ext === '.md' ? 'text/markdown' : ext === '.json' ? 'application/json' : 'application/octet-stream';
    void reply
      .header('Content-Type', mimeType)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
      .header('Content-Length', st.size);
    return reply.send(createReadStream(fullPath));
  });
}
