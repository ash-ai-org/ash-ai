import { Command } from 'commander';
import { createSession, sendMessage, listSessions, endSession, pauseSession, resumeSession } from '../client.js';

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
    .action(async (id: string, message: string) => {
      try {
        const stream = await sendMessage(id, message);
        if (!stream) { console.log('No response'); return; }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.slice(7);
              process.stdout.write(`[${eventType}] `);
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                // SDK messages have a type field — print it
                if (parsed.type) {
                  console.log(`${parsed.type}: ${JSON.stringify(parsed).slice(0, 200)}`);
                } else {
                  console.log(data);
                }
              } catch {
                console.log(data);
              }
            }
          }
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

  return cmd;
}
