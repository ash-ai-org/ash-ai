import type { BridgeCommand, BridgeEvent, PoolStats } from '@ash-ai/shared';
import { RunnerClient } from './runner-client.js';
import type { LogEntry } from '@ash-ai/sandbox';
import type { RunnerBackend, CreateSandboxRequest, SandboxHandle } from './types.js';

/**
 * Remote runner backend. Delegates all sandbox operations to a runner process
 * over HTTP. Used in multi-runner (coordinator) mode.
 */
export class RemoteRunnerBackend implements RunnerBackend {
  private client: RunnerClient;
  private sandboxes = new Map<string, SandboxHandle>(); // local cache

  constructor(opts: { host: string; port: number }) {
    this.client = new RunnerClient(opts);
  }

  async createSandbox(opts: CreateSandboxRequest): Promise<SandboxHandle> {
    const result = await this.client.createSandbox({
      sessionId: opts.sessionId,
      agentDir: opts.agentDir,
      agentName: opts.agentName,
      sandboxId: opts.sandboxId,
      skipAgentCopy: opts.skipAgentCopy,
      limits: opts.limits as Record<string, number> | undefined,
      extraEnv: opts.extraEnv,
      startupScript: opts.startupScript,
      systemPrompt: opts.systemPrompt,
      mcpServers: opts.mcpServers,
    });

    const handle: SandboxHandle = {
      sandboxId: result.sandboxId,
      workspaceDir: result.workspaceDir,
    };
    this.sandboxes.set(result.sandboxId, handle);
    return handle;
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    await this.client.destroySandbox(sandboxId);
    this.sandboxes.delete(sandboxId);
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.all(ids.map((id) => this.destroySandbox(id)));
  }

  async *sendCommand(sandboxId: string, cmd: BridgeCommand): AsyncGenerator<BridgeEvent> {
    yield* this.client.sendCommand(sandboxId, cmd);
  }

  interrupt(sandboxId: string): void {
    // Fire-and-forget to runner
    this.client.interrupt(sandboxId).catch(() => {});
  }

  getSandbox(sandboxId: string): SandboxHandle | undefined {
    return this.sandboxes.get(sandboxId);
  }

  isSandboxAlive(sandboxId: string): boolean {
    // We can't synchronously check a remote process. If we have it cached, assume alive.
    // The coordinator does periodic health checks to detect dead runners.
    return this.sandboxes.has(sandboxId);
  }

  markRunning(sandboxId: string): void {
    // Fire-and-forget to runner
    this.client.markState(sandboxId, 'running').catch(() => {});
  }

  markWaiting(sandboxId: string): void {
    // Fire-and-forget to runner
    this.client.markState(sandboxId, 'waiting').catch(() => {});
  }

  recordWarmHit(): void {
    // Remote runners track their own metrics — no-op here
  }

  recordColdHit(): void {
    // Remote runners track their own metrics — no-op here
  }

  recordColdLocalHit(): void {
    // Remote runners track their own metrics — no-op here
  }

  recordColdCloudHit(): void {
    // Remote runners track their own metrics — no-op here
  }

  recordColdFreshHit(): void {
    // Remote runners track their own metrics — no-op here
  }

  persistState(sandboxId: string, sessionId: string, agentName: string): boolean {
    // Fire-and-forget to runner. Returns true optimistically.
    this.client.persistState(sandboxId, sessionId, agentName).catch(() => {});
    return true;
  }

  getLogs(sandboxId: string, after?: number): LogEntry[] {
    // TODO: Add runner-level /runner/sandboxes/:id/logs endpoint for remote log streaming
    return [];
  }

  async getStats(): Promise<PoolStats> {
    const health = await this.client.health();
    return health.pool;
  }

  get activeCount(): number {
    return this.sandboxes.size;
  }

  /** Expose the underlying RunnerClient for health checks. */
  getClient(): RunnerClient {
    return this.client;
  }

  get closed(): boolean {
    return this.client.closed;
  }

  close(): void {
    this.client.close();
  }
}
