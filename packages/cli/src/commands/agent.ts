import { Command } from 'commander';
import { listAgents, getAgentInfo, deleteAgent } from '../client.js';

export function agentCommand(): Command {
  const cmd = new Command('agent').description('Manage agents');

  cmd
    .command('list')
    .description('List deployed agents')
    .action(async () => {
      try {
        const agents = await listAgents();
        console.log(JSON.stringify(agents, null, 2));
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('info')
    .description('Get agent details')
    .argument('<name>', 'Agent name')
    .action(async (name: string) => {
      try {
        const agent = await getAgentInfo(name);
        console.log(JSON.stringify(agent, null, 2));
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('delete')
    .description('Delete an agent')
    .argument('<name>', 'Agent name')
    .action(async (name: string) => {
      try {
        await deleteAgent(name);
        console.log(`Deleted agent: ${name}`);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  return cmd;
}
