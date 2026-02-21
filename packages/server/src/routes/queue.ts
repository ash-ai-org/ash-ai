import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { insertQueueItem, getQueueItem, listQueueItems, updateQueueItemStatus, getQueueStats } from '../db/index.js';
import type { QueueItemStatus } from '@ash-ai/shared';

export function queueRoutes(app: FastifyInstance): void {
  // Enqueue a new item
  app.post('/api/queue', {
    schema: {
      tags: ['queue'],
      body: {
        type: 'object',
        properties: {
          agentName: { type: 'string' },
          prompt: { type: 'string', minLength: 1 },
          sessionId: { type: 'string', format: 'uuid' },
          priority: { type: 'integer', minimum: 0, default: 0 },
          maxRetries: { type: 'integer', minimum: 0, default: 3 },
        },
        required: ['agentName', 'prompt'],
      },
      response: {
        201: {
          type: 'object',
          properties: { item: { $ref: 'QueueItem#' } },
          required: ['item'],
        },
        400: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const { agentName, prompt, sessionId, priority, maxRetries } = req.body as {
      agentName: string;
      prompt: string;
      sessionId?: string;
      priority?: number;
      maxRetries?: number;
    };
    const id = randomUUID();
    const item = await insertQueueItem(id, req.tenantId, agentName, prompt, sessionId, priority, maxRetries);
    return reply.status(201).send({ item });
  });

  // List queue items (optional ?status= filter, ?limit=)
  app.get('/api/queue', {
    schema: {
      tags: ['queue'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: 'QueueItem#' } },
          },
          required: ['items'],
        },
      },
    },
  }, async (req, reply) => {
    const { status, limit } = req.query as { status?: QueueItemStatus; limit?: number };
    const items = await listQueueItems(req.tenantId, status, limit);
    return reply.send({ items });
  });

  // Queue statistics
  app.get('/api/queue/stats', {
    schema: {
      tags: ['queue'],
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              properties: {
                pending: { type: 'integer' },
                processing: { type: 'integer' },
                completed: { type: 'integer' },
                failed: { type: 'integer' },
                cancelled: { type: 'integer' },
              },
              required: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
            },
          },
          required: ['stats'],
        },
      },
    },
  }, async (req, reply) => {
    const stats = await getQueueStats(req.tenantId);
    return reply.send({ stats });
  });

  // Get single queue item
  app.get<{ Params: { id: string } }>('/api/queue/:id', {
    schema: {
      tags: ['queue'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: { item: { $ref: 'QueueItem#' } },
          required: ['item'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const item = await getQueueItem(req.params.id);
    if (!item || item.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Queue item not found', statusCode: 404 });
    }
    return reply.send({ item });
  });

  // Cancel a queue item (only pending items can be cancelled)
  app.delete<{ Params: { id: string } }>('/api/queue/:id', {
    schema: {
      tags: ['queue'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: { item: { $ref: 'QueueItem#' } },
          required: ['item'],
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const item = await getQueueItem(req.params.id);
    if (!item || item.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Queue item not found', statusCode: 404 });
    }
    if (item.status !== 'pending') {
      return reply.status(400).send({ error: `Cannot cancel item with status "${item.status}"`, statusCode: 400 });
    }
    await updateQueueItemStatus(req.params.id, 'cancelled');
    return reply.send({ item: { ...item, status: 'cancelled' as const } });
  });
}
