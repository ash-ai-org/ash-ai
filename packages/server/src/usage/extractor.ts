import { randomUUID } from 'node:crypto';
import type { UsageEventType } from '@ash-ai/shared';
import { insertUsageEvents } from '../db/index.js';

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Extract usage metrics from an SDK message and persist as usage events.
 *
 * Claude SDK 'result' messages include a `usage` field:
 * ```json
 * { "type": "result", "usage": { "input_tokens": 100, "output_tokens": 50 } }
 * ```
 *
 * Assistant messages have content blocks at `data.message.content`:
 * ```json
 * { "type": "assistant", "message": { "content": [{ "type": "tool_use", ... }] } }
 * ```
 *
 * This function is non-blocking — it fires and forgets the DB writes.
 * Only call once per turn (on 'result' messages) to avoid double-counting.
 */
export function recordUsageFromMessage(
  data: Record<string, any>,
  sessionId: string,
  agentName: string,
  tenantId: string,
): void {
  const usage = data.usage as UsageData | undefined;

  const events: Array<{ id: string; tenantId: string; sessionId: string; agentName: string; eventType: UsageEventType; value: number }> = [];

  if (usage) {
    if (usage.input_tokens && usage.input_tokens > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'input_tokens', value: usage.input_tokens });
    }
    if (usage.output_tokens && usage.output_tokens > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'output_tokens', value: usage.output_tokens });
    }
    if (usage.cache_creation_input_tokens && usage.cache_creation_input_tokens > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'cache_creation_tokens', value: usage.cache_creation_input_tokens });
    }
    if (usage.cache_read_input_tokens && usage.cache_read_input_tokens > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'cache_read_tokens', value: usage.cache_read_input_tokens });
    }
  }

  // Count tool calls from content blocks — SDK uses data.message.content for assistant messages
  const contentBlocks = data.message?.content ?? data.content;
  if (Array.isArray(contentBlocks)) {
    const toolCallCount = contentBlocks.filter((b: any) => b.type === 'tool_use').length;
    if (toolCallCount > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'tool_call', value: toolCallCount });
    }
  }

  // Record a single message event per turn
  events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'message', value: 1 });

  insertUsageEvents(events).catch((err) =>
    console.error(`[usage] Failed to record usage events: ${err}`)
  );
}
