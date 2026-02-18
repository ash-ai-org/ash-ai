import { execSync, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SandboxLimits } from '@ash-ai/shared';
import { DEFAULT_SANDBOX_LIMITS, DISK_CHECK_INTERVAL_MS } from '@ash-ai/shared';

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

export function spawnWithLimits(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  if (hasCgroups()) {
    return spawnWithCgroups(command, args, opts, limits, sandboxOpts);
  }

  // macOS or unprivileged Linux — ulimit fallback
  return spawnWithUlimit(command, args, opts, limits);
}

function spawnWithCgroups(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  let cgroupPath: string;
  try {
    cgroupPath = createCgroup(sandboxOpts.sandboxId, limits);
  } catch (err) {
    console.error(`[resource-limits] cgroups available but failed to create: ${err}`);
    return spawnWithUlimit(command, args, opts, limits);
  }

  const child = spawn(command, args, opts);

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
