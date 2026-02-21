import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RunnerCoordinator } from '../runner/coordinator.js';

const internalSecret = process.env.ASH_INTERNAL_SECRET;

/**
 * Validate internal endpoint auth. If ASH_INTERNAL_SECRET is set,
 * requires matching Authorization: Bearer <secret> header.
 * No-op when secret is not configured (dev/single-machine mode).
 */
function validateInternalAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!internalSecret) return true;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${internalSecret}`) {
    reply.status(401).send({ error: 'Unauthorized — invalid or missing internal secret' });
    return false;
  }
  return true;
}

/**
 * Internal endpoints for runner registration and heartbeat.
 * These are called by runner processes, not by clients.
 * Protected by ASH_INTERNAL_SECRET when set (required in multi-machine mode).
 *
 * In multi-coordinator mode, all coordinators accept registration/heartbeat
 * calls because they all write to the same shared database. The load balancer
 * can route any runner's traffic to any coordinator — it doesn't matter.
 */
export function runnerRoutes(app: FastifyInstance, coordinator: RunnerCoordinator): void {
  // Register a runner
  app.post('/api/internal/runners/register', async (req, reply) => {
    if (!validateInternalAuth(req, reply)) return;
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
    if (!validateInternalAuth(req, reply)) return;
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

  // Graceful deregistration — runner calls this during shutdown
  app.post('/api/internal/runners/deregister', async (req, reply) => {
    if (!validateInternalAuth(req, reply)) return;
    const { runnerId } = req.body as { runnerId: string };

    if (!runnerId) {
      return reply.status(400).send({ error: 'Missing runnerId' });
    }

    await coordinator.deregisterRunner(runnerId);
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
