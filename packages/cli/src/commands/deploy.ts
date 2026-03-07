import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, cpSync } from 'node:fs';
import { ASH_AGENTS_SUBDIR } from '@ash-ai/shared';
import { deployAgent } from '../client.js';
import { ashAgentsDir, ensureDataDir } from '../docker.js';

/** Parse repeated -e KEY=VALUE options into a Record. */
function parseEnvOpts(envPairs?: string[]): Record<string, string> | undefined {
  if (!envPairs || envPairs.length === 0) return undefined;
  const env: Record<string, string> = {};
  for (const pair of envPairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      console.error(`Invalid env format: "${pair}" — expected KEY=VALUE`);
      process.exit(1);
    }
    env[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return env;
}

export function deployCommand(): Command {
  return new Command('deploy')
    .description('Deploy an agent to the server')
    .argument('<path>', 'Path to agent directory')
    .option('-n, --name <name>', 'Agent name (defaults to directory name)')
    .option('-e, --env <KEY=VALUE>', 'Default env var for sessions (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc; }, [])
    .action(async (agentPath: string, opts: { name?: string; env?: string[] }) => {
      const absPath = resolve(agentPath);
      const name = opts.name || absPath.split('/').pop()!;
      const env = parseEnvOpts(opts.env);

      // If the path exists locally, copy to ~/.ash/agents/ and use relative path
      // This enables Docker mode where ~/.ash is volume-mounted into the container
      if (existsSync(join(absPath, 'CLAUDE.md'))) {
        ensureDataDir();
        const destDir = join(ashAgentsDir(), name);
        cpSync(absPath, destDir, { recursive: true });
        console.log(`Copied agent files to ${destDir}`);

        const relativePath = `${ASH_AGENTS_SUBDIR}/${name}`;
        try {
          const agent = await deployAgent(name, relativePath, env);
          console.log(`Deployed agent: ${JSON.stringify(agent, null, 2)}`);
        } catch (err: unknown) {
          console.error(`Deploy failed: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }
        return;
      }

      // Path doesn't exist locally — assume it's a server-side path (backward compatible)
      try {
        const agent = await deployAgent(name, absPath, env);
        console.log(`Deployed agent: ${JSON.stringify(agent, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Deploy failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
