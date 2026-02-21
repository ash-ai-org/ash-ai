import type { FastifyInstance } from 'fastify';
import type { RunnerCoordinator } from '../runner/coordinator.js';

/**
 * Internal endpoints for runner registration and heartbeat.
 * These are called by runner processes, not by clients.
 *
 * In multi-coordinator mode, all coordinators accept registration/heartbeat
 * calls because they all write to the same shared database. The load balancer
 * can route any runner's traffic to any coordinator — it doesn't matter.
 */
export function runnerRoutes(app: FastifyInstance, coordinator: RunnerCoordinator): void {
  // Register a runner
  app.post('/api/internal/runners/register', async (req, reply) => {
    const { runnerId, host, port, maxSandboxes } = req.body as {
      runnerId: string;
      host: string;
      port: number;
      maxSandboxes: number;
    };

    if (!runnerId || !host || !port) {
      return reply.status(400).send({ error: 'Missing required fields: runnerId, host, port' });
    }

    await coordinator.registerRunner({ runnerId, host, port, maxSandboxes: maxSandboxes ?? 100 });
    return reply.send({ ok: true });
  });

  // Runner heartbeat
  app.post('/api/internal/runners/heartbeat', async (req, reply) => {
    const { runnerId, stats } = req.body as {
      runnerId: string;
      stats: any;
    };

    if (!runnerId) {
      return reply.status(400).send({ error: 'Missing runnerId' });
    }

    await coordinator.heartbeat(runnerId, stats);
    return reply.send({ ok: true });
  });

  // List runners (for monitoring) — reads from DB, not just local cache
  app.get('/api/internal/runners', async (_req, reply) => {
    const runners = await coordinator.getRunnerInfoFromDb();
    return reply.send({
      runners,
      count: runners.length,
      hasLocal: coordinator.hasLocalBackend,
    });
  });
}
