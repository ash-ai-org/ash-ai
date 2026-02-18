import { Command } from 'commander';
import { getContainerStatus, stopContainer } from '../docker.js';

export function stopCommand(): Command {
  return new Command('stop')
    .description('Stop the Ash server container')
    .action(async () => {
      const status = getContainerStatus();

      if (status.status === 'not-found') {
        console.log('No Ash server container found.');
        return;
      }

      console.log('Stopping Ash server...');
      try {
        stopContainer();
        console.log('Ash server stopped.');
      } catch (err: unknown) {
        console.error(`Failed to stop: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
