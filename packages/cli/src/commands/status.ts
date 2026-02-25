import { Command } from 'commander';
import { DEFAULT_PORT } from '@ash-ai/shared';
import { getContainerStatus, isImageStale } from '../docker.js';
import { getHealth } from '../client.js';
import { isDevMode } from '../index.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show Ash server status')
    .option('--port <port>', 'Server port to check health', String(DEFAULT_PORT))
    .action(async (opts: { port: string }) => {
      const status = getContainerStatus();

      console.log(`Container: ${status.status}`);
      if (status.containerId) {
        console.log(`  ID:    ${status.containerId}`);
      }
      if (status.image) {
        console.log(`  Image: ${status.image}`);
      }

      if (status.running) {
        try {
          const health = await getHealth();
          const h = health as Record<string, unknown>;
          console.log(`  Active sessions:  ${h.activeSessions ?? 'unknown'}`);
          console.log(`  Active sandboxes: ${h.activeSandboxes ?? 'unknown'}`);
          console.log(`  Uptime:           ${h.uptime ?? 'unknown'}s`);
        } catch {
          console.log('  Health check failed (server may still be starting)');
        }

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
      }
    });
}
