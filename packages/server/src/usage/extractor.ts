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
 * Claude SDK messages include a `usage` field on 'result' type messages:
 * ```json
 * { "type": "result", "usage": { "input_tokens": 100, "output_tokens": 50 } }
 * ```
 *
 * This function is non-blocking — it fires and forgets the DB writes.
 */
export function recordUsageFromMessage(
  data: Record<string, any>,
  sessionId: string,
  agentName: string,
  tenantId: string,
): void {
  const usage = data.usage as UsageData | undefined;
  if (!usage) return;

  const events: Array<{ id: string; tenantId: string; sessionId: string; agentName: string; eventType: UsageEventType; value: number }> = [];

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

  // Count tool calls from content blocks
  if (Array.isArray(data.content)) {
    const toolCallCount = data.content.filter((b: any) => b.type === 'tool_use').length;
    if (toolCallCount > 0) {
      events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'tool_call', value: toolCallCount });
    }
  }

  // Record message event
  if (data.type === 'result' || data.type === 'assistant') {
    events.push({ id: randomUUID(), tenantId, sessionId, agentName, eventType: 'message', value: 1 });
  }

  if (events.length > 0) {
    insertUsageEvents(events).catch((err) =>
      console.error(`[usage] Failed to record usage events: ${err}`)
    );
  }
}
