import { type ChildProcess, execSync, execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, unlinkSync, existsSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SANDBOX_ENV_ALLOWLIST, DEFAULT_SANDBOX_LIMITS, INSTALL_SCRIPT_TIMEOUT_MS, startTimer, logTiming } from '@ash-ai/shared';
import type { SandboxLimits, SandboxTimings } from '@ash-ai/shared';
import { BridgeClient } from './bridge-client.js';
import { spawnWithLimits, isOomExit, startDiskMonitor } from './resource-limits.js';

export interface LogEntry {
  index: number;
  level: 'stdout' | 'stderr' | 'system';
  text: string;
  ts: string;
}

export interface ManagedSandbox {
  id: string;
  process: ChildProcess;
  client: BridgeClient;
  socketPath: string;
  workspaceDir: string;
  createdAt: string;
  limits: SandboxLimits;
  startupTimings?: SandboxTimings;
}

export interface CreateSandboxOpts {
  agentDir: string;
  sessionId: string;
  /** Use a specific sandbox ID instead of generating a random one. */
  id?: string;
  /** Skip copying agent files into workspace (for resume when workspace already exists). */
  skipAgentCopy?: boolean;
  limits?: Partial<SandboxLimits>;
  onOomKill?: (sandboxId: string) => void;
  /** Extra env vars to inject into the sandbox (e.g. decrypted credentials). */
  extraEnv?: Record<string, string>;
  /** Shell script to run in workspace after install.sh but before the bridge starts. */
  startupScript?: string;
}

const MAX_LOG_ENTRIES = 10_000;

// Internal tracking — keeps cleanup handles out of the public interface
interface SandboxInternal {
  sandbox: ManagedSandbox;
  resourceCleanup: () => void;
  diskMonitor: NodeJS.Timeout;
}

interface SandboxLogBuffer {
  entries: LogEntry[];
  nextIndex: number;
}

export class SandboxManager {
  private sandboxes = new Map<string, SandboxInternal>();
  private logBuffers = new Map<string, SandboxLogBuffer>();
  private sandboxesDir: string;
  private bridgeEntry: string;
  private defaultLimits: SandboxLimits;

  constructor(opts: { sandboxesDir: string; bridgeEntry: string; defaultLimits?: Partial<SandboxLimits> }) {
    this.sandboxesDir = opts.sandboxesDir;
    this.bridgeEntry = opts.bridgeEntry;
    this.defaultLimits = { ...DEFAULT_SANDBOX_LIMITS, ...opts.defaultLimits };
    mkdirSync(this.sandboxesDir, { recursive: true });
  }

  private appendLog(id: string, level: LogEntry['level'], text: string): void {
    let buf = this.logBuffers.get(id);
    if (!buf) {
      buf = { entries: [], nextIndex: 0 };
      this.logBuffers.set(id, buf);
    }
    buf.entries.push({ index: buf.nextIndex++, level, text, ts: new Date().toISOString() });
    if (buf.entries.length > MAX_LOG_ENTRIES) buf.entries.shift();
  }

  getLogs(id: string, after?: number): LogEntry[] {
    const buf = this.logBuffers.get(id);
    if (!buf) return [];
    if (after == null) return buf.entries;
    return buf.entries.filter((e) => e.index > after);
  }

  async create(opts: CreateSandboxOpts): Promise<ManagedSandbox> {
    const totalTimer = startTimer();
    const id = opts.id ?? randomUUID();
    const shortId = id.slice(0, 8);
    const sandboxDir = join(this.sandboxesDir, id);
    const workspaceDir = join(sandboxDir, 'workspace');
    // Linux: socket in sandboxDir (visible via bwrap bind-mount, not exposed in /tmp).
    // macOS: socket in /tmp (no bwrap, and macOS limits Unix socket paths to 104 bytes).
    const socketPath = process.platform === 'linux'
      ? join(sandboxDir, 'bridge.sock')
      : join(tmpdir(), `ash-${shortId}.sock`);
    const limits: SandboxLimits = { ...this.defaultLimits, ...opts.limits };

    // --- Phase: agent copy ---
    const copyTimer = startTimer();
    if (!opts.skipAgentCopy) {
      // Copy entire agent directory into workspace — no special cases.
      // CLAUDE.md, .claude/, .mcp.json, and any other files the SDK needs
      // all live in the agent dir and get copied as-is.
      cpSync(opts.agentDir, workspaceDir, { recursive: true });
    } else {
      // Resume path: workspace already exists, just ensure the dir is there
      mkdirSync(workspaceDir, { recursive: true });
    }
    const agentCopyMs = copyTimer();

    // SECURITY: Allowlist env — nothing else leaks to sandbox
    const env: Record<string, string> = {};
    for (const key of SANDBOX_ENV_ALLOWLIST) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }
    env.ASH_BRIDGE_SOCKET = socketPath;
    env.ASH_AGENT_DIR = opts.agentDir;
    env.ASH_WORKSPACE_DIR = workspaceDir;
    env.ASH_SANDBOX_ID = id;
    env.ASH_SESSION_ID = opts.sessionId;

    // Merge caller-supplied env (e.g. decrypted credential keys)
    if (opts.extraEnv) {
      Object.assign(env, opts.extraEnv);
    }

    // When ASH_SANDBOX_UID is set (Docker), run bridge as non-root user.
    // Claude Code refuses --dangerously-skip-permissions as root.
    const sandboxUid = process.env.ASH_SANDBOX_UID ? parseInt(process.env.ASH_SANDBOX_UID, 10) : undefined;
    const sandboxGid = process.env.ASH_SANDBOX_GID ? parseInt(process.env.ASH_SANDBOX_GID, 10) : undefined;

    if (sandboxUid !== undefined) {
      env.HOME = `/home/ash-sandbox`;
      // Recursively chown so the non-root sandbox user can write to all files
      execSync(`chown -R ${sandboxUid}:${sandboxGid ?? sandboxUid} '${sandboxDir}'`);
    } else {
      env.HOME = workspaceDir;
    }

    // Run install.sh if present (only on fresh creation, not resume)
    const installTimer = startTimer();
    if (!opts.skipAgentCopy) {
      const installScript = join(workspaceDir, 'install.sh');
      if (existsSync(installScript)) {
        console.log(`[sandbox:${shortId}] Running install.sh...`);
        this.appendLog(id, 'system', 'Running install.sh...');
        chmodSync(installScript, 0o755);
        try {
          const installOutput = execFileSync(installScript, [], {
            cwd: workspaceDir,
            env,
            timeout: INSTALL_SCRIPT_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(sandboxUid !== undefined && { uid: sandboxUid, gid: sandboxGid }),
          });
          if (installOutput.length > 0) {
            const text = installOutput.toString().trimEnd();
            console.log(`[sandbox:${shortId}:install] ${text}`);
            this.appendLog(id, 'system', text);
          }
          console.log(`[sandbox:${shortId}] install.sh completed`);
          this.appendLog(id, 'system', 'install.sh completed');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.appendLog(id, 'system', `install.sh failed: ${msg}`);
          throw new Error(`install.sh failed for sandbox ${shortId}: ${msg}`);
        }
      }
    }
    const installScriptMs = installTimer();

    // Run startup script if provided (only on fresh creation, not resume)
    const startupTimer = startTimer();
    if (!opts.skipAgentCopy && opts.startupScript) {
      const startupPath = join(workspaceDir, 'startup.sh');
      writeFileSync(startupPath, opts.startupScript, 'utf-8');
      chmodSync(startupPath, 0o755);
      console.log(`[sandbox:${shortId}] Running startup.sh...`);
      this.appendLog(id, 'system', 'Running startup.sh...');
      try {
        const startupOutput = execFileSync(startupPath, [], {
          cwd: workspaceDir,
          env,
          timeout: INSTALL_SCRIPT_TIMEOUT_MS,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(sandboxUid !== undefined && { uid: sandboxUid, gid: sandboxGid }),
        });
        if (startupOutput.length > 0) {
          const text = startupOutput.toString().trimEnd();
          console.log(`[sandbox:${shortId}:startup] ${text}`);
          this.appendLog(id, 'system', text);
        }
        console.log(`[sandbox:${shortId}] startup.sh completed`);
        this.appendLog(id, 'system', 'startup.sh completed');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.appendLog(id, 'system', `startup.sh failed: ${msg}`);
        throw new Error(`startup.sh failed for sandbox ${shortId}: ${msg}`);
      }
    }
    const startupScriptMs = startupTimer();

    // --- Phase: bridge spawn ---
    const bridgeSpawnTimer = startTimer();
    const spawnOpts: Record<string, unknown> = {
      env, cwd: workspaceDir, stdio: ['ignore', 'pipe', 'pipe'],
      ...(sandboxUid !== undefined && { uid: sandboxUid, gid: sandboxGid }),
    };

    const { child, cleanup: resourceCleanup } = spawnWithLimits(
      'node',
      [this.bridgeEntry],
      spawnOpts as import('node:child_process').SpawnOptions,
      limits,
      { sandboxId: id, workspaceDir, agentDir: opts.agentDir, sandboxDir, sandboxesDir: this.sandboxesDir },
    );

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trimEnd();
      console.log(`[sandbox:${shortId}:out] ${text}`);
      this.appendLog(id, 'stdout', text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trimEnd();
      console.error(`[sandbox:${shortId}:err] ${text}`);
      this.appendLog(id, 'stderr', text);
    });

    // OOM detection
    child.on('exit', (code, signal) => {
      console.error(`[sandbox:${shortId}] exited code=${code} signal=${signal}`);
      if (isOomExit(code, signal)) {
        console.error(`[sandbox:${shortId}] OOM killed (memory limit: ${limits.memoryMb}MB)`);
        opts.onOomKill?.(id);
      }
    });
    const bridgeSpawnMs = bridgeSpawnTimer();

    // --- Phase: bridge connect ---
    const bridgeConnectTimer = startTimer();
    const client = new BridgeClient(socketPath);
    await client.connect();
    const bridgeConnectMs = bridgeConnectTimer();

    // --- Timing summary ---
    const totalMs = totalTimer();
    const timings: SandboxTimings = {
      agentCopyMs: Math.round(agentCopyMs * 100) / 100,
      installScriptMs: Math.round(installScriptMs * 100) / 100,
      startupScriptMs: Math.round(startupScriptMs * 100) / 100,
      bridgeSpawnMs: Math.round(bridgeSpawnMs * 100) / 100,
      bridgeConnectMs: Math.round(bridgeConnectMs * 100) / 100,
      totalMs: Math.round(totalMs * 100) / 100,
    };

    this.appendLog(id, 'system',
      `Sandbox created in ${Math.round(totalMs)}ms (copy: ${Math.round(agentCopyMs)}ms, install: ${Math.round(installScriptMs)}ms, startup: ${Math.round(startupScriptMs)}ms, bridge: ${Math.round(bridgeSpawnMs + bridgeConnectMs)}ms)`
    );

    logTiming({
      type: 'timing',
      source: 'sandbox',
      sessionId: opts.sessionId,
      sandboxId: id,
      ...timings,
      timestamp: new Date().toISOString(),
    });

    const sandbox: ManagedSandbox = {
      id,
      process: child,
      client,
      socketPath,
      workspaceDir,
      createdAt: new Date().toISOString(),
      limits,
      startupTimings: timings,
    };

    // Disk monitoring — kill sandbox if workspace exceeds disk limit
    const diskMonitor = startDiskMonitor(
      workspaceDir,
      limits.diskMb,
      () => {
        console.error(`[sandbox:${shortId}] exceeded disk limit (${limits.diskMb}MB), killing`);
        this.destroy(id);
      },
    );

    this.sandboxes.set(id, { sandbox, resourceCleanup, diskMonitor });
    return sandbox;
  }

  get(id: string): ManagedSandbox | undefined {
    return this.sandboxes.get(id)?.sandbox;
  }

  async destroy(id: string): Promise<void> {
    const internal = this.sandboxes.get(id);
    if (!internal) return;

    const { sandbox, resourceCleanup, diskMonitor } = internal;

    clearInterval(diskMonitor);
    sandbox.client.disconnect();

    if (sandbox.process.exitCode === null) {
      sandbox.process.kill('SIGTERM');
      // Wait for exit with timeout
      await Promise.race([
        new Promise<void>((resolve) => sandbox.process.on('exit', resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (sandbox.process.exitCode === null) {
        sandbox.process.kill('SIGKILL');
      }
    }

    try { unlinkSync(sandbox.socketPath); } catch { /* already gone */ }
    resourceCleanup();
    this.sandboxes.delete(id);
    this.logBuffers.delete(id);
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.all(ids.map((id) => this.destroy(id)));
  }

  get activeCount(): number {
    return this.sandboxes.size;
  }
}
