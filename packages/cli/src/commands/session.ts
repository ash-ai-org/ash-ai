import { Command } from 'commander';
import { createSession, sendMessage, listSessions, endSession, pauseSession, resumeSession, getSessionEvents, getSessionFiles, getSessionFile, execInSession } from '../client.js';

// Color helpers for terminal output
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const eventColors: Record<string, (s: string) => string> = {
  message: green,
  tool_start: cyan,
  tool_end: cyan,
  lifecycle: yellow,
  error: red,
  reasoning: magenta,
};

function printEvent(event: { sequence: number; type: string; data: string; createdAt: string }) {
  const colorFn = eventColors[event.type] || dim;
  const ts = new Date(event.createdAt).toLocaleTimeString();
  const tag = colorFn(`[${event.type}]`);
  let summary = '';
  try {
    const parsed = JSON.parse(event.data);
    if (event.type === 'message') {
      const role = parsed.role || parsed.messageType || '';
      const content = parsed.content || '';
      summary = `${role}${content ? ': ' + (typeof content === 'string' ? content.slice(0, 120) : JSON.stringify(content).slice(0, 120)) : ''}`;
    } else if (event.type === 'tool_start') {
      summary = `${parsed.name || ''}(${JSON.stringify(parsed.input || {}).slice(0, 80)})`;
    } else if (event.type === 'tool_end') {
      const out = JSON.stringify(parsed.output || parsed.result || '').slice(0, 80);
      summary = `${parsed.name || ''} → ${out}`;
    } else if (event.type === 'lifecycle') {
      summary = parsed.action || parsed.status || JSON.stringify(parsed).slice(0, 80);
    } else if (event.type === 'error') {
      summary = parsed.error || JSON.stringify(parsed).slice(0, 120);
    } else {
      summary = JSON.stringify(parsed).slice(0, 120);
    }
  } catch {
    summary = event.data.slice(0, 120);
  }
  console.log(`${dim(ts)} ${dim(`#${event.sequence}`)} ${tag} ${summary}`);
}

export function sessionCommand(): Command {
  const cmd = new Command('session').description('Manage sessions');

  cmd
    .command('create')
    .description('Create a new session')
    .argument('<agent>', 'Agent name')
    .action(async (agent: string) => {
      try {
        const session = await createSession(agent);
        console.log(`Session created: ${JSON.stringify(session, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('send')
    .description('Send a message to a session')
    .argument('<id>', 'Session ID')
    .argument('<message>', 'Message content')
    .option('--raw', 'Show raw SSE events instead of formatted text')
    .action(async (id: string, message: string, opts: { raw?: boolean }) => {
      try {
        const stream = await sendMessage(id, message);
        if (!stream) { console.log('No response'); return; }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
              if (opts.raw) {
                process.stdout.write(`[${currentEvent}] `);
              }
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (opts.raw) {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type) {
                    console.log(`${parsed.type}: ${JSON.stringify(parsed).slice(0, 200)}`);
                  } else {
                    console.log(data);
                  }
                } catch {
                  console.log(data);
                }
              } else {
                // Pretty output: stream text deltas, show tool use
                try {
                  const parsed = JSON.parse(data);
                  if (currentEvent === 'text_delta' && parsed.delta) {
                    process.stdout.write(parsed.delta);
                  } else if (currentEvent === 'tool_use') {
                    process.stdout.write(`\n${cyan(`[tool: ${parsed.name}]`)} `);
                  } else if (currentEvent === 'tool_result') {
                    process.stdout.write(dim(' done\n'));
                  }
                } catch {
                  // skip unparseable
                }
              }
            }
          }
        }

        if (!opts.raw) {
          process.stdout.write('\n');
        }
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List sessions')
    .action(async () => {
      try {
        const sessions = await listSessions();
        console.log(JSON.stringify(sessions, null, 2));
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('pause')
    .description('Pause a session (keeps sandbox alive for fast resume)')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const session = await pauseSession(id);
        console.log(`Session paused: ${JSON.stringify(session, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('resume')
    .description('Resume a paused or errored session')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const session = await resumeSession(id);
        console.log(`Session resumed: ${JSON.stringify(session, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('end')
    .description('End a session')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const session = await endSession(id);
        console.log(`Session ended: ${JSON.stringify(session, null, 2)}`);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('files')
    .description('List files or read a file from session workspace')
    .argument('<id>', 'Session ID')
    .argument('[path]', 'File path to read (omit to list all files)')
    .action(async (id: string, filePath?: string) => {
      try {
        if (filePath) {
          const content = await getSessionFile(id, filePath);
          process.stdout.write(content);
        } else {
          const { files, source } = await getSessionFiles(id);
          if (files.length === 0) {
            console.log(dim('No files in workspace'));
            return;
          }
          console.log(dim(`Source: ${source}\n`));
          // Table header
          const pathWidth = Math.max(4, ...files.map((f) => f.path.length));
          console.log(`${'PATH'.padEnd(pathWidth)}  ${'SIZE'.padStart(8)}  MODIFIED`);
          console.log(`${'─'.repeat(pathWidth)}  ${'─'.repeat(8)}  ${'─'.repeat(19)}`);
          for (const f of files) {
            const size = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
            const modified = new Date(f.modifiedAt).toLocaleString();
            console.log(`${f.path.padEnd(pathWidth)}  ${size.padStart(8)}  ${modified}`);
          }
          console.log(dim(`\n${files.length} file(s)`));
        }
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('exec')
    .description('Execute a command in the session sandbox')
    .argument('<id>', 'Session ID')
    .argument('<command>', 'Shell command to run')
    .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
    .action(async (id: string, command: string, opts: { timeout: string }) => {
      try {
        const result = await execInSession(id, command, parseInt(opts.timeout, 10));
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        process.exit(result.exitCode);
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command('tail')
    .description('Stream session events in real-time')
    .argument('<id>', 'Session ID')
    .option('-t, --type <type>', 'Filter by event type')
    .action(async (id: string, opts: { type?: string }) => {
      let lastSequence = 0;
      let running = true;

      process.on('SIGINT', () => { running = false; });

      console.log(`Tailing events for session ${id} (Ctrl+C to stop)...\n`);

      // Fetch existing events first
      try {
        const existing = await getSessionEvents(id, { type: opts.type, limit: 50 });
        for (const event of existing) {
          printEvent(event);
          if (event.sequence > lastSequence) lastSequence = event.sequence;
        }
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      // Poll for new events
      while (running) {
        try {
          const events = await getSessionEvents(id, { after: lastSequence, type: opts.type });
          for (const event of events) {
            printEvent(event);
            if (event.sequence > lastSequence) lastSequence = event.sequence;
          }
        } catch {
          // Server may be briefly unavailable, keep trying
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      console.log('\nStopped tailing.');
    });

  return cmd;
}
