import type { BridgeCommand, BridgeEvent, PoolStats } from '@ash-ai/shared';
import { SandboxPool, persistSessionState, syncStateToCloud } from '@ash-ai/sandbox';
import type { LogEntry } from '@ash-ai/sandbox';
import type { RunnerBackend, CreateSandboxRequest, SandboxHandle } from './types.js';

/**
 * Local (in-process) runner backend. Wraps SandboxPool for single-machine mode.
 * This is the default — no network hop, no process boundary beyond the sandbox itself.
 */
export class LocalRunnerBackend implements RunnerBackend {
  constructor(
    private pool: SandboxPool,
    private dataDir: string,
  ) {}

  async createSandbox(opts: CreateSandboxRequest): Promise<SandboxHandle> {
    const sandbox = await this.pool.create({
      agentDir: opts.agentDir,
      sessionId: opts.sessionId,
      id: opts.sandboxId,
      agentName: opts.agentName,
      skipAgentCopy: opts.skipAgentCopy,
      limits: opts.limits,
      onOomKill: opts.onOomKill,
      extraEnv: opts.extraEnv,
      startupScript: opts.startupScript,
    });
    return { sandboxId: sandbox.id, workspaceDir: sandbox.workspaceDir };
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    await this.pool.destroy(sandboxId);
  }

  async destroyAll(): Promise<void> {
    await this.pool.destroyAll();
  }

  async *sendCommand(sandboxId: string, cmd: BridgeCommand): AsyncGenerator<BridgeEvent> {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    yield* sandbox.client.sendCommand(cmd);
  }

  interrupt(sandboxId: string): void {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) return; // sandbox already gone — no-op
    sandbox.client.writeCommand({ cmd: 'interrupt' });
  }

  getSandbox(sandboxId: string): SandboxHandle | undefined {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) return undefined;
    return { sandboxId: sandbox.id, workspaceDir: sandbox.workspaceDir };
  }

  isSandboxAlive(sandboxId: string): boolean {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) return false;
    return sandbox.process.exitCode === null;
  }

  markRunning(sandboxId: string): void {
    this.pool.markRunning(sandboxId);
  }

  markWaiting(sandboxId: string): void {
    this.pool.markWaiting(sandboxId);
  }

  recordWarmHit(): void {
    this.pool.recordWarmHit();
  }

  recordColdHit(): void {
    this.pool.recordColdHit();
  }

  recordColdLocalHit(): void {
    this.pool.recordColdLocalHit();
  }

  recordColdCloudHit(): void {
    this.pool.recordColdCloudHit();
  }

  recordColdFreshHit(): void {
    this.pool.recordColdFreshHit();
  }

  persistState(sandboxId: string, sessionId: string, agentName: string): boolean {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) return false;
    const ok = persistSessionState(this.dataDir, sessionId, sandbox.workspaceDir, agentName);
    if (ok) {
      syncStateToCloud(this.dataDir, sessionId).catch((err) =>
        console.error(`[local-backend] Cloud sync failed for ${sessionId}:`, err)
      );
    }
    return ok;
  }

  getLogs(sandboxId: string, after?: number): LogEntry[] {
    return this.pool.getLogs(sandboxId, after);
  }

  async getStats(): Promise<PoolStats> {
    return this.pool.statsAsync();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }
}
