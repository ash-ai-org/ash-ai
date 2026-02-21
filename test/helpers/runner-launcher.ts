import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { shouldUseDocker } from './server-launcher.js';

const DOCKER_IMAGE = 'ash-dev';
// Mount testRoot at the same path inside Docker so host paths resolve naturally.
// This avoids needing path translation between coordinator (host) and runner (Docker).

export interface RunnerHandle {
  url: string;
  runnerId: string;
  /** Translate a host-side path to the path the runner process sees. */
  toRunnerPath(hostPath: string): string;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Docker image management (shared with server-launcher)
// ---------------------------------------------------------------------------

function isImageBuilt(): boolean {
  try {
    execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function buildImage(): void {
  console.log(`[ash-test] Building ${DOCKER_IMAGE} Docker image (first time only)...`);
  execSync(`docker build -t ${DOCKER_IMAGE} .`, {
    stdio: 'inherit',
    cwd: process.cwd(),
    timeout: 300_000,
  });
  console.log(`[ash-test] Docker image built.`);
}

function ensureImage(): void {
  if (!isImageBuilt()) buildImage();
}

// ---------------------------------------------------------------------------
// Launch: direct (Linux or macOS fallback)
// ---------------------------------------------------------------------------

function launchDirect(opts: {
  runnerId: string;
  port: number;
  serverUrl: string;
  advertiseHost: string;
  maxSandboxes: number;
  dataDir: string;
  internalSecret?: string;
}): RunnerHandle {
  const bridgeEntry = join(process.cwd(), 'packages/bridge/dist/index.js');
  const runnerEntry = join(process.cwd(), 'packages/runner/dist/index.js');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ASH_RUNNER_ID: opts.runnerId,
    ASH_RUNNER_PORT: String(opts.port),
    ASH_RUNNER_HOST: '127.0.0.1',
    ASH_SERVER_URL: opts.serverUrl,
    ASH_RUNNER_ADVERTISE_HOST: opts.advertiseHost,
    ASH_MAX_SANDBOXES: String(opts.maxSandboxes),
    ASH_BRIDGE_ENTRY: bridgeEntry,
    ASH_DATA_DIR: opts.dataDir,
  };

  if (opts.internalSecret) {
    env.ASH_INTERNAL_SECRET = opts.internalSecret;
  }

  const child = spawn('node', [runnerEntry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  setupLogging(child, opts.runnerId);

  return {
    url: `http://127.0.0.1:${opts.port}`,
    runnerId: opts.runnerId,
    toRunnerPath: (p) => p,
    stop: () => stopChild(child),
  };
}

// ---------------------------------------------------------------------------
// Launch: Docker (macOS → Linux with cgroups + bwrap)
// ---------------------------------------------------------------------------

function launchInDocker(opts: {
  runnerId: string;
  port: number;
  serverUrl: string;
  testRoot: string;
  maxSandboxes: number;
  dataDir: string;
  internalSecret?: string;
}): RunnerHandle {
  ensureImage();

  const containerName = `ash-runner-${opts.runnerId}-${opts.port}`;

  // Safety: stop leftover container from a previous crashed run
  try { execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 5000 }); } catch { /* fine */ }

  // When the runner is inside Docker, the coordinator is on the host.
  // Translate the server URL to use Docker's host gateway.
  const dockerServerUrl = opts.serverUrl
    .replace('localhost', 'host.docker.internal')
    .replace('127.0.0.1', 'host.docker.internal');

  const extraEnvArgs: string[] = [];
  if (opts.internalSecret) {
    extraEnvArgs.push('-e', `ASH_INTERNAL_SECRET=${opts.internalSecret}`);
  }

  // Pass auth env vars so the Claude Code SDK inside Docker can authenticate
  for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'ASH_REAL_SDK']) {
    if (process.env[key]) {
      extraEnvArgs.push('-e', `${key}=${process.env[key]}`);
    }
  }

  const child = spawn('docker', [
    'run', '--rm',
    '--name', containerName,
    '--init',
    '-p', `${opts.port}:${opts.port}`,
    '-v', `${opts.testRoot}:${opts.testRoot}`,
    '--privileged',
    '-e', `ASH_RUNNER_ID=${opts.runnerId}`,
    '-e', `ASH_RUNNER_PORT=${opts.port}`,
    '-e', `ASH_RUNNER_HOST=0.0.0.0`,
    '-e', `ASH_SERVER_URL=${dockerServerUrl}`,
    // Advertise as 127.0.0.1 — the coordinator runs on the host and reaches the
    // runner via Docker's port mapping (-p port:port).
    '-e', `ASH_RUNNER_ADVERTISE_HOST=127.0.0.1`,
    '-e', `ASH_MAX_SANDBOXES=${opts.maxSandboxes}`,
    '-e', `ASH_DATA_DIR=/tmp/ash-runner-data`,
    '-e', `ASH_BRIDGE_ENTRY=/app/packages/bridge/dist/index.js`,
    ...extraEnvArgs,
    DOCKER_IMAGE,
    'node', 'packages/runner/dist/index.js',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  setupLogging(child, opts.runnerId);

  return {
    url: `http://127.0.0.1:${opts.port}`,
    runnerId: opts.runnerId,
    toRunnerPath: (p) => p, // paths match — testRoot mounted at same path
    stop: async () => {
      try { execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 10_000 }); } catch { /* fine */ }
      await stopChild(child);
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function setupLogging(child: ChildProcess, runnerId: string): void {
  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd();
    if (line.includes('error') || line.includes('Error') || line.includes('registered') ||
        line.includes('listening') || line.includes('sandbox') || line.includes('ENOENT')) {
      console.error(`[runner:${runnerId}]`, line);
    }
  });
  child.stdout?.on('data', () => {}); // drain
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.kill('SIGTERM');
    child.on('exit', () => resolve());
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Launch an Ash runner process that registers with a coordinator.
 *
 * On macOS with Docker available, runs the runner inside a Docker container
 * (provides cgroups/bwrap for sandbox isolation). On Linux, runs directly.
 *
 * The coordinator always runs direct on the host. The runner (in Docker or not)
 * registers with the coordinator and advertises a reachable address.
 */
export function launchRunner(opts: {
  runnerId: string;
  port: number;
  serverUrl: string;
  advertiseHost?: string;
  maxSandboxes?: number;
  dataDir?: string;
  internalSecret?: string;
  /** Root directory for test artifacts. Required for Docker mode (volume mount). */
  testRoot?: string;
  /** Force direct mode even on macOS. */
  forceDirect?: boolean;
}): RunnerHandle {
  const {
    runnerId,
    port,
    serverUrl,
    advertiseHost = '127.0.0.1',
    maxSandboxes = 50,
    internalSecret,
    forceDirect = false,
  } = opts;

  const dataDir = opts.dataDir || `/tmp/ash-runner-${runnerId}`;

  if (!forceDirect && shouldUseDocker()) {
    if (!opts.testRoot) {
      throw new Error('testRoot is required when running runner in Docker mode');
    }
    return launchInDocker({
      runnerId,
      port,
      serverUrl,
      testRoot: opts.testRoot,
      maxSandboxes,
      dataDir,
      internalSecret,
    });
  }

  return launchDirect({
    runnerId,
    port,
    serverUrl,
    advertiseHost,
    maxSandboxes,
    dataDir,
    internalSecret,
  });
}

/**
 * Poll the runner health endpoint until ready.
 */
export async function waitForRunnerReady(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/runner/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Runner at ${url} did not become ready within ${timeoutMs}ms`);
}
