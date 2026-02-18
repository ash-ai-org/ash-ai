import { Command } from 'commander';
import { getHealth } from '../client.js';

export function healthCommand(): Command {
  return new Command('health')
    .description('Check server health')
    .action(async () => {
      try {
        const health = await getHealth();
        console.log(JSON.stringify(health, null, 2));
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
