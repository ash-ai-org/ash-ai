import type { FastifyInstance } from 'fastify';
import { listUsageEvents, getUsageStats } from '../db/index.js';

export function usageRoutes(app: FastifyInstance): void {
  // List usage events with optional filters
  app.get('/api/usage', {
    schema: {
      tags: ['usage'],
      querystring: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          agentName: { type: 'string' },
          after: { type: 'string', format: 'date-time', description: 'Only events after this ISO timestamp' },
          before: { type: 'string', format: 'date-time', description: 'Only events before this ISO timestamp' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: { $ref: 'UsageEvent#' },
            },
          },
          required: ['events'],
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, agentName, after, before, limit } = req.query as {
      sessionId?: string; agentName?: string; after?: string; before?: string; limit?: number;
    };
    const events = await listUsageEvents(req.tenantId, { sessionId, agentName, after, before, limit });
    return reply.send({ events });
  });

  // Aggregated usage stats
  app.get('/api/usage/stats', {
    schema: {
      tags: ['usage'],
      querystring: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          agentName: { type: 'string' },
          after: { type: 'string', format: 'date-time', description: 'Only events after this ISO timestamp' },
          before: { type: 'string', format: 'date-time', description: 'Only events before this ISO timestamp' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            stats: { $ref: 'UsageStats#' },
          },
          required: ['stats'],
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, agentName, after, before } = req.query as {
      sessionId?: string; agentName?: string; after?: string; before?: string;
    };
    const stats = await getUsageStats(req.tenantId, { sessionId, agentName, after, before });
    return reply.send({ stats });
  });
}
