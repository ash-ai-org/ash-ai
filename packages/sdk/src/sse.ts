import type { AshStreamEvent } from '@ash-ai/shared';

/**
 * Parse an SSE stream (ReadableStream<Uint8Array>) into typed AshStreamEvent objects.
 * Works in both Node.js and browser environments.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AshStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          try {
            yield { type: currentEvent, data: JSON.parse(raw) } as AshStreamEvent;
          } catch {
            // Non-JSON data — skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
