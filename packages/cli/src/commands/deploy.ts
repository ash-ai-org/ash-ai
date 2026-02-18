import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, cpSync } from 'node:fs';
import { ASH_AGENTS_SUBDIR } from '@ash-ai/shared';
import { deployAgent } from '../client.js';
import { ashAgentsDir, ensureDataDir } from '../docker.js';

export function deployCommand(): Command {
  return new Command('deploy')
    .description('Deploy an agent to the server')
    .argument('<path>', 'Path to agent directory')
    .option('-n, --name <name>', 'Agent name (defaults to directory name)')
    .action(async (agentPath: string, opts: { name?: string }) => {
      const absPath = resolve(agentPath);
      const name = opts.name || absPath.split('/').pop()!;

      // If the path exists locally, copy to ~/.ash/agents/ and use relative path
      // This enables Docker mode where ~/.ash is volume-mounted into the container
      if (existsSync(join(absPath, 'CLAUDE.md'))) {
        ensureDataDir();
        const destDir = join(ashAgentsDir(), name);
        cpSync(absPath, destDir, { recursive: true });
        console.log(`Copied agent files to ${destDir}`);

        const relativePath = `${ASH_AGENTS_SUBDIR}/${name}`;
        try {
          const agent = await deployAgent(name, relativePath);
          console.log(`Deployed agent: ${JSON.stringify(agent, null, 2)}`);
        } catch (err: unknown) {
          console.error(`Deploy failed: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }
        return;
      }

      // Path doesn't exist locally — assume it's a server-side path (backward compatible)
      try {
        const agent = await deployAgent(name, absPath);
        console.log(`Deployed agent: ${JSON.stringify(agent, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Deploy failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
