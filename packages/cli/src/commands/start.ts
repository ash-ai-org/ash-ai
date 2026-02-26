import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { DEFAULT_PORT } from '@ash-ai/shared';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDockerInstalled,
  isDockerRunning,
  getContainerStatus,
  removeStoppedContainer,
  pullImage,
  startContainer,
  waitForHealthy,
  ensureDataDir,
  ashDataDir,
  isImageStale,
  findRepoRoot,
} from '../docker.js';
import { loadConfig, saveConfig } from '../config.js';
import { isDevMode } from '../index.js';
import { getCredentials } from './login.js';

function collectEnv(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function startCommand(): Command {
  return new Command('start')
    .description('Start the Ash server in a Docker container')
    .option('--port <port>', 'Host port to expose', String(DEFAULT_PORT))
    .option('--tag <tag>', 'Docker image tag')
    .option('--image <image>', 'Full Docker image name (overrides default + tag)')
    .option('--no-pull', 'Skip pulling the image (use local build)')
    .option('--database-url <url>', 'PostgreSQL/CockroachDB connection URL')
    .option('--api-key <key>', 'Ash Cloud API key (or set ASH_API_KEY, or use `ash login`)')
    .option('--cloud-url <url>', 'Ash Cloud URL (default: https://ash-cloud.ai)')
    .option('-e, --env <KEY=VALUE>', 'Extra env vars to pass to the container', collectEnv, [])
    .action(async (opts: { port: string; tag?: string; image?: string; pull: boolean; databaseUrl?: string; apiKey?: string; cloudUrl?: string; env: string[] }) => {
      const port = parseInt(opts.port, 10);

      // Check Docker is available
      if (!isDockerInstalled()) {
        console.error('Docker is not installed. Install it from https://docs.docker.com/get-docker/');
        process.exit(1);
      }

      if (!isDockerRunning()) {
        console.error('Docker daemon is not running. Start Docker Desktop or the Docker service.');
        process.exit(1);
      }

      // Check if already running
      const status = getContainerStatus();
      if (status.running) {
        console.log(`Ash server is already running (container: ${status.containerId}, image: ${status.image})`);
        console.log(`  URL: http://localhost:${port}`);

        // In dev mode, check if image is stale
        if (isDevMode) {
          const check = isImageStale();
          if (check.stale) {
            console.log('');
            console.log(`  WARNING: Local source is newer than running image`);
            console.log(`    Image built: ${check.imageAge}`);
            console.log(`    Source changed: ${check.sourceAge}`);
            console.log(`    Run "ash-dev rebuild" to update.`);
          }
        }
        return;
      }

      // Remove stale stopped container
      if (status.status !== 'not-found') {
        console.log('Removing stale container...');
        removeStoppedContainer();
      }

      // Ensure data directory exists
      ensureDataDir();

      // Build envPassthrough list from --database-url and --env flags
      const envPassthrough: string[] = [];

      if (opts.databaseUrl) {
        process.env.ASH_DATABASE_URL = opts.databaseUrl;
        envPassthrough.push('ASH_DATABASE_URL');
      }

      for (const entry of opts.env) {
        const eqIdx = entry.indexOf('=');
        if (eqIdx === -1) {
          console.error(`Invalid --env value "${entry}": must be KEY=VALUE`);
          process.exit(1);
        }
        const key = entry.slice(0, eqIdx);
        const val = entry.slice(eqIdx + 1);
        process.env[key] = val;
        envPassthrough.push(key);
      }

      // Cloud telemetry: flag > env var > ~/.ash/credentials.json
      const credentials = getCredentials();
      const apiKey = opts.apiKey || process.env.ASH_API_KEY || credentials?.api_key;
      const cloudUrl = opts.cloudUrl || process.env.ASH_CLOUD_URL || credentials?.cloud_url;

      if (apiKey) {
        process.env.ASH_API_KEY = apiKey;
        envPassthrough.push('ASH_API_KEY');
        if (cloudUrl) {
          process.env.ASH_CLOUD_URL = cloudUrl;
          envPassthrough.push('ASH_CLOUD_URL');
        }
      }

      // Dev mode: build local Docker image and use it
      if (isDevMode && !opts.image) {
        const repoRoot = findRepoRoot();
        if (!repoRoot) {
          console.error('Cannot find ash repo root. Run from the ash repo or set ASH_REPO_ROOT.');
          process.exit(1);
        }
        console.log('Dev mode: building local Docker image (ash-dev)...');
        try {
          execSync('docker build -t ash-dev .', { cwd: repoRoot, stdio: 'inherit' });
        } catch {
          console.error('Docker build failed.');
          process.exit(1);
        }
        opts.image = 'ash-dev';
        opts.pull = false;
      }

      // Pull image (skip if using a local image via --image or --no-pull)
      if (opts.pull && !opts.image) {
        try {
          pullImage(opts.tag);
        } catch {
          console.error('Failed to pull image. Use --no-pull to use a local image.');
          process.exit(1);
        }
      }

      // Start container
      const imageToUse = opts.image;
      console.log(`Starting Ash server${imageToUse ? ` (image: ${imageToUse})` : ''}...`);
      try {
        startContainer({ port, tag: opts.tag, image: imageToUse, envPassthrough });
      } catch (err: unknown) {
        console.error(`Failed to start container: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      // Wait for healthy
      console.log('Waiting for server to be ready...');
      const healthy = await waitForHealthy(port);
      if (!healthy) {
        console.error('Server failed to become healthy within 30 seconds.');
        console.error('Check logs with: ash logs');
        process.exit(1);
      }

      // Check for auto-generated API key bootstrap file
      const bootstrapPath = join(ashDataDir(), 'initial-api-key');
      if (existsSync(bootstrapPath)) {
        const generatedKey = readFileSync(bootstrapPath, 'utf-8').trim();
        if (generatedKey) {
          const config = loadConfig();
          config.api_key = generatedKey;
          saveConfig(config);
          unlinkSync(bootstrapPath);

          console.log('');
          console.log('API key auto-generated and saved to ~/.ash/config.json');
          console.log(`  Key: ${generatedKey}`);
          console.log('');
        }
      }

      console.log(`Ash server is running.`);
      console.log(`  URL:      http://localhost:${port}`);
      if (opts.databaseUrl) {
        console.log(`  Database: ${opts.databaseUrl}`);
      }
      if (apiKey) {
        console.log(`  Cloud:    ${cloudUrl || 'https://ash-cloud.ai'}`);
      }
      console.log(`  Data dir: ${ashDataDir()}`);
    });
}
