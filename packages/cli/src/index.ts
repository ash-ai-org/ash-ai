#!/usr/bin/env node

import { Command } from 'commander';
import { deployCommand } from './commands/deploy.js';
import { sessionCommand } from './commands/session.js';
import { agentCommand } from './commands/agent.js';
import { healthCommand } from './commands/health.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';

const program = new Command()
  .name('ash')
  .description('Agent orchestration CLI')
  .version('0.1.0');

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(deployCommand());
program.addCommand(sessionCommand());
program.addCommand(agentCommand());
program.addCommand(healthCommand());

program.parse();
