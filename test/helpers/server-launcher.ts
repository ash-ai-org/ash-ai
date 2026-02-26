import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DOCKER_IMAGE = 'ash-dev';
const DOCKER_MOUNT_ROOT = '/mnt/test';

/** Default API key injected into every test server unless overridden via extraEnv. */
export const TEST_API_KEY = 'test-integration-key-abc123';

export interface ServerHandle {
  url: string;
  /** The API key the server was started with. Use for Authorization headers. */
  apiKey: string;
  /** Translate a host-side path to the path the server process sees. */
  toServerPath(hostPath: string): string;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export function shouldUseDocker(): boolean {
  // Explicit opt-in/out via env
  if (process.env.ASH_TEST_DOCKER === '1') return true;
  if (process.env.ASH_TEST_DOCKER === '0') return false;
  // Auto-detect: macOS needs Docker for cgroups/bwrap
  return process.platform === 'darwin' && isDockerAvailable();
}

// ---------------------------------------------------------------------------
// Docker image management
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

function launchDirect(port: number, testRoot: string, extraEnv?: Record<string, string>): ServerHandle {
  const bridgeEntry = join(process.cwd(), 'packages/bridge/dist/index.js');
  const dataDir = join(testRoot, 'data');
  mkdirSync(dataDir, { recursive: true });

  // Auto-inject ASH_API_KEY so auth works; tests can override via extraEnv
  const resolvedApiKey = extraEnv?.ASH_API_KEY ?? TEST_API_KEY;
  const child = spawn('node', ['packages/server/dist/index.js'], {
    env: {
      ...process.env,
      ASH_PORT: String(port),
      ASH_HOST: '127.0.0.1',
      ASH_DATA_DIR: dataDir,
      ASH_BRIDGE_ENTRY: bridgeEntry,
      ASH_API_KEY: resolvedApiKey,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  setupLogging(child);

  return {
    url: `http://localhost:${port}`,
    apiKey: resolvedApiKey,
    toServerPath: (p) => p,
    stop: () => stopChild(child),
  };
}

// ---------------------------------------------------------------------------
// Launch: Docker (macOS → Linux with cgroups + bwrap)
// ---------------------------------------------------------------------------

function launchInDocker(port: number, testRoot: string, extraEnv?: Record<string, string>): ServerHandle {
  ensureImage();

  const containerName = `ash-test-${port}`;

  // Safety: stop leftover container from a previous crashed run
  try { execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 5000 }); } catch { /* fine */ }

  // Auto-inject ASH_API_KEY so auth works; tests can override via extraEnv
  const resolvedApiKey = extraEnv?.ASH_API_KEY ?? TEST_API_KEY;

  const extraEnvArgs: string[] = [];
  // Inject API key first so extraEnv can override
  extraEnvArgs.push('-e', `ASH_API_KEY=${resolvedApiKey}`);
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      extraEnvArgs.push('-e', `${key}=${value}`);
    }
  }

  const child = spawn('docker', [
    'run', '--rm',
    '--name', containerName,
    '--init',
    '-p', `${port}:${port}`,
    '-v', `${testRoot}:${DOCKER_MOUNT_ROOT}`,
    '--privileged',
    '-e', `ASH_PORT=${port}`,
    '-e', `ASH_HOST=0.0.0.0`,
    '-e', `ASH_DATA_DIR=/tmp/ash-data`,
    '-e', `ASH_BRIDGE_ENTRY=/app/packages/bridge/dist/index.js`,
    ...extraEnvArgs,
    DOCKER_IMAGE,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  setupLogging(child);

  return {
    url: `http://localhost:${port}`,
    apiKey: resolvedApiKey,
    toServerPath: (hostPath) => hostPath.replace(testRoot, DOCKER_MOUNT_ROOT),
    stop: async () => {
      try { execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 10_000 }); } catch { /* fine */ }
      await stopChild(child);
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function setupLogging(child: ChildProcess): void {
  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd();
    if (line.includes('sandbox') || line.includes('error') || line.includes('Error') || line.includes('ENOENT')) {
      console.error('[server]', line);
    }
  });
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

export async function launchServer(opts: {
  port: number;
  testRoot: string;
  extraEnv?: Record<string, string>;
  /** Force direct mode (no Docker). Use for coordinator-only servers that don't need cgroups/bwrap. */
  forceDirect?: boolean;
}): Promise<ServerHandle> {
  if (!opts.forceDirect && shouldUseDocker()) {
    return launchInDocker(opts.port, opts.testRoot, opts.extraEnv);
  }
  return launchDirect(opts.port, opts.testRoot, opts.extraEnv);
}

/**
 * Poll the health endpoint until the server is ready.
 */
export async function waitForReady(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}
