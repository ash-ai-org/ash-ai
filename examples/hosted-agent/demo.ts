#!/usr/bin/env npx tsx
/**
 * Interactive demo of the Research Assistant hosted agent.
 *
 * Prerequisites:
 *   1. Ash server running: pnpm --filter '@ash-ai/server' dev
 *   2. Set ASH_REAL_SDK=1 for real Claude responses (or omit for mock)
 *
 * Run:
 *   npx tsx demo.ts
 */

import { ResearchBot } from './bot.js';
import * as readline from 'node:readline';

const SERVER_URL = process.env.ASH_SERVER_URL || 'http://localhost:4100';

async function main() {
  const bot = new ResearchBot(SERVER_URL);

  console.log('Deploying research-assistant agent...');
  const session = await bot.setup();
  console.log(`Session created: ${session.id}\n`);

  console.log('Skills available:');
  console.log('  /search-and-summarize <topic>  — Web research with sources');
  console.log('  /analyze-code <file or paste>   — Code quality analysis');
  console.log('  /write-memo <topic>             — Structured memo/report');
  console.log('\nMCP servers:');
  console.log('  fetch  — Retrieve and read web pages');
  console.log('  memory — Persistent knowledge graph across conversations');
  console.log('\nType "quit" to exit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () =>
    new Promise<string>((resolve) => {
      rl.question('You: ', (answer) => resolve(answer));
    });

  while (true) {
    const input = await prompt();
    if (!input.trim()) continue;
    if (input.trim().toLowerCase() === 'quit') break;

    process.stdout.write('\nAssistant: ');
    const response = await bot.askStreaming(input, (token) => {
      process.stdout.write(token);
    });
    if (!response) process.stdout.write('[no response]');
    process.stdout.write('\n\n');
  }

  console.log('\nCleaning up...');
  await bot.teardown();
  rl.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
