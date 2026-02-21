import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface RunnerHandle {
  url: string;
  runnerId: string;
  stop(): Promise<void>;
}

/**
 * Launch an Ash runner process that registers with a coordinator.
 * Direct mode only (no Docker) — this is for local integration testing
 * where both coordinator and runner run on the same machine.
 */
export function launchRunner(opts: {
  runnerId: string;
  port: number;
  serverUrl: string;
  advertiseHost?: string;
  maxSandboxes?: number;
  dataDir?: string;
  internalSecret?: string;
}): RunnerHandle {
  const {
    runnerId,
    port,
    serverUrl,
    advertiseHost = '127.0.0.1',
    maxSandboxes = 50,
    internalSecret,
  } = opts;

  const bridgeEntry = join(process.cwd(), 'packages/bridge/dist/index.js');
  const runnerEntry = join(process.cwd(), 'packages/runner/dist/index.js');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ASH_RUNNER_ID: runnerId,
    ASH_RUNNER_PORT: String(port),
    ASH_RUNNER_HOST: '127.0.0.1',
    ASH_SERVER_URL: serverUrl,
    ASH_RUNNER_ADVERTISE_HOST: advertiseHost,
    ASH_MAX_SANDBOXES: String(maxSandboxes),
    ASH_BRIDGE_ENTRY: bridgeEntry,
    ASH_DATA_DIR: opts.dataDir || `/tmp/ash-runner-${runnerId}`,
  };

  if (internalSecret) {
    env.ASH_INTERNAL_SECRET = internalSecret;
  }

  const child = spawn('node', [runnerEntry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd();
    if (line.includes('error') || line.includes('Error') || line.includes('registered') || line.includes('listening')) {
      console.error(`[runner:${runnerId}]`, line);
    }
  });

  child.stdout?.on('data', () => {}); // drain

  return {
    url: `http://127.0.0.1:${port}`,
    runnerId,
    stop: () => stopChild(child),
  };
}

/**
 * Wait for runner to be healthy (runner health endpoint).
 */
export async function waitForRunnerReady(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/runner/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Runner at ${url} did not become ready within ${timeoutMs}ms`);
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
