import { hostname } from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { SandboxPool } from '@ash-ai/sandbox';
import type { PoolStats } from '@ash-ai/shared';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import { listSessions } from '../db/index.js';

const startTime = Date.now();
/** Unique coordinator ID: hostname + PID. Useful for identifying which coordinator
 *  handles which requests in multi-coordinator deployments. */
const coordinatorId = `${hostname()}-${process.pid}`;

const EMPTY_POOL: PoolStats = {
  total: 0, cold: 0, warming: 0, warm: 0, waiting: 0, running: 0,
  maxCapacity: 0, resumeWarmHits: 0, resumeColdHits: 0, preWarmHits: 0,
};

export function healthRoutes(app: FastifyInstance, coordinator: RunnerCoordinator, localPool: SandboxPool | null): void {
  console.log(`[coordinator] Starting with ID: ${coordinatorId}`);

  app.get('/health', {
    schema: {
      tags: ['health'],
      response: {
        200: { $ref: 'HealthResponse#' },
      },
    },
  }, async (_req, reply) => {
    const sessions = (await listSessions()).filter((s) => s.status === 'active');
    const poolStats = localPool ? await localPool.statsAsync() : EMPTY_POOL;
    const runners = await coordinator.getRunnerInfoFromDb();

    return reply.send({
      status: 'ok',
      coordinatorId,
      activeSessions: sessions.length,
      activeSandboxes: localPool?.activeCount ?? 0,
      remoteRunners: runners.length,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      pool: poolStats,
    });
  });

  // Prometheus text format — no library needed
  app.get('/metrics', {
    schema: { tags: ['health'], hide: true },
  }, async (_req, reply) => {
    const sessions = (await listSessions()).filter((s) => s.status === 'active');
    const pool = localPool ? await localPool.statsAsync() : EMPTY_POOL;
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const lines = [
      '# HELP ash_up Whether the Ash server is up (always 1 if reachable).',
      '# TYPE ash_up gauge',
      `ash_up{coordinator="${coordinatorId}"} 1`,
      '',
      '# HELP ash_uptime_seconds Seconds since server start.',
      '# TYPE ash_uptime_seconds gauge',
      `ash_uptime_seconds ${uptime}`,
      '',
      '# HELP ash_active_sessions Number of active sessions.',
      '# TYPE ash_active_sessions gauge',
      `ash_active_sessions ${sessions.length}`,
      '',
      '# HELP ash_active_sandboxes Number of live sandbox processes.',
      '# TYPE ash_active_sandboxes gauge',
      `ash_active_sandboxes ${localPool?.activeCount ?? 0}`,
      '',
      '# HELP ash_pool_sandboxes Sandbox count by state.',
      '# TYPE ash_pool_sandboxes gauge',
      `ash_pool_sandboxes{state="cold"} ${pool.cold}`,
      `ash_pool_sandboxes{state="warming"} ${pool.warming}`,
      `ash_pool_sandboxes{state="warm"} ${pool.warm}`,
      `ash_pool_sandboxes{state="waiting"} ${pool.waiting}`,
      `ash_pool_sandboxes{state="running"} ${pool.running}`,
      '',
      '# HELP ash_pool_max_capacity Maximum sandbox capacity.',
      '# TYPE ash_pool_max_capacity gauge',
      `ash_pool_max_capacity ${pool.maxCapacity}`,
      '',
      '# HELP ash_resume_total Total session resumes by path (warm=sandbox alive, cold=new sandbox).',
      '# TYPE ash_resume_total counter',
      `ash_resume_total{path="warm"} ${pool.resumeWarmHits}`,
      `ash_resume_total{path="cold"} ${pool.resumeColdHits}`,
      `ash_resume_total{path="prewarm"} ${pool.preWarmHits}`,
      '',
    ];

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(lines.join('\n'));
  });
}
