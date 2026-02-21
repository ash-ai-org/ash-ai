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
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  sessionId: { type: 'string' },
                  agentName: { type: 'string' },
                  eventType: { type: 'string' },
                  value: { type: 'number' },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
          required: ['events'],
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, agentName, limit } = req.query as { sessionId?: string; agentName?: string; limit?: number };
    const events = await listUsageEvents(req.tenantId, { sessionId, agentName, limit });
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
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              properties: {
                totalInputTokens: { type: 'integer' },
                totalOutputTokens: { type: 'integer' },
                totalCacheCreationTokens: { type: 'integer' },
                totalCacheReadTokens: { type: 'integer' },
                totalToolCalls: { type: 'integer' },
                totalMessages: { type: 'integer' },
                totalComputeSeconds: { type: 'number' },
              },
            },
          },
          required: ['stats'],
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, agentName } = req.query as { sessionId?: string; agentName?: string };
    const stats = await getUsageStats(req.tenantId, { sessionId, agentName });
    return reply.send({ stats });
  });
}
