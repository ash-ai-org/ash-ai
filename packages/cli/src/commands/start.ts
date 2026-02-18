import { Command } from 'commander';
import { DEFAULT_PORT } from '@ash-ai/shared';
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
} from '../docker.js';

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
    .option('-e, --env <KEY=VALUE>', 'Extra env vars to pass to the container', collectEnv, [])
    .action(async (opts: { port: string; tag?: string; image?: string; pull: boolean; databaseUrl?: string; env: string[] }) => {
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

      console.log(`Ash server is running.`);
      console.log(`  URL:      http://localhost:${port}`);
      if (opts.databaseUrl) {
        console.log(`  Database: ${opts.databaseUrl}`);
      }
      console.log(`  Data dir: ${ashDataDir()}`);
    });
}
