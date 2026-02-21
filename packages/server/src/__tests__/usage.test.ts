import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { initDb, closeDb, insertUsageEvent, insertUsageEvents, listUsageEvents, getUsageStats } from '../db/index.js';

const tenant = 'usage-test';
let n = 0;
const uid = () => `u-${Date.now()}-${++n}`;

describe('usage tracking', () => {
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ash-usage-'));
    await initDb({ dataDir: dir });
  });

  afterEach(async () => {
    await closeDb();
  });

  it('inserts and retrieves a usage event', async () => {
    const id = uid();
    const event = await insertUsageEvent(id, tenant, 'sess-1', 'my-agent', 'input_tokens', 100);
    expect(event.id).toBe(id);
    expect(event.eventType).toBe('input_tokens');
    expect(event.value).toBe(100);
  });

  it('batch inserts usage events', async () => {
    await insertUsageEvents([
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent-a', eventType: 'input_tokens', value: 50 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent-a', eventType: 'output_tokens', value: 30 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent-a', eventType: 'tool_call', value: 2 },
    ]);

    const events = await listUsageEvents(tenant, { sessionId: 'sess-1' });
    expect(events.length).toBe(3);
  });

  it('filters events by session and agent', async () => {
    await insertUsageEvents([
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent-a', eventType: 'input_tokens', value: 10 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-2', agentName: 'agent-b', eventType: 'input_tokens', value: 20 },
    ]);

    const bySess = await listUsageEvents(tenant, { sessionId: 'sess-1' });
    expect(bySess.length).toBe(1);

    const byAgent = await listUsageEvents(tenant, { agentName: 'agent-b' });
    expect(byAgent.length).toBe(1);
  });

  it('computes usage stats across events', async () => {
    await insertUsageEvents([
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'input_tokens', value: 100 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'input_tokens', value: 200 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'output_tokens', value: 50 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'tool_call', value: 3 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'message', value: 1 },
    ]);

    const stats = await getUsageStats(tenant);
    expect(stats.totalInputTokens).toBe(300);
    expect(stats.totalOutputTokens).toBe(50);
    expect(stats.totalToolCalls).toBe(3);
    expect(stats.totalMessages).toBe(1);
    expect(stats.totalCacheCreationTokens).toBe(0);
    expect(stats.totalCacheReadTokens).toBe(0);
  });

  it('stats filter by session', async () => {
    await insertUsageEvents([
      { id: uid(), tenantId: tenant, sessionId: 'sess-1', agentName: 'agent', eventType: 'input_tokens', value: 100 },
      { id: uid(), tenantId: tenant, sessionId: 'sess-2', agentName: 'agent', eventType: 'input_tokens', value: 200 },
    ]);

    const stats = await getUsageStats(tenant, { sessionId: 'sess-1' });
    expect(stats.totalInputTokens).toBe(100);
  });

  it('empty stats return zeroes', async () => {
    const stats = await getUsageStats(tenant);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
    expect(stats.totalToolCalls).toBe(0);
  });
});
