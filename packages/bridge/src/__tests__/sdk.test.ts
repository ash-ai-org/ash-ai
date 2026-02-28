import { describe, it, expect } from 'vitest';
import { runQuery } from '../sdk.js';

describe('mock SDK wrapper', () => {
  it('yields assistant message then result for a query', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: 'hello',
      sessionId: 'test-session',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
    })) {
      events.push(msg);
    }

    expect(events.length).toBeGreaterThanOrEqual(2);

    // First event should be an assistant message
    const first = events[0] as any;
    expect(first.type).toBe('assistant');
    expect(first.message.role).toBe('assistant');
    expect(first.message.content[0].text).toContain('hello');

    // Last event should be a result
    const last = events[events.length - 1] as any;
    expect(last.type).toBe('result');
    expect(last.subtype).toBe('success');
    expect(last.session_id).toBe('test-session');
  });

  it('yields resumed session message for resume', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: '',
      sessionId: 'resume-session',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: true,
      signal: abort.signal,
    })) {
      events.push(msg);
    }

    expect(events.length).toBe(1);
    const msg = events[0] as any;
    expect(msg.type).toBe('assistant');
    expect(msg.message.content[0].text).toContain('Resumed');
  });

  it('respects abort signal', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();
    abort.abort(); // abort immediately

    for await (const msg of runQuery({
      prompt: 'will not run',
      sessionId: 's1',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
    })) {
      events.push(msg);
    }

    expect(events).toHaveLength(0);
  });

  it('yields stream events before complete message when includePartialMessages is true', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: 'hello',
      sessionId: 'stream-session',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
      includePartialMessages: true,
    })) {
      events.push(msg);
    }

    // Should have stream events before the assistant message
    const streamEvents = events.filter((e: any) => e.type === 'stream_event');
    expect(streamEvents.length).toBeGreaterThan(0);

    // First stream event should be message_start
    expect((streamEvents[0] as any).event.type).toBe('message_start');

    // Should have text_delta events
    const deltas = streamEvents.filter(
      (e: any) => e.event.type === 'content_block_delta' && e.event.delta.type === 'text_delta',
    );
    expect(deltas.length).toBeGreaterThan(0);

    // Concatenated deltas should equal the full response text
    const deltaText = deltas.map((e: any) => e.event.delta.text).join('');
    expect(deltaText).toContain('hello');

    // Last stream event should be message_stop
    expect((streamEvents[streamEvents.length - 1] as any).event.type).toBe('message_stop');

    // Complete assistant and result messages should still follow
    const assistant = events.find((e: any) => e.type === 'assistant') as any;
    expect(assistant).toBeDefined();
    expect(assistant.message.content[0].text).toContain('hello');

    const result = events.find((e: any) => e.type === 'result') as any;
    expect(result).toBeDefined();
  });

  it('does not yield stream events when includePartialMessages is false', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: 'hello',
      sessionId: 'no-stream',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
      includePartialMessages: false,
    })) {
      events.push(msg);
    }

    const streamEvents = events.filter((e: any) => e.type === 'stream_event');
    expect(streamEvents).toHaveLength(0);

    // Should still have assistant + result
    expect(events.length).toBe(2);
    expect((events[0] as any).type).toBe('assistant');
    expect((events[1] as any).type).toBe('result');
  });

  it('accepts all SDK parity options without error', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: 'test with all options',
      sessionId: 'opts-session',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
      model: 'claude-opus-4-6-20250805',
      maxTurns: 5,
      maxBudgetUsd: 1.50,
      effort: 'high',
      thinking: { type: 'enabled', budgetTokens: 5000 },
      outputFormat: { type: 'json_schema', schema: { type: 'object', properties: { answer: { type: 'string' } } } },
      allowedTools: ['Read', 'Grep'],
      disallowedTools: ['Bash'],
      betas: ['context-1m-2025-08-07'],
      subagents: { researcher: { model: 'claude-sonnet' } },
      initialAgent: 'researcher',
    })) {
      events.push(msg);
    }

    // Should still produce assistant + result — options don't change mock behavior
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect((events[0] as any).type).toBe('assistant');
    expect((events[events.length - 1] as any).type).toBe('result');
  });

  it('produces messages shaped like real SDK output', async () => {
    const events: unknown[] = [];
    const abort = new AbortController();

    for await (const msg of runQuery({
      prompt: 'test',
      sessionId: 's1',
      workspaceDir: '/tmp',
      claudeMd: '',
      resume: false,
      signal: abort.signal,
    })) {
      events.push(msg);
    }

    // Verify the result message has the fields the real SDK would return
    const result = events.find((e: any) => e.type === 'result') as any;
    expect(result).toBeDefined();
    expect(result).toHaveProperty('session_id');
    expect(result).toHaveProperty('cost_usd');
    expect(result).toHaveProperty('duration_ms');
    expect(result).toHaveProperty('is_error');
    expect(result).toHaveProperty('num_turns');
  });
});
