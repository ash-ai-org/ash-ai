import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { upsertAgent, getAgent, listAgents, deleteAgent } from '../db/index.js';

const nameParam = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const;

export function agentRoutes(app: FastifyInstance, dataDir: string): void {
  // Deploy agent (provide local path to agent directory)
  app.post('/api/agents', {
    schema: {
      tags: ['agents'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['name', 'path'],
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
    const { name, path } = req.body as { name: string; path: string };

    // Resolve relative paths against dataDir
    const resolvedPath = isAbsolute(path) ? path : join(dataDir, path);

    // Validate: CLAUDE.md must exist
    if (!existsSync(join(resolvedPath, 'CLAUDE.md'))) {
      return reply.status(400).send({ error: 'Agent directory must contain CLAUDE.md', statusCode: 400 });
    }

    const agent = await upsertAgent(name, resolvedPath, req.tenantId);
    return reply.status(201).send({ agent });
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
    return reply.send({ agents });
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
    return reply.send({ agent });
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
}
