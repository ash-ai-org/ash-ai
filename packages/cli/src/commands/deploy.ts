import { Command } from 'commander';
import { resolve, join, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { parse as parseDotEnv } from 'dotenv';
import { deployAgentWithFiles } from '../client.js';

function printDeploySuccess(agent: { name: string; version: number; env?: Record<string, string> }) {
  console.log(`Deployed agent "${agent.name}" (v${agent.version})`);
  if (agent.env && Object.keys(agent.env).length > 0) {
    console.log(`  env: ${Object.keys(agent.env).join(', ')}`);
  }
}

const SKIP_NAMES = new Set([
  'node_modules', '.git', '__pycache__', '.cache', '.npm',
  '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp',
  '.DS_Store',
]);

const SKIP_EXTENSIONS = new Set(['.sock', '.lock', '.pid']);

/** Recursively collect files from a directory, base64-encoded. */
function collectFiles(dir: string, root: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_NAMES.has(name)) continue;
    if (name.endsWith('.env') || name.endsWith('.env.local')) continue;
    const ext = name.slice(name.lastIndexOf('.'));
    if (SKIP_EXTENSIONS.has(ext)) continue;
    const fullPath = join(dir, name);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      files.push(...collectFiles(fullPath, root));
    } else if (st.isFile()) {
      files.push({
        path: relative(root, fullPath),
        content: readFileSync(fullPath).toString('base64'),
      });
    }
  }
  return files;
}

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
      const rawName = opts.name || absPath.split('/').pop()!;
      // Normalize: replace spaces/invalid chars with hyphens, collapse runs, trim edges
      const name = rawName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!name) {
        console.error(`Invalid agent name: "${rawName}"`);
        process.exit(1);
      }
      if (name !== rawName) {
        console.log(`Normalized agent name: "${rawName}" → "${name}"`);
      }
      const flagEnv = parseEnvOpts(opts.env);

      // Read env files from agent folder: .env.local > .env (local wins)
      const envLocal = join(absPath, '.env.local');
      const envBase = join(absPath, '.env');
      let fileEnv: Record<string, string> = {};
      let envSource: string | null = null;
      if (existsSync(envBase)) {
        fileEnv = parseDotEnv(readFileSync(envBase, 'utf-8'));
        envSource = '.env';
      }
      if (existsSync(envLocal)) {
        const localEnv = parseDotEnv(readFileSync(envLocal, 'utf-8'));
        fileEnv = { ...fileEnv, ...localEnv };
        envSource = envSource ? '.env + .env.local' : '.env.local';
      }
      let env: Record<string, string> | undefined;
      if (Object.keys(fileEnv).length > 0) {
        // -e flags override file values
        env = { ...fileEnv, ...flagEnv };
        console.log(`Loaded ${Object.keys(fileEnv).length} env var(s) from ${envSource}`);
      } else {
        env = flagEnv;
      }

      if (!existsSync(join(absPath, 'CLAUDE.md'))) {
        console.error(`Agent directory must contain CLAUDE.md: ${absPath}`);
        process.exit(1);
      }

      // Upload agent files to the server
      const files = collectFiles(absPath, absPath);
      console.log(`Uploading ${files.length} file(s)...`);
      try {
        const agent = await deployAgentWithFiles(name, files, env) as { name: string; version: number; env?: Record<string, string> };
        printDeploySuccess(agent);
      } catch (err: unknown) {
        console.error(`Deploy failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
