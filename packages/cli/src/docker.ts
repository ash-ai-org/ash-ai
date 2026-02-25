import { execSync, execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  ASH_CONTAINER_NAME,
  ASH_DOCKER_IMAGE,
  ASH_AGENTS_SUBDIR,
  ASH_HEALTH_POLL_INTERVAL_MS,
  ASH_HEALTH_POLL_TIMEOUT_MS,
  DEFAULT_PORT,
} from '@ash-ai/shared';

// Derive Docker tag from CLI package version — stays in sync automatically on release
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const ASH_DOCKER_TAG = pkg.version as string;

export function ashDataDir(): string {
  return join(homedir(), '.ash');
}

export function ashAgentsDir(): string {
  return join(ashDataDir(), ASH_AGENTS_SUBDIR);
}

export function ensureDataDir(): void {
  mkdirSync(ashAgentsDir(), { recursive: true });
}

export function isDockerInstalled(): boolean {
  try {
    execFileSync('docker', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function isDockerRunning(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export interface ContainerStatus {
  running: boolean;
  status: string;
  containerId: string | null;
  image: string | null;
}

export function getContainerStatus(): ContainerStatus {
  try {
    const out = execFileSync('docker', [
      'inspect',
      '--format',
      '{{.Id}}\t{{.State.Status}}\t{{.Config.Image}}',
      ASH_CONTAINER_NAME,
    ], { stdio: 'pipe', encoding: 'utf-8' }).trim();

    const [containerId, status, image] = out.split('\t');
    return {
      running: status === 'running',
      status,
      containerId: containerId?.slice(0, 12) || null,
      image: image || null,
    };
  } catch {
    return { running: false, status: 'not-found', containerId: null, image: null };
  }
}

export function pullImage(tag?: string): void {
  const fullImage = `${ASH_DOCKER_IMAGE}:${tag || ASH_DOCKER_TAG}`;
  console.log(`Pulling ${fullImage}...`);
  execSync(`docker pull ${fullImage}`, { stdio: 'inherit' });
}

export interface StartContainerOptions {
  port?: number;
  tag?: string;
  image?: string;
  envPassthrough?: string[];
}

export function startContainer(opts: StartContainerOptions = {}): void {
  const port = opts.port || DEFAULT_PORT;
  const fullImage = opts.image || `${ASH_DOCKER_IMAGE}:${opts.tag || ASH_DOCKER_TAG}`;
  const dataDir = ashDataDir();

  const args = [
    'run', '-d',
    '--name', ASH_CONTAINER_NAME,
    '--init',
    '--privileged',
    '-p', `${port}:4100`,
    '-v', `${dataDir}:/data`,
  ];

  // Pass through ANTHROPIC_API_KEY if set
  if (process.env.ANTHROPIC_API_KEY) {
    args.push('-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
  }

  // Pass through any additional env vars
  if (opts.envPassthrough) {
    for (const key of opts.envPassthrough) {
      const val = process.env[key];
      if (val) {
        args.push('-e', `${key}=${val}`);
      }
    }
  }

  args.push(fullImage);

  execFileSync('docker', args, { stdio: 'pipe' });
}

export function removeStoppedContainer(): boolean {
  try {
    execFileSync('docker', ['rm', ASH_CONTAINER_NAME], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function stopContainer(): void {
  execFileSync('docker', ['stop', ASH_CONTAINER_NAME], { stdio: 'pipe' });
  execFileSync('docker', ['rm', ASH_CONTAINER_NAME], { stdio: 'pipe' });
}

export function showLogs(follow: boolean): void {
  const args = ['logs'];
  if (follow) args.push('-f');
  args.push(ASH_CONTAINER_NAME);

  const child = spawn('docker', args, { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error(`Failed to get logs: ${err.message}`);
    process.exit(1);
  });
  // For non-follow mode, wait for completion
  if (!follow) {
    child.on('exit', (code) => {
      if (code !== 0) process.exit(code || 1);
    });
  }
}

export async function waitForHealthy(port: number, timeout?: number): Promise<boolean> {
  const deadline = Date.now() + (timeout || ASH_HEALTH_POLL_TIMEOUT_MS);
  const url = `http://localhost:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, ASH_HEALTH_POLL_INTERVAL_MS));
  }
  return false;
}
