#!/usr/bin/env node

import { basename } from 'node:path';
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

export const isDevMode = basename(process.argv[1] ?? '').startsWith('ash-dev');

const program = new Command()
  .name(isDevMode ? 'ash-dev' : 'ash')
  .description(isDevMode ? 'Agent orchestration CLI (dev mode — uses local Docker build)' : 'Agent orchestration CLI')
  .version('0.1.0');

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(chatCommand());
program.addCommand(deployCommand());
program.addCommand(sessionCommand());
program.addCommand(agentCommand());
program.addCommand(healthCommand());

program.parse();
