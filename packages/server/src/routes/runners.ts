import type { FastifyInstance } from 'fastify';
import type { RunnerCoordinator } from '../runner/coordinator.js';

/**
 * Internal endpoints for runner registration and heartbeat.
 * These are called by runner processes, not by clients.
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

    coordinator.registerRunner({ runnerId, host, port, maxSandboxes: maxSandboxes ?? 100 });
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

    coordinator.heartbeat(runnerId, stats);
    return reply.send({ ok: true });
  });

  // List runners (for monitoring)
  app.get('/api/internal/runners', async (_req, reply) => {
    return reply.send({
      runners: coordinator.getRunnerInfo(),
      count: coordinator.runnerCount,
      hasLocal: coordinator.hasLocalBackend,
    });
  });
}
