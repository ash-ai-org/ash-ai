import type { FastifyInstance } from 'fastify';
import { listAgents, listSessions, getUsageStats, listEvalRuns } from '../db/index.js';

export function analyticsRoutes(app: FastifyInstance): void {
  app.get('/api/analytics', {
    schema: {
      tags: ['usage'],
      querystring: {
        type: 'object',
        properties: {
          after: { type: 'string', format: 'date-time', description: 'Only include data after this ISO timestamp' },
          before: { type: 'string', format: 'date-time', description: 'Only include data before this ISO timestamp' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            agents: {
              type: 'object',
              properties: { total: { type: 'integer' } },
              required: ['total'],
            },
            sessions: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
              },
              required: ['total', 'byStatus'],
            },
            usage: { $ref: 'UsageStats#' },
            evals: {
              type: 'object',
              properties: {
                totalRuns: { type: 'integer' },
                byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
              },
              required: ['totalRuns', 'byStatus'],
            },
          },
          required: ['agents', 'sessions', 'usage', 'evals'],
        },
      },
    },
  }, async (req, reply) => {
    const { after, before } = req.query as { after?: string; before?: string };

    const [agents, sessions, usage] = await Promise.all([
      listAgents(req.tenantId),
      listSessions(req.tenantId),
      getUsageStats(req.tenantId, { after, before }),
    ]);

    // Session breakdown by status
    const sessionsByStatus: Record<string, number> = {};
    for (const s of sessions) {
      sessionsByStatus[s.status] = (sessionsByStatus[s.status] ?? 0) + 1;
    }

    // Eval runs across all agents
    const evalRunsByStatus: Record<string, number> = {};
    let totalRuns = 0;
    for (const agent of agents) {
      const runs = await listEvalRuns(req.tenantId, agent.name);
      totalRuns += runs.length;
      for (const r of runs) {
        evalRunsByStatus[r.status] = (evalRunsByStatus[r.status] ?? 0) + 1;
      }
    }

    return reply.send({
      agents: { total: agents.length },
      sessions: { total: sessions.length, byStatus: sessionsByStatus },
      usage,
      evals: { totalRuns, byStatus: evalRunsByStatus },
    });
  });
}
