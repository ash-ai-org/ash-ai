import type { PoolStats } from '@ash-ai/shared';
import { RUNNER_LIVENESS_TIMEOUT_MS } from '@ash-ai/shared';
import type { RunnerBackend } from './types.js';
import { RemoteRunnerBackend } from './remote-backend.js';
import { updateSessionStatus, listSessionsByRunner } from '../db/index.js';

interface RunnerInfo {
  runnerId: string;
  host: string;
  port: number;
  maxSandboxes: number;
  backend: RemoteRunnerBackend;
  lastHeartbeat: number;
  stats: PoolStats | null;
}

/**
 * Coordinates multiple runners. Routes session creation to the least-loaded runner.
 * Detects dead runners and marks their sessions as paused.
 */
export class RunnerCoordinator {
  private runners = new Map<string, RunnerInfo>();
  private localBackend: RunnerBackend | null;
  private localRunnerId = '__local__';
  private livenessSweepTimer: NodeJS.Timeout | null = null;

  constructor(opts: { localBackend?: RunnerBackend }) {
    this.localBackend = opts.localBackend ?? null;
  }

  registerRunner(info: { runnerId: string; host: string; port: number; maxSandboxes: number }): void {
    const existing = this.runners.get(info.runnerId);
    if (existing) {
      // Re-registration — update connection info
      existing.host = info.host;
      existing.port = info.port;
      existing.maxSandboxes = info.maxSandboxes;
      existing.lastHeartbeat = Date.now();
      console.log(`[coordinator] Runner ${info.runnerId} re-registered at ${info.host}:${info.port}`);
      return;
    }

    const backend = new RemoteRunnerBackend({ host: info.host, port: info.port });
    this.runners.set(info.runnerId, {
      ...info,
      backend,
      lastHeartbeat: Date.now(),
      stats: null,
    });
    console.log(`[coordinator] Runner ${info.runnerId} registered at ${info.host}:${info.port} (max ${info.maxSandboxes})`);
  }

  heartbeat(runnerId: string, stats: PoolStats): void {
    const runner = this.runners.get(runnerId);
    if (!runner) {
      console.warn(`[coordinator] Heartbeat from unknown runner ${runnerId}`);
      return;
    }
    runner.lastHeartbeat = Date.now();
    runner.stats = stats;
  }

  /**
   * Select the best backend for a new session.
   * Returns the least-loaded runner, or local backend if no runners available.
   */
  selectBackend(): { backend: RunnerBackend; runnerId: string } {
    // If we have remote runners, pick the one with most available capacity
    if (this.runners.size > 0) {
      let bestRunner: RunnerInfo | null = null;
      let bestAvailable = -1;

      for (const runner of this.runners.values()) {
        // Skip dead runners
        if (Date.now() - runner.lastHeartbeat > RUNNER_LIVENESS_TIMEOUT_MS) continue;

        const available = runner.stats
          ? runner.maxSandboxes - runner.stats.running - runner.stats.warming
          : runner.maxSandboxes;

        if (available > bestAvailable) {
          bestAvailable = available;
          bestRunner = runner;
        }
      }

      if (bestRunner && bestAvailable > 0) {
        return { backend: bestRunner.backend, runnerId: bestRunner.runnerId };
      }
    }

    // Fall back to local backend
    if (this.localBackend) {
      return { backend: this.localBackend, runnerId: this.localRunnerId };
    }

    throw new Error('No runners available and no local backend configured');
  }

  /**
   * Get the backend for a specific runner. Used for routing messages to existing sessions.
   */
  getBackendForRunner(runnerId: string | null | undefined): RunnerBackend {
    if (!runnerId || runnerId === this.localRunnerId) {
      if (this.localBackend) return this.localBackend;
      throw new Error('No local backend configured');
    }

    const runner = this.runners.get(runnerId);
    if (!runner) {
      // Runner gone — fall back to local if available
      if (this.localBackend) return this.localBackend;
      throw new Error(`Runner ${runnerId} not found`);
    }

    return runner.backend;
  }

  /**
   * Start periodic liveness checks for remote runners.
   */
  startLivenessSweep(): void {
    if (this.livenessSweepTimer) return;
    this.livenessSweepTimer = setInterval(() => {
      this.checkLiveness().catch((err) =>
        console.error('[coordinator] Liveness sweep error:', err)
      );
    }, RUNNER_LIVENESS_TIMEOUT_MS);
    this.livenessSweepTimer.unref();
  }

  stopLivenessSweep(): void {
    if (this.livenessSweepTimer) {
      clearInterval(this.livenessSweepTimer);
      this.livenessSweepTimer = null;
    }
  }

  private async checkLiveness(): Promise<void> {
    const now = Date.now();
    for (const [runnerId, runner] of this.runners) {
      if (now - runner.lastHeartbeat > RUNNER_LIVENESS_TIMEOUT_MS) {
        console.warn(`[coordinator] Runner ${runnerId} missed heartbeat — marking sessions paused`);
        await this.handleDeadRunner(runnerId);
      }
    }
  }

  async handleDeadRunner(runnerId: string): Promise<void> {
    // Mark all sessions on this runner as paused
    const sessions = await listSessionsByRunner(runnerId);
    for (const session of sessions) {
      if (session.status === 'active' || session.status === 'starting') {
        await updateSessionStatus(session.id, 'paused');
        console.log(`[coordinator] Paused session ${session.id} (runner ${runnerId} dead)`);
      }
    }

    // Remove the runner
    const runner = this.runners.get(runnerId);
    if (runner) {
      runner.backend.close();
      this.runners.delete(runnerId);
    }
  }

  get runnerCount(): number {
    return this.runners.size;
  }

  get hasLocalBackend(): boolean {
    return this.localBackend !== null;
  }

  getRunnerInfo(): Array<{ runnerId: string; host: string; port: number; active: number; max: number; lastHeartbeat: number }> {
    const result = [];
    for (const runner of this.runners.values()) {
      result.push({
        runnerId: runner.runnerId,
        host: runner.host,
        port: runner.port,
        active: runner.stats?.running ?? 0,
        max: runner.maxSandboxes,
        lastHeartbeat: runner.lastHeartbeat,
      });
    }
    return result;
  }
}
