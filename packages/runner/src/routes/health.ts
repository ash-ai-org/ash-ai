import type { FastifyInstance } from 'fastify';
import type { SandboxPool } from '@ash-ai/sandbox';

export function healthRoutes(
  app: FastifyInstance,
  pool: SandboxPool,
  runnerId: string,
  maxSandboxes: number,
): void {
  app.get('/runner/health', async (_req, reply) => {
    const stats = await pool.statsAsync();
    return reply.send({
      runnerId,
      status: 'ok',
      capacity: {
        max: maxSandboxes,
        active: pool.activeCount,
        available: maxSandboxes - pool.activeCount,
      },
      pool: stats,
      uptime: process.uptime(),
    });
  });
}
