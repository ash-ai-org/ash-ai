import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { DEFAULT_PORT } from '@ash-ai/shared';
import {
  getContainerStatus,
  stopContainer,
  removeStoppedContainer,
  startContainer,
  waitForHealthy,
  ensureDataDir,
  findRepoRoot,
} from '../docker.js';

export function rebuildCommand(): Command {
  return new Command('rebuild')
    .description('Rebuild the local Docker image and restart the server')
    .option('--port <port>', 'Host port to expose', String(DEFAULT_PORT))
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10);

      const repoRoot = findRepoRoot();
      if (!repoRoot) {
        console.error('Cannot find ash repo root. Run from the ash repo or set ASH_REPO_ROOT.');
        process.exit(1);
      }

      // Build image
      console.log('Building local Docker image (ash-dev)...');
      try {
        execSync('docker build -t ash-dev .', { cwd: repoRoot, stdio: 'inherit' });
      } catch {
        console.error('Docker build failed.');
        process.exit(1);
      }

      // Stop existing container if running
      const status = getContainerStatus();
      if (status.running) {
        console.log('Stopping existing container...');
        try {
          stopContainer();
        } catch {
          console.error('Failed to stop existing container.');
          process.exit(1);
        }
      } else if (status.status !== 'not-found') {
        removeStoppedContainer();
      }

      // Start fresh container
      ensureDataDir();
      console.log('Starting Ash server with new image...');
      try {
        startContainer({ port, image: 'ash-dev', envPassthrough: [] });
      } catch (err: unknown) {
        console.error(`Failed to start container: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      console.log('Waiting for server to be ready...');
      const healthy = await waitForHealthy(port);
      if (!healthy) {
        console.error('Server failed to become healthy within 30 seconds.');
        console.error('Check logs with: ash-dev logs');
        process.exit(1);
      }

      console.log('Ash server rebuilt and running.');
      console.log(`  URL: http://localhost:${port}`);
    });
}
