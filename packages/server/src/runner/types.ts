import type { BridgeCommand, BridgeEvent, PoolStats, SandboxLimits, McpServerConfig } from '@ash-ai/shared';
import type { LogEntry } from '@ash-ai/sandbox';

export interface CreateSandboxRequest {
  sessionId: string;
  agentDir: string;
  agentName: string;
  sandboxId?: string;
  skipAgentCopy?: boolean;
  limits?: Partial<SandboxLimits>;
  onOomKill?: (sandboxId: string) => void;
  /** Extra env vars to inject into the sandbox (e.g. decrypted credentials). */
  extraEnv?: Record<string, string>;
  /** Shell script to run in workspace after install.sh but before the bridge starts. */
  startupScript?: string;
  /** Per-session MCP servers. Merged into agent's .mcp.json (session overrides agent). */
  mcpServers?: Record<string, McpServerConfig>;
  /** System prompt override. Replaces agent's CLAUDE.md for this session. */
  systemPrompt?: string;
}

export interface SandboxHandle {
  sandboxId: string;
  workspaceDir: string;
}

/**
 * Abstraction over sandbox management. Routes and the coordinator
 * program against this interface — LocalRunnerBackend wraps SandboxPool
 * for single-machine mode, RemoteRunnerBackend talks to a runner over HTTP/2.
 */
export interface RunnerBackend {
  createSandbox(opts: CreateSandboxRequest): Promise<SandboxHandle>;
  destroySandbox(sandboxId: string): Promise<void>;
  destroyAll(): Promise<void>;

  sendCommand(sandboxId: string, cmd: BridgeCommand): AsyncGenerator<BridgeEvent>;

  /** Send interrupt to a running sandbox (fire-and-forget). */
  interrupt(sandboxId: string): void;

  /** Returns sandbox info if alive, undefined if not found or dead. */
  getSandbox(sandboxId: string): SandboxHandle | undefined;

  /** Check if the sandbox process is still alive. */
  isSandboxAlive(sandboxId: string): boolean;

  markRunning(sandboxId: string): void;
  markWaiting(sandboxId: string): void;

  recordWarmHit(): void;
  recordColdHit(): void;
  recordColdLocalHit(): void;
  recordColdCloudHit(): void;
  recordColdFreshHit(): void;

  persistState(sandboxId: string, sessionId: string, agentName: string): boolean;

  /** Get buffered log entries for a sandbox, optionally after a given index. */
  getLogs(sandboxId: string, after?: number): LogEntry[];

  getStats(): Promise<PoolStats>;
  readonly activeCount: number;
}
