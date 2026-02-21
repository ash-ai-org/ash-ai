import { type ChildProcess, execSync, execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SANDBOX_ENV_ALLOWLIST, DEFAULT_SANDBOX_LIMITS, INSTALL_SCRIPT_TIMEOUT_MS } from '@ash-ai/shared';
import type { SandboxLimits } from '@ash-ai/shared';
import { BridgeClient } from './bridge-client.js';
import { spawnWithLimits, isOomExit, startDiskMonitor } from './resource-limits.js';

export interface ManagedSandbox {
  id: string;
  process: ChildProcess;
  client: BridgeClient;
  socketPath: string;
  workspaceDir: string;
  createdAt: string;
  limits: SandboxLimits;
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
}

// Internal tracking — keeps cleanup handles out of the public interface
interface SandboxInternal {
  sandbox: ManagedSandbox;
  resourceCleanup: () => void;
  diskMonitor: NodeJS.Timeout;
}

export class SandboxManager {
  private sandboxes = new Map<string, SandboxInternal>();
  private sandboxesDir: string;
  private bridgeEntry: string;
  private defaultLimits: SandboxLimits;

  constructor(opts: { sandboxesDir: string; bridgeEntry: string; defaultLimits?: Partial<SandboxLimits> }) {
    this.sandboxesDir = opts.sandboxesDir;
    this.bridgeEntry = opts.bridgeEntry;
    this.defaultLimits = { ...DEFAULT_SANDBOX_LIMITS, ...opts.defaultLimits };
    mkdirSync(this.sandboxesDir, { recursive: true });
  }

  async create(opts: CreateSandboxOpts): Promise<ManagedSandbox> {
    const id = opts.id ?? randomUUID();
    const shortId = id.slice(0, 8);
    const sandboxDir = join(this.sandboxesDir, id);
    const workspaceDir = join(sandboxDir, 'workspace');
    // macOS limits Unix socket paths to 104 bytes — use /tmp with short ID
    const socketPath = join(tmpdir(), `ash-${shortId}.sock`);
    const limits: SandboxLimits = { ...this.defaultLimits, ...opts.limits };

    if (!opts.skipAgentCopy) {
      // Copy entire agent directory into workspace — no special cases.
      // CLAUDE.md, .claude/, .mcp.json, and any other files the SDK needs
      // all live in the agent dir and get copied as-is.
      cpSync(opts.agentDir, workspaceDir, { recursive: true });
    } else {
      // Resume path: workspace already exists, just ensure the dir is there
      mkdirSync(workspaceDir, { recursive: true });
    }

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
    if (!opts.skipAgentCopy) {
      const installScript = join(workspaceDir, 'install.sh');
      if (existsSync(installScript)) {
        console.log(`[sandbox:${shortId}] Running install.sh...`);
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
            console.log(`[sandbox:${shortId}:install] ${installOutput.toString().trimEnd()}`);
          }
          console.log(`[sandbox:${shortId}] install.sh completed`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`install.sh failed for sandbox ${shortId}: ${msg}`);
        }
      }
    }

    const spawnOpts: Record<string, unknown> = {
      env, cwd: workspaceDir, stdio: ['ignore', 'pipe', 'pipe'],
      ...(sandboxUid !== undefined && { uid: sandboxUid, gid: sandboxGid }),
    };

    const { child, cleanup: resourceCleanup } = spawnWithLimits(
      'node',
      [this.bridgeEntry],
      spawnOpts as import('node:child_process').SpawnOptions,
      limits,
      { sandboxId: id, workspaceDir, agentDir: opts.agentDir },
    );

    child.stdout?.on('data', (chunk: Buffer) => {
      console.log(`[sandbox:${shortId}:out] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[sandbox:${shortId}:err] ${chunk.toString().trimEnd()}`);
    });

    // OOM detection
    child.on('exit', (code, signal) => {
      console.error(`[sandbox:${shortId}] exited code=${code} signal=${signal}`);
      if (isOomExit(code, signal)) {
        console.error(`[sandbox:${shortId}] OOM killed (memory limit: ${limits.memoryMb}MB)`);
        opts.onOomKill?.(id);
      }
    });

    const client = new BridgeClient(socketPath);
    await client.connect();

    const sandbox: ManagedSandbox = {
      id,
      process: child,
      client,
      socketPath,
      workspaceDir,
      createdAt: new Date().toISOString(),
      limits,
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
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.all(ids.map((id) => this.destroy(id)));
  }

  get activeCount(): number {
    return this.sandboxes.size;
  }
}
