import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolStats, SandboxState, SandboxRecord } from '@ash-ai/shared';
import { DEFAULT_MAX_SANDBOXES, DEFAULT_IDLE_TIMEOUT_MS, IDLE_SWEEP_INTERVAL_MS, COLD_CLEANUP_TTL_MS, COLD_CLEANUP_INTERVAL_MS } from '@ash-ai/shared';
import type { ManagedSandbox, CreateSandboxOpts, SandboxManager, LogEntry } from './manager.js';
import { deleteSessionState, deleteCloudState } from './state-persistence.js';

export type LiveSandboxState = 'warming' | 'warm' | 'waiting' | 'running';

/**
 * Subset of the Db interface that SandboxPool needs.
 * The full Db (with agent/session methods) lives in the server package.
 * This narrower type avoids a circular dependency.
 */
export interface SandboxDb {
  insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId?: string): Promise<void>;
  updateSandboxState(id: string, state: SandboxState): Promise<void>;
  updateSandboxSession(id: string, sessionId: string | null): Promise<void>;
  touchSandbox(id: string): Promise<void>;
  getSandbox(id: string): Promise<SandboxRecord | null>;
  countSandboxes(): Promise<number>;
  getBestEvictionCandidate(): Promise<SandboxRecord | null>;
  getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]>;
  getColdSandboxes(olderThan: string): Promise<SandboxRecord[]>;
  deleteSandbox(id: string): Promise<void>;
  markAllSandboxesCold(): Promise<number>;
}

export interface PoolEntry {
  sandbox: ManagedSandbox;
  state: LiveSandboxState;
  sessionId: string | null;
  agentName: string;
}

export interface SandboxPoolOpts {
  manager: SandboxManager;
  db: SandboxDb;
  dataDir: string;
  maxCapacity?: number;
  idleTimeoutMs?: number;
  coldCleanupTtlMs?: number;
  onBeforeEvict?: (entry: PoolEntry) => Promise<void>;
}

export class SandboxPool {
  private live = new Map<string, PoolEntry>();
  private sessionIndex = new Map<string, string>(); // sessionId → sandboxId

  private manager: SandboxManager;
  private db: SandboxDb;
  private dataDir: string;
  private maxCapacity: number;
  private idleTimeoutMs: number;
  private coldCleanupTtlMs: number;
  private onBeforeEvict?: (entry: PoolEntry) => Promise<void>;
  private sweepTimer: NodeJS.Timeout | null = null;
  private coldCleanupTimer: NodeJS.Timeout | null = null;
  private resumeWarmHits = 0;
  private resumeColdHits = 0;
  private _resumeColdLocalHits = 0;
  private _resumeColdCloudHits = 0;
  private _resumeColdFreshHits = 0;
  private _preWarmHits = 0;

  constructor(opts: SandboxPoolOpts) {
    this.manager = opts.manager;
    this.db = opts.db;
    this.dataDir = opts.dataDir;
    this.maxCapacity = opts.maxCapacity ?? DEFAULT_MAX_SANDBOXES;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.coldCleanupTtlMs = opts.coldCleanupTtlMs ?? COLD_CLEANUP_TTL_MS;
    this.onBeforeEvict = opts.onBeforeEvict;
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    const marked = await this.db.markAllSandboxesCold();
    if (marked > 0) {
      console.log(`[pool] Startup: marked ${marked} stale sandbox(es) as cold`);
    }
  }

  async create(opts: CreateSandboxOpts & { agentName: string }): Promise<ManagedSandbox> {
    // Try to claim a pre-warmed sandbox first
    if (opts.sessionId) {
      const warm = this.claimWarm(opts.agentName, opts.sessionId);
      if (warm) {
        this._preWarmHits++;
        console.log(`[pool] Claimed pre-warmed sandbox ${warm.id.slice(0, 8)} for session ${opts.sessionId}`);
        return warm;
      }
    }

    // Enforce capacity — evict if needed
    const count = await this.db.countSandboxes();
    if (count >= this.maxCapacity) {
      const evicted = await this.evictOne();
      if (!evicted) {
        throw new Error('Sandbox capacity reached and no evictable sandboxes (all running)');
      }
    }

    const sandbox = await this.manager.create(opts);

    // Insert DB row directly as 'warm' — no intermediate warming state needed
    // since the manager.create() call above is the only thing that could fail.
    await this.db.insertSandbox(sandbox.id, opts.agentName, sandbox.workspaceDir, opts.sessionId);
    await this.db.updateSandboxState(sandbox.id, 'warm');

    // Cache in live map
    const entry: PoolEntry = {
      sandbox,
      state: 'warm',
      sessionId: opts.sessionId,
      agentName: opts.agentName,
    };
    this.live.set(sandbox.id, entry);
    if (opts.sessionId) {
      this.sessionIndex.set(opts.sessionId, sandbox.id);
    }

    return sandbox;
  }

  get(sandboxId: string): ManagedSandbox | undefined {
    const entry = this.live.get(sandboxId);
    if (!entry) return undefined;

    // Check if process is dead
    if (entry.sandbox.process.exitCode !== null) {
      this.live.delete(sandboxId);
      if (entry.sessionId) {
        this.sessionIndex.delete(entry.sessionId);
      }
      // Fire-and-forget DB update to cold
      this.db.updateSandboxState(sandboxId, 'cold').catch((err) =>
        console.error(`[pool] Failed to mark dead sandbox ${sandboxId} as cold:`, err)
      );
      return undefined;
    }

    return entry.sandbox;
  }

  getEntry(sandboxId: string): PoolEntry | undefined {
    return this.live.get(sandboxId);
  }

  getSandboxForSession(sessionId: string): ManagedSandbox | undefined {
    const sandboxId = this.sessionIndex.get(sessionId);
    if (!sandboxId) return undefined;
    return this.get(sandboxId);
  }

  async destroy(sandboxId: string): Promise<void> {
    const entry = this.live.get(sandboxId);

    // Kill process via manager
    await this.manager.destroy(sandboxId);

    // Remove from in-memory maps
    if (entry) {
      this.live.delete(sandboxId);
      if (entry.sessionId) {
        this.sessionIndex.delete(entry.sessionId);
      }
    }

    // Delete DB row
    await this.db.deleteSandbox(sandboxId);
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.live.keys()];
    await Promise.all(ids.map((id) => this.destroy(id)));
    // Also clean cold entries from DB
    // (destroyAll is for full shutdown — clean everything)
  }

  // --- State transitions ---

  markRunning(sandboxId: string): void {
    const entry = this.live.get(sandboxId);
    if (!entry) return;
    entry.state = 'running';
    // Fire-and-forget DB update
    this.db.updateSandboxState(sandboxId, 'running').catch((err) =>
      console.error(`[pool] Failed to update sandbox ${sandboxId} state to running:`, err)
    );
    this.db.touchSandbox(sandboxId).catch(() => {});
  }

  markWaiting(sandboxId: string): void {
    const entry = this.live.get(sandboxId);
    if (!entry) return;
    entry.state = 'waiting';
    // Fire-and-forget DB update
    this.db.updateSandboxState(sandboxId, 'waiting').catch((err) =>
      console.error(`[pool] Failed to update sandbox ${sandboxId} state to waiting:`, err)
    );
    this.db.touchSandbox(sandboxId).catch(() => {});
  }

  // --- Pre-warming ---

  /**
   * Pre-create sandboxes for an agent so first sessions skip install/startup latency.
   * Sandboxes are created with no sessionId and sit in 'warm' state until claimed.
   */
  async warmUp(agentName: string, agentDir: string, count: number, opts?: { startupScript?: string; extraEnv?: Record<string, string> }): Promise<void> {
    let created = 0;
    for (let i = 0; i < count; i++) {
      // Respect capacity
      const currentCount = await this.db.countSandboxes();
      if (currentCount >= this.maxCapacity) {
        console.log(`[pool] Pre-warm stopped at ${created}/${count} for ${agentName} — capacity reached`);
        break;
      }

      try {
        const sandbox = await this.manager.create({
          agentDir,
          sessionId: '', // placeholder — pre-warm sandboxes have no session
          startupScript: opts?.startupScript,
          extraEnv: opts?.extraEnv,
        });

        await this.db.insertSandbox(sandbox.id, agentName, sandbox.workspaceDir);
        await this.db.updateSandboxState(sandbox.id, 'warm');

        const entry: PoolEntry = {
          sandbox,
          state: 'warm',
          sessionId: null,
          agentName,
        };
        this.live.set(sandbox.id, entry);
        created++;
      } catch (err) {
        console.error(`[pool] Pre-warm failed for ${agentName} (${created}/${count}):`, err);
        break;
      }
    }

    if (created > 0) {
      console.log(`[pool] Pre-warmed ${created} sandbox(es) for agent ${agentName}`);
    }
  }

  /**
   * Claim a pre-warmed sandbox for a session.
   * Scans the live map for an idle warm sandbox matching the agent.
   * Returns undefined if none available.
   */
  claimWarm(agentName: string, sessionId: string): ManagedSandbox | undefined {
    for (const [id, entry] of this.live) {
      if (entry.state === 'warm' && entry.agentName === agentName && entry.sessionId === null) {
        // Check process is alive
        if (entry.sandbox.process.exitCode !== null) {
          this.live.delete(id);
          this.db.deleteSandbox(id).catch(() => {});
          continue;
        }

        // Claim it
        entry.sessionId = sessionId;
        this.sessionIndex.set(sessionId, id);
        // Update DB with session association
        this.db.updateSandboxSession(id, sessionId).catch((err) =>
          console.error(`[pool] Failed to update sandbox ${id} session:`, err)
        );
        this.db.touchSandbox(id).catch(() => {});
        return entry.sandbox;
      }
    }
    return undefined;
  }

  get preWarmHits(): number {
    return this._preWarmHits;
  }

  // --- Eviction ---

  private async evictOne(): Promise<boolean> {
    const candidate = await this.db.getBestEvictionCandidate();
    if (!candidate) return false;

    if (candidate.state === 'cold') {
      // Cold eviction — delete persisted state + DB row
      if (candidate.sessionId) {
        deleteSessionState(this.dataDir, candidate.sessionId);
        deleteCloudState(candidate.sessionId).catch((err) =>
          console.error(`[pool] Cloud delete failed for ${candidate.sessionId}:`, err)
        );
      }
      await this.db.deleteSandbox(candidate.id);
      return true;
    }

    if (candidate.state === 'warm') {
      // Warm eviction — kill sandbox (no active session work)
      await this.manager.destroy(candidate.id);
      this.live.delete(candidate.id);
      if (candidate.sessionId) {
        this.sessionIndex.delete(candidate.sessionId);
      }
      await this.db.deleteSandbox(candidate.id);
      return true;
    }

    // Waiting eviction — kill sandbox (idle session), preserve state
    const entry = this.live.get(candidate.id);
    if (entry && this.onBeforeEvict) {
      await this.onBeforeEvict(entry);
    }
    await this.manager.destroy(candidate.id);
    this.live.delete(candidate.id);
    if (candidate.sessionId) {
      this.sessionIndex.delete(candidate.sessionId);
    }
    // Mark cold (session is paused, state persisted by onBeforeEvict)
    await this.db.updateSandboxState(candidate.id, 'cold');
    return true;
  }

  // --- Idle sweep ---

  async sweepIdle(): Promise<number> {
    const threshold = new Date(Date.now() - this.idleTimeoutMs).toISOString();
    const idleSandboxes = await this.db.getIdleSandboxes(threshold);
    let swept = 0;

    for (const record of idleSandboxes) {
      const entry = this.live.get(record.id);
      if (!entry) continue; // not live — skip

      // Evict: persist state, kill, mark cold
      if (this.onBeforeEvict) {
        await this.onBeforeEvict(entry);
      }
      await this.manager.destroy(record.id);
      this.live.delete(record.id);
      if (entry.sessionId) {
        this.sessionIndex.delete(entry.sessionId);
      }
      await this.db.updateSandboxState(record.id, 'cold');
      swept++;
    }

    if (swept > 0) {
      console.log(`[pool] Idle sweep: evicted ${swept} sandbox(es)`);
    }
    return swept;
  }

  startIdleSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweepIdle().catch((err) =>
        console.error('[pool] Idle sweep error:', err)
      );
    }, IDLE_SWEEP_INTERVAL_MS);
    // Unref so the timer doesn't keep the process alive
    this.sweepTimer.unref();
  }

  stopIdleSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // --- Cold cleanup ---

  async sweepCold(): Promise<number> {
    const threshold = new Date(Date.now() - this.coldCleanupTtlMs).toISOString();
    const staleCold = await this.db.getColdSandboxes(threshold);
    let cleaned = 0;

    for (const record of staleCold) {
      // Delete local workspace dir
      rmSync(join(this.dataDir, 'sandboxes', record.id), { recursive: true, force: true });
      // Delete local session state backup
      if (record.sessionId) {
        deleteSessionState(this.dataDir, record.sessionId);
      }
      // Delete DB row (cloud backup preserved for future restore)
      await this.db.deleteSandbox(record.id);
      cleaned++;
    }

    if (cleaned > 0) {
      console.log(`[pool] Cold cleanup: removed ${cleaned} stale sandbox(es)`);
    }
    return cleaned;
  }

  startColdCleanup(): void {
    if (this.coldCleanupTimer) return;
    this.coldCleanupTimer = setInterval(() => {
      this.sweepCold().catch((err) =>
        console.error('[pool] Cold cleanup error:', err)
      );
    }, COLD_CLEANUP_INTERVAL_MS);
    this.coldCleanupTimer.unref();
  }

  stopColdCleanup(): void {
    if (this.coldCleanupTimer) {
      clearInterval(this.coldCleanupTimer);
      this.coldCleanupTimer = null;
    }
  }

  // --- Logs ---

  getLogs(sandboxId: string, after?: number): LogEntry[] {
    return this.manager.getLogs(sandboxId, after);
  }

  // --- Resume metrics ---

  recordWarmHit(): void { this.resumeWarmHits++; }
  recordColdHit(): void { this.resumeColdHits++; }
  recordColdLocalHit(): void { this._resumeColdLocalHits++; this.resumeColdHits++; }
  recordColdCloudHit(): void { this._resumeColdCloudHits++; this.resumeColdHits++; }
  recordColdFreshHit(): void { this._resumeColdFreshHits++; this.resumeColdHits++; }

  // --- Stats ---

  get stats(): PoolStats {
    // Count live states from in-memory map
    let warming = 0, warm = 0, waiting = 0, running = 0;
    for (const entry of this.live.values()) {
      switch (entry.state) {
        case 'warming': warming++; break;
        case 'warm': warm++; break;
        case 'waiting': waiting++; break;
        case 'running': running++; break;
      }
    }

    // We can't synchronously get cold count from DB, so we compute total from what we know.
    // For accurate cold count, use statsAsync().
    return {
      total: this.live.size, // live only — call statsAsync for full count
      cold: 0,
      warming,
      warm,
      waiting,
      running,
      maxCapacity: this.maxCapacity,
      resumeWarmHits: this.resumeWarmHits,
      resumeColdHits: this.resumeColdHits,
      resumeColdLocalHits: this._resumeColdLocalHits,
      resumeColdCloudHits: this._resumeColdCloudHits,
      resumeColdFreshHits: this._resumeColdFreshHits,
      preWarmHits: this._preWarmHits,
    };
  }

  async statsAsync(): Promise<PoolStats> {
    const baseStats = this.stats;
    const totalDb = await this.db.countSandboxes();
    const cold = totalDb - this.live.size;
    return {
      ...baseStats,
      total: totalDb,
      cold: Math.max(0, cold),
    };
  }

  get activeCount(): number {
    return this.live.size;
  }
}
