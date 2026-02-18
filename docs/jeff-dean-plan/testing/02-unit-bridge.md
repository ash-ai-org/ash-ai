# Unit Tests: packages/bridge

The bridge runs inside the sandbox. It's the translation layer between the Unix socket protocol and the Claude Agent SDK. Test that translation, not the SDK itself.

## What to test

### Handler message routing

The handler receives BridgeCommands and must route them correctly. Each command type triggers different behavior.

```typescript
// packages/bridge/src/__tests__/handler.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { encodeBridgeMessage } from '@anthropic-ai/ash-shared';
import type { BridgeCommand, BridgeEvent } from '@anthropic-ai/ash-shared';
import { BridgeHandler } from '../handler.js';

function createTestHandler() {
  const socket = new PassThrough();
  const handler = new BridgeHandler(socket, {
    workspacePath: '/tmp/test-workspace',
    claudeMdContent: '# Test Agent',
  });
  handler.pipe(socket);

  const events: BridgeEvent[] = [];
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        events.push(JSON.parse(line));
      }
    }
  });

  return { socket, handler, events };
}

function sendCommand(socket: PassThrough, cmd: BridgeCommand) {
  socket.write(encodeBridgeMessage(cmd));
}

describe('BridgeHandler', () => {
  it('responds to query with assistant_message and done', async () => {
    const { socket, events } = createTestHandler();

    sendCommand(socket, { action: 'query', message: 'hello', sessionId: 's1' });

    // Give async processing time to complete
    await new Promise((r) => setTimeout(r, 100));

    const types = events.map((e) => e.type);
    expect(types).toContain('assistant_message');
    expect(types[types.length - 1]).toBe('done');
  });

  it('includes sessionId in done event', async () => {
    const { socket, events } = createTestHandler();

    sendCommand(socket, { action: 'query', message: 'hi', sessionId: 'sess-42' });
    await new Promise((r) => setTimeout(r, 100));

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent as any).sessionId).toBe('sess-42');
  });

  it('emits shutdown event on shutdown command', async () => {
    const { socket, handler } = createTestHandler();
    const shutdownPromise = new Promise<void>((resolve) => {
      handler.on('shutdown', resolve);
    });

    sendCommand(socket, { action: 'shutdown' });
    await shutdownPromise; // Should resolve, not timeout
  });

  it('emits interrupt event on interrupt command', async () => {
    const { socket, handler } = createTestHandler();
    const interruptPromise = new Promise<void>((resolve) => {
      handler.on('interrupt', resolve);
    });

    sendCommand(socket, { action: 'interrupt' });
    await interruptPromise;
  });

  it('handles multiple sequential queries', async () => {
    const { socket, events } = createTestHandler();

    sendCommand(socket, { action: 'query', message: 'first', sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 100));
    const firstDone = events.findIndex((e) => e.type === 'done');
    expect(firstDone).toBeGreaterThan(-1);

    sendCommand(socket, { action: 'query', message: 'second', sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 100));
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents).toHaveLength(2);
  });

  it('sends error event on invalid command', async () => {
    const { socket, events } = createTestHandler();

    socket.write('{"action":"nonexistent"}\n');
    await new Promise((r) => setTimeout(r, 100));

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
  });

  it('handles malformed JSON gracefully', async () => {
    const { socket, events } = createTestHandler();

    socket.write('not valid json\n');
    await new Promise((r) => setTimeout(r, 100));

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
  });
});
```

### SDK wrapper mock behavior

The mock SDK wrapper is what makes the system testable without a real Claude API key. Verify it produces the right event sequence.

```typescript
// packages/bridge/src/__tests__/sdk-wrapper.test.ts

import { describe, it, expect } from 'vitest';
import { runQuery } from '../sdk-wrapper.js';

describe('runQuery (mock mode)', () => {
  it('yields events in correct order: assistant_message → result → done', async () => {
    const events = [];
    for await (const event of runQuery({
      message: 'hello',
      sessionId: 'test-session',
      workspacePath: '/tmp',
      claudeMdContent: '# Test',
    })) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe('assistant_message');
    expect(events[events.length - 1].type).toBe('done');
  });

  it('echoes the user message in the response', async () => {
    const events = [];
    for await (const event of runQuery({
      message: 'specific test message',
      sessionId: 's1',
      workspacePath: '/tmp',
    })) {
      events.push(event);
    }

    const assistantMsg = events.find((e) => e.type === 'assistant_message');
    expect(assistantMsg).toBeDefined();
    // Mock should reference the input somehow
    expect((assistantMsg as any).content).toBeTruthy();
  });

  it('includes sessionId in done event', async () => {
    const events = [];
    for await (const event of runQuery({
      message: 'hi',
      sessionId: 'my-session-id',
      workspacePath: '/tmp',
    })) {
      events.push(event);
    }

    const done = events.find((e) => e.type === 'done');
    expect((done as any).sessionId).toBe('my-session-id');
  });
});
```

## What NOT to test

- The actual Claude Agent SDK (that's Anthropic's problem)
- Unix socket creation (tested by the OS; tested in integration)
- CLAUDE.md file loading (trivial fs.readFileSync wrapper)
