import { Command } from 'commander';
import { getContainerStatus, showLogs } from '../docker.js';

export function logsCommand(): Command {
  return new Command('logs')
    .description('Show Ash server logs')
    .option('-f, --follow', 'Follow log output')
    .action(async (opts: { follow?: boolean }) => {
      const status = getContainerStatus();

      if (status.status === 'not-found') {
        console.error('No Ash server container found. Start one with: ash start');
        process.exit(1);
      }

      showLogs(opts.follow || false);
    });
}
