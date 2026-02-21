import { Command } from 'commander';
import { createSession, sendMessage, endSession } from '../client.js';

export function chatCommand(): Command {
  return new Command('chat')
    .description('Send a message to an agent (keeps session alive for follow-ups)')
    .argument('<agent>', 'Agent name')
    .argument('<message>', 'Message content')
    .option('-s, --session-id <id>', 'Continue an existing session instead of creating a new one')
    .option('--end', 'End the session after the response')
    .action(async (agent: string, message: string, opts: { sessionId?: string; end?: boolean }) => {
      let sessionId: string;
      let isNewSession = false;

      try {
        if (opts.sessionId) {
          sessionId = opts.sessionId;
        } else {
          const session = await createSession(agent) as { id: string };
          sessionId = session.id;
          isNewSession = true;
        }

        const stream = await sendMessage(sessionId, message);
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
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
                  for (const block of parsed.message.content) {
                    if (block.type === 'text') {
                      process.stdout.write(block.text);
                    }
                  }
                }
              } catch {
                // non-JSON data, skip
              }
            }
          }
        }

        process.stdout.write('\n');

        if (opts.end) {
          await endSession(sessionId);
        } else {
          console.error(`Session: ${sessionId}`);
        }
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        if (isNewSession && opts.end) {
          try { await endSession(sessionId!); } catch { /* best effort */ }
        }
        process.exit(1);
      }
    });
}
