import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  getAgent,
  insertAgentVersion,
  getAgentVersion,
  getAgentVersionByNumber,
  getActiveAgentVersion,
  listAgentVersions,
  activateAgentVersion,
  getNextVersionNumber,
  updateAgentVersion,
  deleteAgentVersion,
} from '../db/index.js';

const nameParam = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const;

const nameAndVersionParams = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    versionNumber: { type: 'string' },
  },
  required: ['name', 'versionNumber'],
} as const;

const agentVersionObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    agentName: { type: 'string' },
    versionNumber: { type: 'integer' },
    name: { type: 'string' },
    systemPrompt: { type: ['string', 'null'] },
    releaseNotes: { type: ['string', 'null'] },
    isActive: { type: 'boolean' },
    knowledgeFiles: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    createdBy: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'agentName', 'versionNumber', 'name', 'isActive', 'createdAt', 'updatedAt'],
} as const;

export function agentVersionRoutes(app: FastifyInstance): void {
  // List versions for an agent
  app.get<{ Params: { name: string } }>('/api/agents/:name/versions', {
    schema: {
      tags: ['agents'],
      params: nameParam,
      response: {
        200: {
          type: 'object',
          properties: {
            versions: { type: 'array', items: agentVersionObject },
          },
          required: ['versions'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const versions = await listAgentVersions(req.params.name, req.tenantId);
    return reply.send({ versions });
  });

  // Create a new version for an agent
  app.post<{ Params: { name: string } }>('/api/agents/:name/versions', {
    schema: {
      tags: ['agents'],
      params: nameParam,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255 },
          systemPrompt: { type: 'string', maxLength: 1_000_000 },
          releaseNotes: { type: 'string', maxLength: 10_000 },
          knowledgeFiles: {
            type: 'array',
            items: { type: 'string' },
          },
          cloneFrom: { type: 'integer', minimum: 1 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { version: agentVersionObject },
          required: ['version'],
        },
        404: { $ref: 'ApiError#' },
        400: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const body = req.body as {
      name?: string;
      systemPrompt?: string;
      releaseNotes?: string;
      knowledgeFiles?: string[];
      cloneFrom?: number;
    } | undefined;

    let systemPrompt = body?.systemPrompt ?? null;
    let knowledgeFiles = body?.knowledgeFiles ?? null;

    // If cloneFrom is specified, copy systemPrompt and knowledgeFiles from that version
    if (body?.cloneFrom != null) {
      const sourceVersion = await getAgentVersionByNumber(req.params.name, body.cloneFrom, req.tenantId);
      if (!sourceVersion) {
        return reply.status(400).send({ error: `Source version ${body.cloneFrom} not found`, statusCode: 400 });
      }
      systemPrompt = systemPrompt ?? sourceVersion.systemPrompt;
      knowledgeFiles = knowledgeFiles ?? sourceVersion.knowledgeFiles;
    }

    const versionNumber = await getNextVersionNumber(req.params.name, req.tenantId);
    const id = randomUUID();
    const versionName = body?.name ?? `v${versionNumber}`;

    const version = await insertAgentVersion(id, req.tenantId, req.params.name, versionNumber, {
      name: versionName,
      systemPrompt,
      releaseNotes: body?.releaseNotes ?? null,
      knowledgeFiles,
    });

    return reply.status(201).send({ version });
  });

  // Get a specific version by version number
  app.get<{ Params: { name: string; versionNumber: string } }>('/api/agents/:name/versions/:versionNumber', {
    schema: {
      tags: ['agents'],
      params: nameAndVersionParams,
      response: {
        200: {
          type: 'object',
          properties: { version: agentVersionObject },
          required: ['version'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const versionNumber = parseInt(req.params.versionNumber, 10);
    if (isNaN(versionNumber)) {
      return reply.status(400).send({ error: 'Invalid version number', statusCode: 400 });
    }

    const version = await getAgentVersionByNumber(req.params.name, versionNumber, req.tenantId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    return reply.send({ version });
  });

  // Update a version
  app.patch<{ Params: { name: string; versionNumber: string } }>('/api/agents/:name/versions/:versionNumber', {
    schema: {
      tags: ['agents'],
      params: nameAndVersionParams,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255 },
          systemPrompt: { type: 'string', maxLength: 1_000_000 },
          releaseNotes: { type: 'string', maxLength: 10_000 },
          knowledgeFiles: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { version: agentVersionObject },
          required: ['version'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const versionNumber = parseInt(req.params.versionNumber, 10);
    if (isNaN(versionNumber)) {
      return reply.status(400).send({ error: 'Invalid version number', statusCode: 400 });
    }

    const existing = await getAgentVersionByNumber(req.params.name, versionNumber, req.tenantId);
    if (!existing) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    const body = req.body as {
      name?: string;
      systemPrompt?: string;
      releaseNotes?: string;
      knowledgeFiles?: string[];
    } | undefined;

    const updated = await updateAgentVersion(existing.id, {
      name: body?.name,
      systemPrompt: body?.systemPrompt,
      releaseNotes: body?.releaseNotes,
      knowledgeFiles: body?.knowledgeFiles,
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    return reply.send({ version: updated });
  });

  // Delete a version
  app.delete<{ Params: { name: string; versionNumber: string } }>('/api/agents/:name/versions/:versionNumber', {
    schema: {
      tags: ['agents'],
      params: nameAndVersionParams,
      response: {
        204: { type: 'null', description: 'Version deleted' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const versionNumber = parseInt(req.params.versionNumber, 10);
    if (isNaN(versionNumber)) {
      return reply.status(400).send({ error: 'Invalid version number', statusCode: 400 });
    }

    const existing = await getAgentVersionByNumber(req.params.name, versionNumber, req.tenantId);
    if (!existing) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    const deleted = await deleteAgentVersion(existing.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    return reply.status(204).send();
  });

  // Activate a version
  app.post<{ Params: { name: string; versionNumber: string } }>('/api/agents/:name/versions/:versionNumber/activate', {
    schema: {
      tags: ['agents'],
      params: nameAndVersionParams,
      response: {
        200: {
          type: 'object',
          properties: {
            activated: { type: 'boolean' },
            versionNumber: { type: 'integer' },
          },
          required: ['activated', 'versionNumber'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const versionNumber = parseInt(req.params.versionNumber, 10);
    if (isNaN(versionNumber)) {
      return reply.status(400).send({ error: 'Invalid version number', statusCode: 400 });
    }

    const version = await getAgentVersionByNumber(req.params.name, versionNumber, req.tenantId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found', statusCode: 404 });
    }

    await activateAgentVersion(version.id, req.params.name, req.tenantId);
    return reply.send({ activated: true, versionNumber });
  });
}
