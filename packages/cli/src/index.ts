#!/usr/bin/env node

import { basename, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { deployCommand } from './commands/deploy.js';
import { sessionCommand } from './commands/session.js';
import { agentCommand } from './commands/agent.js';
import { healthCommand } from './commands/health.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { chatCommand } from './commands/chat.js';
import { loginCommand, logoutCommand } from './commands/login.js';
import { linkCommand, unlinkCommand } from './commands/link.js';
import { rebuildCommand } from './commands/rebuild.js';

// Detect dev mode: flag from dev.ts entry point, argv[1], or ASH_DEV env var
export const isDevMode =
  !!(globalThis as Record<string, unknown>).__ASH_DEV_MODE__ ||
  basename(process.argv[1] ?? '').startsWith('ash-dev') ||
  !!process.env.ASH_DEV;

const program = new Command()
  .name(isDevMode ? 'ash-dev' : 'ash')
  .description(isDevMode ? 'Agent orchestration CLI (dev mode — uses local Docker build)' : 'Agent orchestration CLI')
  .version(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')).version);

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(chatCommand());
program.addCommand(deployCommand());
program.addCommand(sessionCommand());
program.addCommand(agentCommand());
program.addCommand(healthCommand());
program.addCommand(linkCommand());
program.addCommand(unlinkCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());

if (isDevMode) {
  program.addCommand(rebuildCommand());
}

program.parse();
