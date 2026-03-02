import { execSync, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SandboxLimits } from '@ash-ai/shared';
import { DEFAULT_SANDBOX_LIMITS, DISK_CHECK_INTERVAL_MS } from '@ash-ai/shared';
import { hasGVisor, spawnWithGVisor } from './gvisor.js';

export { DEFAULT_SANDBOX_LIMITS };

// =============================================================================
// Types
// =============================================================================

export interface SpawnResult {
  child: ChildProcess;
  cleanup: () => void;
}

export interface SandboxSpawnOpts {
  sandboxId: string;
  workspaceDir: string;
  agentDir: string;
  sandboxDir: string;
  sandboxesDir: string;
  /**
   * Per-sandbox home directory (e.g. sandboxDir/home/).
   * When set, bind-mounted OVER /home/ash-sandbox so each sandbox gets its own
   * private writable home — no shared state between sandboxes.
   */
  homeDir?: string;
  /**
   * Per-sandbox tmp directory (e.g. sandboxDir/tmp/).
   * When set, bind-mounted OVER /tmp so each sandbox gets its own private
   * writable tmp directory (needed for Claude Code's Bash tool).
   */
  tmpDir?: string;
}

// =============================================================================
// Platform detection
// =============================================================================

function hasCgroups(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    // Check that the ash cgroup parent exists and is writable
    // (docker-entrypoint.sh sets this up, or it exists on native Linux with proper perms)
    execSync('test -d /sys/fs/cgroup/ash && test -w /sys/fs/cgroup/ash', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let _hasBwrap: boolean | null = null;

export function hasBwrap(): boolean {
  if (_hasBwrap !== null) return _hasBwrap;
  if (process.platform !== 'linux') { _hasBwrap = false; return false; }
  try {
    // Actually test namespace creation, not just binary existence
    execSync('bwrap --ro-bind / / -- /bin/true', { stdio: 'ignore', timeout: 5000 });
    _hasBwrap = true;
  } catch {
    _hasBwrap = false;
  }
  return _hasBwrap;
}

/**
 * Build bwrap args for filesystem isolation.
 *
 * Strategy:
 *   1. Bind entire host filesystem read-only (--ro-bind / /)
 *   2. Overlay the entire data directory with tmpfs (hides agents, sessions, sandboxes, etc.)
 *   3. Bind this sandbox's dir back read-write (workspace + socket)
 *   4. Private /tmp, fresh /dev and /proc, PID namespace
 */
export function buildBwrapArgs(sandboxOpts: SandboxSpawnOpts): string[] {
  // dataDir is the parent of sandboxesDir (e.g. /data/).
  // Hiding the entire data dir prevents sandboxes from seeing agents/, sessions/, etc.
  const dataDir = dirname(sandboxOpts.sandboxesDir);

  // Mount order matters: parent tmpfs mounts before child bind mounts.
  // bwrap processes them in order, and later mounts override earlier ones
  // at overlapping paths.
  return [
    // Full host filesystem, read-only
    '--ro-bind', '/', '/',
    // Private /tmp — bind per-sandbox tmp dir if available (writable by sandbox user),
    // otherwise fall back to tmpfs (root-owned, may not be writable by non-root sandbox user).
    ...(sandboxOpts.tmpDir
      ? ['--bind', sandboxOpts.tmpDir, '/tmp']
      : ['--tmpfs', '/tmp']),
    // Hide entire data directory (agents, sessions, sandboxes, etc.)
    '--tmpfs', dataDir,
    // Ensure sandboxes parent directory exists on tmpfs (needed for nested bind mount)
    '--dir', sandboxOpts.sandboxesDir,
    // Restore only this sandbox's directory, read-write (workspace + socket)
    '--bind', sandboxOpts.sandboxDir, sandboxOpts.sandboxDir,
    // Per-sandbox home: bind sandboxDir/home/ OVER /home/ash-sandbox so each
    // sandbox gets its own private writable home directory (no cross-sandbox leaks).
    ...(sandboxOpts.homeDir ? ['--bind', sandboxOpts.homeDir, '/home/ash-sandbox'] : []),
    // Minimal /dev and /proc
    '--dev', '/dev',
    '--proc', '/proc',
    // PID namespace isolation
    '--unshare-pid',
    // Die when parent dies
    '--die-with-parent',
    // Working directory
    '--chdir', sandboxOpts.workspaceDir,
  ];
}

// =============================================================================
// Linux: cgroups v2
// =============================================================================

const CGROUP_ROOT = '/sys/fs/cgroup/ash';

export function createCgroup(sandboxId: string, limits: SandboxLimits): string {
  const cgroupPath = join(CGROUP_ROOT, sandboxId);
  mkdirSync(cgroupPath, { recursive: true });

  // Memory limit
  const memoryBytes = limits.memoryMb * 1024 * 1024;
  writeFileSync(join(cgroupPath, 'memory.max'), String(memoryBytes));
  try {
    writeFileSync(join(cgroupPath, 'memory.swap.max'), '0');
  } catch {
    // swap controller may not be enabled
  }

  // CPU limit (100000 period, quota scales with cpuPercent)
  const cpuQuota = limits.cpuPercent * 1000;
  writeFileSync(join(cgroupPath, 'cpu.max'), `${cpuQuota} 100000`);

  // Process limit (fork bomb protection)
  writeFileSync(join(cgroupPath, 'pids.max'), String(limits.maxProcesses));

  return cgroupPath;
}

export function addToCgroup(cgroupPath: string, pid: number): void {
  writeFileSync(join(cgroupPath, 'cgroup.procs'), String(pid));
}

export function removeCgroup(cgroupPath: string): void {
  try {
    rmSync(cgroupPath, { recursive: true, force: true });
  } catch {
    // may already be gone or processes still inside
  }
}

// =============================================================================
// Fallback: ulimit (macOS dev without Docker)
// =============================================================================

function buildUlimitPrefix(limits: SandboxLimits): string {
  const parts: string[] = [];

  // ulimit -v (virtual memory) doesn't work on macOS — skip it there
  if (process.platform !== 'darwin') {
    parts.push(`ulimit -v ${limits.memoryMb * 1024}`);
  }

  // ulimit -u (max user processes) — on macOS this applies to the entire user,
  // not just the subprocess tree. Setting it to 64 when the user already has 60+
  // processes causes "fork: Resource temporarily unavailable". Skip on macOS.
  if (process.platform !== 'darwin') {
    parts.push(`ulimit -u ${limits.maxProcesses}`);
  }

  parts.push(`ulimit -f ${limits.diskMb * 1024}`);  // Max file size (KB blocks)

  return parts.join(' && ');
}

function spawnWithUlimit(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
): SpawnResult {
  const prefix = buildUlimitPrefix(limits);
  const escapedArgs = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  // Use bash (not sh) — Debian's sh is dash which doesn't support ulimit -u
  const shell = process.platform === 'linux' ? 'bash' : 'sh';
  const child = spawn(shell, ['-c', `${prefix} && exec ${command} ${escapedArgs}`], opts);

  return { child, cleanup: () => {} };
}

// =============================================================================
// Unified spawn
// =============================================================================

/**
 * Sandbox backend selection via ASH_SANDBOX_BACKEND env var.
 * Values: "gvisor" | "bwrap" | "auto" (default)
 *
 * "auto" detection order on Linux:
 *   1. gVisor (runsc) — strongest: syscall-interception via user-space kernel
 *   2. bwrap           — namespace isolation (kernel exploit = escape)
 *   3. cgroups-only    — resource limits only (outer container provides isolation)
 */
function getSandboxBackend(): 'gvisor' | 'bwrap' | 'auto' {
  const val = process.env.ASH_SANDBOX_BACKEND?.toLowerCase();
  if (val === 'gvisor' || val === 'bwrap') return val;
  return 'auto';
}

export function spawnWithLimits(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  if (process.platform === 'linux') {
    const backend = getSandboxBackend();

    // Explicit gVisor backend requested
    if (backend === 'gvisor') {
      if (!hasGVisor()) {
        throw new Error(
          'ASH_SANDBOX_BACKEND=gvisor but runsc is not available. ' +
          'Install gVisor (runsc) or set ASH_SANDBOX_BACKEND=auto.',
        );
      }
      return spawnWithGVisor(command, args, opts, limits, sandboxOpts);
    }

    // Explicit bwrap backend requested
    if (backend === 'bwrap') {
      if (!hasCgroups()) {
        throw new Error(
          'SECURITY: cgroups not available on Linux. ' +
          'Sandbox isolation requires cgroups v2 with /sys/fs/cgroup/ash writable.',
        );
      }
      if (!hasBwrap()) {
        throw new Error(
          'ASH_SANDBOX_BACKEND=bwrap but bwrap namespace creation failed. ' +
          'Ensure bubblewrap is installed and CAP_SYS_ADMIN is available.',
        );
      }
      return spawnWithCgroups(command, args, opts, limits, sandboxOpts);
    }

    // Auto-detect: try strongest isolation first
    // 1. gVisor (strongest — syscall interception)
    if (hasGVisor()) {
      return spawnWithGVisor(command, args, opts, limits, sandboxOpts);
    }

    // 2. bwrap + cgroups (namespace isolation)
    if (!hasCgroups()) {
      throw new Error(
        'SECURITY: cgroups not available on Linux. ' +
        'Sandbox isolation requires cgroups v2 with /sys/fs/cgroup/ash writable. ' +
        'Run via docker-entrypoint.sh or set up cgroups manually.',
      );
    }
    if (!hasBwrap()) {
      // 3. cgroups-only (Fargate/environments where bwrap can't create namespaces)
      console.warn('[resource-limits] bwrap not available — falling back to cgroups-only (no filesystem isolation)');
      return spawnWithCgroupsOnly(command, args, opts, limits, sandboxOpts);
    }
    return spawnWithCgroups(command, args, opts, limits, sandboxOpts);
  }

  // macOS: ulimit fallback for local development only.
  // No bwrap on macOS — filesystem isolation is not enforced.
  return spawnWithUlimit(command, args, opts, limits);
}

/**
 * Linux sandbox spawn: cgroups only (no bwrap filesystem isolation).
 * Used in environments like Fargate where bwrap can't create namespaces
 * but the outer container/VM already provides isolation.
 */
function spawnWithCgroupsOnly(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  const cgroupPath = createCgroup(sandboxOpts.sandboxId, limits);

  const child = spawn(command, args, opts);
  console.log(`[resource-limits] Spawned sandbox ${sandboxOpts.sandboxId.slice(0, 8)} with cgroups only (no bwrap)`);

  if (child.pid) {
    try {
      addToCgroup(cgroupPath, child.pid);
    } catch (err) {
      console.error(`[resource-limits] Failed to add PID ${child.pid} to cgroup: ${err}`);
    }
  }

  const cleanup = () => removeCgroup(cgroupPath);
  return { child, cleanup };
}

/**
 * Linux sandbox spawn: cgroups for resource limits + bwrap for filesystem isolation.
 * Both are required — caller must verify hasCgroups() && hasBwrap() before calling.
 */
function spawnWithCgroups(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  const cgroupPath = createCgroup(sandboxOpts.sandboxId, limits);
  const bwrapArgs = buildBwrapArgs(sandboxOpts);

  // bwrap needs root (or setuid) to create mount namespaces.
  // Remove uid/gid from spawn opts — bwrap runs as root, then we
  // drop privileges inside the namespace via runuser.
  const spawnOpts = { ...opts } as Record<string, unknown>;
  const sandboxUid = spawnOpts.uid as number | undefined;
  delete spawnOpts.uid;
  delete spawnOpts.gid;
  delete spawnOpts.cwd; // bwrap --chdir handles this

  if (sandboxUid !== undefined) {
    // Drop to sandbox user inside the namespace
    bwrapArgs.push('--', 'runuser', '-u', 'ash-sandbox', '--', command, ...args);
  } else {
    bwrapArgs.push('--', command, ...args);
  }

  const child = spawn('bwrap', bwrapArgs, spawnOpts as SpawnOptions);
  console.log(`[resource-limits] Spawned sandbox ${sandboxOpts.sandboxId.slice(0, 8)} with bwrap filesystem isolation`);

  if (child.pid) {
    try {
      addToCgroup(cgroupPath, child.pid);
    } catch (err) {
      console.error(`[resource-limits] Failed to add PID ${child.pid} to cgroup: ${err}`);
    }
  }

  const cleanup = () => removeCgroup(cgroupPath);
  return { child, cleanup };
}

// =============================================================================
// OOM detection
// =============================================================================

export function isOomExit(code: number | null, signal: string | null): boolean {
  return signal === 'SIGKILL' || code === 137;
}

// =============================================================================
// Disk usage monitoring
// =============================================================================

export function getDirSizeKb(dir: string): number {
  const output = execSync(`du -sk '${dir}'`, { timeout: 5000 }).toString().trim();
  return parseInt(output.split('\t')[0], 10);
}

export function startDiskMonitor(
  workspaceDir: string,
  limitMb: number,
  onExceeded: () => void,
  intervalMs: number = DISK_CHECK_INTERVAL_MS,
): NodeJS.Timeout {
  return setInterval(() => {
    try {
      const sizeKb = getDirSizeKb(workspaceDir);
      if (sizeKb > limitMb * 1024) {
        onExceeded();
      }
    } catch {
      // du failed — workspace may be gone
    }
  }, intervalMs);
}
