import type { PoolStats, RunnerRecord } from '@ash-ai/shared';
import { RUNNER_LIVENESS_TIMEOUT_MS } from '@ash-ai/shared';
import type { RunnerBackend } from './types.js';
import { RemoteRunnerBackend } from './remote-backend.js';
import { bulkPauseSessionsByRunner, upsertRunner, heartbeatRunner, selectBestRunner, deleteRunner, listAllRunners, listDeadRunners, getRunner } from '../db/index.js';

/**
 * Coordinates multiple runners. Routes session creation to the least-loaded runner.
 * Detects dead runners and marks their sessions as paused.
 *
 * In multi-coordinator mode, the runner registry lives in the shared database
 * (Postgres/CRDB). Any coordinator can discover all healthy runners by querying
 * the DB. The in-memory `backends` map is a local connection cache — each
 * coordinator creates RemoteRunnerBackend instances on demand when it first
 * needs to talk to a runner it hasn't seen before.
 *
 * Design principles:
 * - DB is the source of truth for runner discovery (multi-coordinator safe)
 * - Local Map is a connection cache only (avoids creating new HTTP clients per request)
 * - All write operations (register, heartbeat, delete) go through DB
 * - All read operations for routing go through DB (selectBestRunner)
 * - Liveness sweep is idempotent (safe to run on multiple coordinators)
 */
export class RunnerCoordinator {
  /** Local connection cache: runnerId -> RemoteRunnerBackend. Lazily populated from DB. */
  private backends = new Map<string, RemoteRunnerBackend>();
  private localBackend: RunnerBackend | null;
  private localRunnerId = '__local__';
  private livenessSweepTimer: NodeJS.Timeout | null = null;

  constructor(opts: { localBackend?: RunnerBackend }) {
    this.localBackend = opts.localBackend ?? null;
  }

  /**
   * Register or re-register a runner. Persists to DB so all coordinators see it.
   */
  async registerRunner(info: { runnerId: string; host: string; port: number; maxSandboxes: number }): Promise<void> {
    // Persist to DB (upsert — idempotent, safe for concurrent coordinators)
    await upsertRunner(info.runnerId, info.host, info.port, info.maxSandboxes);

    // Update local backend cache
    const existing = this.backends.get(info.runnerId);
    if (existing) {
      existing.close();
    }
    this.backends.set(info.runnerId, new RemoteRunnerBackend({ host: info.host, port: info.port }));
    console.log(`[coordinator] Runner ${info.runnerId} registered at ${info.host}:${info.port} (max ${info.maxSandboxes})`);
  }

  /**
   * Process a heartbeat. Updates DB so all coordinators see fresh capacity stats.
   */
  async heartbeat(runnerId: string, stats: PoolStats): Promise<void> {
    await heartbeatRunner(runnerId, stats.running ?? 0, stats.warming ?? 0);
  }

  /**
   * Graceful deregistration. Called when a runner shuts down cleanly.
   * Immediately pauses its sessions and removes it from the registry,
   * rather than waiting 30s for the liveness sweep to notice.
   */
  async deregisterRunner(runnerId: string): Promise<void> {
    console.log(`[coordinator] Runner ${runnerId} deregistering gracefully`);
    await this.handleDeadRunner(runnerId);
  }

  /**
   * Select the best backend for a new session.
   * Reads from DB to discover all healthy runners (multi-coordinator safe).
   * Falls back to local backend if no remote runners available.
   */
  async selectBackend(): Promise<{ backend: RunnerBackend; runnerId: string }> {
    const cutoff = new Date(Date.now() - RUNNER_LIVENESS_TIMEOUT_MS).toISOString();
    const bestRunner = await selectBestRunner(cutoff);

    if (bestRunner) {
      // selectBestRunner() already orders by available capacity DESC and only
      // returns healthy runners. Trust the query — no redundant capacity check.
      const backend = this.getOrCreateBackend(bestRunner);
      return { backend, runnerId: bestRunner.id };
    }

    // Fall back to local backend (standalone mode)
    if (this.localBackend) {
      return { backend: this.localBackend, runnerId: this.localRunnerId };
    }

    throw new Error('No runners available and no local backend configured');
  }

  /**
   * Get the backend for a specific runner. Used for routing messages to existing sessions.
   *
   * Synchronous fast path: checks local cache first. If not found, falls back to local
   * backend (standalone mode) or throws. For multi-coordinator mode where a runner was
   * registered by a different coordinator, use getBackendForRunnerAsync().
   */
  getBackendForRunner(runnerId: string | null | undefined): RunnerBackend {
    if (!runnerId || runnerId === this.localRunnerId) {
      if (this.localBackend) return this.localBackend;
      throw new Error('No local backend configured');
    }

    const cached = this.backends.get(runnerId);
    if (cached && !cached.closed) return cached;

    // Not in cache. In standalone mode, fall back to local.
    // In coordinator mode, caller should use getBackendForRunnerAsync().
    if (this.localBackend) return this.localBackend;
    throw new Error(`Runner ${runnerId} not found in local cache — use getBackendForRunnerAsync() in multi-coordinator mode`);
  }

  /**
   * Async version: looks up runner from DB if not in local cache.
   * Required in multi-coordinator mode where a different coordinator may have
   * registered the runner. Creates a RemoteRunnerBackend on the fly from the
   * DB record and caches it locally.
   */
  async getBackendForRunnerAsync(runnerId: string | null | undefined): Promise<RunnerBackend> {
    if (!runnerId || runnerId === this.localRunnerId) {
      if (this.localBackend) return this.localBackend;
      throw new Error('No local backend configured');
    }

    // Fast path: already cached
    const cached = this.backends.get(runnerId);
    if (cached && !cached.closed) return cached;

    // Slow path: look up from shared DB
    const record = await getRunner(runnerId);
    if (record) {
      return this.getOrCreateBackend(record);
    }

    // Runner gone — fall back to local if available
    if (this.localBackend) return this.localBackend;
    throw new Error(`Runner ${runnerId} not found`);
  }

  /**
   * Get or lazily create a RemoteRunnerBackend from a DB record.
   * The backends map is a local connection cache — avoids creating
   * new HTTP clients on every request.
   */
  private getOrCreateBackend(record: RunnerRecord): RemoteRunnerBackend {
    let backend = this.backends.get(record.id);
    if (backend && !backend.closed) return backend;

    backend = new RemoteRunnerBackend({ host: record.host, port: record.port });
    this.backends.set(record.id, backend);
    return backend;
  }

  /**
   * Start periodic liveness checks for remote runners.
   * Safe to run on multiple coordinators — all operations are idempotent.
   * Each coordinator runs independently; no leader election needed.
   *
   * Uses random jitter (0-5s) on each interval to prevent thundering herd
   * when multiple coordinators run the same sweep at the same time.
   */
  startLivenessSweep(): void {
    if (this.livenessSweepTimer) return;
    const scheduleNext = () => {
      // Add 0-5s random jitter to prevent thundering herd across coordinators
      const jitter = Math.floor(Math.random() * 5000);
      this.livenessSweepTimer = setTimeout(() => {
        this.checkLiveness()
          .catch((err) => console.error('[coordinator] Liveness sweep error:', err))
          .finally(() => scheduleNext());
      }, RUNNER_LIVENESS_TIMEOUT_MS + jitter);
      this.livenessSweepTimer.unref();
    };
    scheduleNext();
  }

  stopLivenessSweep(): void {
    if (this.livenessSweepTimer) {
      clearInterval(this.livenessSweepTimer);
      this.livenessSweepTimer = null;
    }
  }

  /**
   * Single-query dead runner detection. Queries directly for runners past
   * the heartbeat cutoff instead of listing ALL runners then filtering in JS.
   *
   * Cache cleanup: stale backend cache entries are cleaned up in handleDeadRunner()
   * (for this coordinator's kills) and lazily on next use via getOrCreateBackend()
   * (for kills by other coordinators). No need to list all runners every sweep.
   */
  private async checkLiveness(): Promise<void> {
    const cutoff = new Date(Date.now() - RUNNER_LIVENESS_TIMEOUT_MS).toISOString();
    const deadRunners = await listDeadRunners(cutoff);
    for (const runner of deadRunners) {
      console.warn(`[coordinator] Runner ${runner.id} missed heartbeat — marking sessions paused`);
      await this.handleDeadRunner(runner.id);
    }
  }

  /**
   * Handle a dead runner: pause its sessions and remove from registry.
   * Idempotent — safe to call from multiple coordinators concurrently.
   * Uses a single bulk UPDATE instead of per-session queries.
   */
  async handleDeadRunner(runnerId: string): Promise<void> {
    // Single bulk UPDATE — no N+1
    const pausedCount = await bulkPauseSessionsByRunner(runnerId);
    if (pausedCount > 0) {
      console.log(`[coordinator] Paused ${pausedCount} session(s) on runner ${runnerId}`);
    }

    // Remove from DB (all coordinators will see this)
    await deleteRunner(runnerId);

    // Clean up local cache
    const backend = this.backends.get(runnerId);
    if (backend) {
      backend.close();
      this.backends.delete(runnerId);
    }
  }

  get runnerCount(): number {
    return this.backends.size;
  }

  get hasLocalBackend(): boolean {
    return this.localBackend !== null;
  }

  /**
   * Get runner info from DB (not just local cache).
   * Any coordinator gets the same view. Use this for monitoring/admin.
   */
  async getRunnerInfoFromDb(): Promise<Array<{ runnerId: string; host: string; port: number; active: number; max: number; lastHeartbeat: string }>> {
    const allRunners = await listAllRunners();
    return allRunners.map((r) => ({
      runnerId: r.id,
      host: r.host,
      port: r.port,
      active: r.activeCount,
      max: r.maxSandboxes,
      lastHeartbeat: r.lastHeartbeatAt,
    }));
  }

  /** Number of locally cached backend connections. */
  get cachedBackendCount(): number {
    return this.backends.size;
  }
}
