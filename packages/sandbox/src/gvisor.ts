import { execSync, spawn, type SpawnOptions } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SandboxLimits } from '@ash-ai/shared';
import type { SpawnResult, SandboxSpawnOpts } from './resource-limits.js';

// =============================================================================
// Types — OCI Runtime Spec (subset needed for gVisor)
// =============================================================================

interface OciMount {
  destination: string;
  type: string;
  source: string;
  options?: string[];
}

interface OciSpec {
  ociVersion: string;
  process: {
    terminal: boolean;
    user: { uid: number; gid: number };
    args: string[];
    env: string[];
    cwd: string;
  };
  root: {
    path: string;
    readonly: boolean;
  };
  mounts: OciMount[];
  linux: {
    namespaces: Array<{ type: string }>;
    resources: {
      memory?: { limit: number };
      cpu?: { quota: number; period: number };
      pids?: { limit: number };
    };
  };
}

// =============================================================================
// Detection
// =============================================================================

let _hasGVisor: boolean | null = null;

export function hasGVisor(): boolean {
  if (_hasGVisor !== null) return _hasGVisor;
  if (process.platform !== 'linux') { _hasGVisor = false; return false; }
  try {
    execSync('runsc --version', { stdio: 'ignore', timeout: 5000 });
    _hasGVisor = true;
  } catch {
    _hasGVisor = false;
  }
  return _hasGVisor;
}

// =============================================================================
// OCI Spec Generation
// =============================================================================

/**
 * Generate an OCI runtime spec (config.json) that mirrors the current bwrap
 * mount setup. Resource limits are embedded in the spec so runsc manages
 * cgroups directly — no manual cgroup setup needed.
 */
export function generateOciSpec(
  sandboxOpts: SandboxSpawnOpts,
  limits: SandboxLimits,
  command: string,
  args: string[],
  env: Record<string, string>,
  sandboxUid?: number,
  sandboxGid?: number,
): OciSpec {
  const uid = sandboxUid ?? 0;
  const gid = sandboxGid ?? 0;

  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  // Mounts mirror buildBwrapArgs() from resource-limits.ts:
  //   --ro-bind / /             → root.path = "/", root.readonly = true
  //   --tmpfs /tmp              → tmpfs mount at /tmp
  //   --tmpfs sandboxesDir      → tmpfs mount (hides other sandboxes)
  //   --bind sandboxDir         → bind mount rw
  //   --bind homeDir → /home/ash-sandbox  → bind mount rw
  //   --dev /dev                → tmpfs mount for /dev
  //   --proc /proc              → proc mount
  const mounts: OciMount[] = [
    // /proc — process information
    {
      destination: '/proc',
      type: 'proc',
      source: 'proc',
    },
    // /dev — minimal device access
    {
      destination: '/dev',
      type: 'tmpfs',
      source: 'tmpfs',
      options: ['nosuid', 'strictatime', 'mode=755', 'size=65536k'],
    },
    // /dev/pts — pseudo-terminal support (needed by Node.js)
    {
      destination: '/dev/pts',
      type: 'devpts',
      source: 'devpts',
      options: ['nosuid', 'noexec', 'newinstance', 'ptmxmode=0666', 'mode=0620'],
    },
    // /dev/shm — shared memory
    {
      destination: '/dev/shm',
      type: 'tmpfs',
      source: 'shm',
      options: ['nosuid', 'noexec', 'nodev', 'mode=1777', 'size=65536k'],
    },
    // Private /tmp
    {
      destination: '/tmp',
      type: 'tmpfs',
      source: 'tmpfs',
      options: ['nosuid', 'nodev', 'mode=1777'],
    },
    // Hide all other sandboxes — empty tmpfs over sandboxesDir
    {
      destination: sandboxOpts.sandboxesDir,
      type: 'tmpfs',
      source: 'tmpfs',
      options: ['nosuid', 'nodev', 'mode=755'],
    },
    // Restore this sandbox's directory read-write (workspace + socket)
    {
      destination: sandboxOpts.sandboxDir,
      type: 'bind',
      source: sandboxOpts.sandboxDir,
      options: ['rbind', 'rw'],
    },
  ];

  // Per-sandbox home directory (same as bwrap --bind homeDir /home/ash-sandbox)
  if (sandboxOpts.homeDir) {
    mounts.push({
      destination: '/home/ash-sandbox',
      type: 'bind',
      source: sandboxOpts.homeDir,
      options: ['rbind', 'rw'],
    });
  }

  return {
    ociVersion: '1.0.2',
    process: {
      terminal: false,
      user: { uid, gid },
      args: [command, ...args],
      env: envArray,
      cwd: sandboxOpts.workspaceDir,
    },
    root: {
      // Root filesystem is the host root, read-only.
      // Specific writable paths are mounted over it.
      path: '/',
      readonly: true,
    },
    mounts,
    linux: {
      namespaces: [
        { type: 'pid' },
        { type: 'mount' },
        { type: 'ipc' },
      ],
      resources: {
        memory: { limit: limits.memoryMb * 1024 * 1024 },
        cpu: {
          // Same convention as cgroup cpu.max: quota/period in microseconds
          quota: limits.cpuPercent * 1000,
          period: 100000,
        },
        pids: { limit: limits.maxProcesses },
      },
    },
  };
}

// =============================================================================
// Spawn
// =============================================================================

const RUNSC_ROOT = '/var/run/runsc/ash';

/**
 * Spawn a sandboxed process using gVisor (runsc).
 *
 * runsc handles cgroups, mounts, namespaces, and syscall interception — no
 * manual cgroup setup or bwrap needed.
 */
export function spawnWithGVisor(
  command: string,
  args: string[],
  opts: SpawnOptions,
  limits: SandboxLimits,
  sandboxOpts: SandboxSpawnOpts,
): SpawnResult {
  const bundleDir = join(sandboxOpts.sandboxDir, 'bundle');
  mkdirSync(bundleDir, { recursive: true });

  // Extract uid/gid from spawn opts (runsc handles user switching via OCI spec)
  const spawnOpts = { ...opts } as Record<string, unknown>;
  const sandboxUid = spawnOpts.uid as number | undefined;
  const sandboxGid = spawnOpts.gid as number | undefined;
  delete spawnOpts.uid;
  delete spawnOpts.gid;
  delete spawnOpts.cwd; // runsc handles cwd via OCI spec

  // Build environment from spawn opts
  const env = (spawnOpts.env ?? process.env) as Record<string, string>;

  // Generate OCI spec
  const spec = generateOciSpec(sandboxOpts, limits, command, args, env, sandboxUid, sandboxGid);
  writeFileSync(join(bundleDir, 'config.json'), JSON.stringify(spec, null, 2));

  // Ensure runsc root directory exists
  mkdirSync(RUNSC_ROOT, { recursive: true });

  // runsc run with ptrace platform (works without /dev/kvm)
  const child = spawn('runsc', [
    '--root', RUNSC_ROOT,
    '--platform', 'ptrace',
    '--network', 'host',
    'run',
    '--bundle', bundleDir,
    sandboxOpts.sandboxId,
  ], {
    ...spawnOpts,
    stdio: spawnOpts.stdio as SpawnOptions['stdio'] ?? ['ignore', 'pipe', 'pipe'],
  } as SpawnOptions);

  console.log(`[resource-limits] Spawned sandbox ${sandboxOpts.sandboxId.slice(0, 8)} with gVisor (runsc) syscall-interception isolation`);

  const cleanup = () => {
    // runsc delete to clean up container state
    try {
      execSync(`runsc --root=${RUNSC_ROOT} delete --force ${sandboxOpts.sandboxId}`, {
        timeout: 5000,
        stdio: 'ignore',
      });
    } catch {
      // container may already be gone
    }
    try {
      rmSync(bundleDir, { recursive: true, force: true });
    } catch {
      // bundle dir may already be gone
    }
  };

  return { child, cleanup };
}
