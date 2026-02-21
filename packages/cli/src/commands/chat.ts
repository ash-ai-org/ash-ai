import { Command } from 'commander';
import { createSession, sendMessage, endSession } from '../client.js';

export function chatCommand(): Command {
  return new Command('chat')
    .description('Send a message to an agent (creates session, streams response, ends session)')
    .argument('<agent>', 'Agent name')
    .argument('<message>', 'Message content')
    .option('-k, --keep', 'Keep session alive after response (prints session ID)')
    .action(async (agent: string, message: string, opts: { keep?: boolean }) => {
      let sessionId: string | undefined;
      try {
        const session = await createSession(agent) as { id: string };
        sessionId = session.id;

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
                // Extract text content from assistant messages
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

        // Ensure output ends with a newline
        process.stdout.write('\n');

        if (opts.keep) {
          console.error(`Session: ${sessionId}`);
        } else {
          await endSession(sessionId);
        }
      } catch (err: unknown) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        if (sessionId && !opts.keep) {
          try { await endSession(sessionId); } catch { /* best effort */ }
        }
        process.exit(1);
      }
    });
}
