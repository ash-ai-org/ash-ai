# Unit Tests: packages/shared

The shared package is pure data definitions and protocol helpers. The tests here verify the protocol boundary — the thing both sides of a Unix socket must agree on.

## What to test

### Protocol encoding/decoding

This is the #1 source of subtle bugs. One side encodes, the other decodes. If they disagree on framing, messages are silently corrupted.

```typescript
// packages/shared/src/__tests__/protocol.test.ts

import { describe, it, expect } from 'vitest';
import { encodeBridgeMessage, decodeBridgeMessage } from '../protocol.js';
import type { BridgeCommand, BridgeEvent } from '../protocol.js';

describe('encodeBridgeMessage', () => {
  it('produces newline-delimited JSON', () => {
    const cmd: BridgeCommand = { action: 'query', message: 'hello', sessionId: 'abc' };
    const encoded = encodeBridgeMessage(cmd);
    expect(encoded).toBe('{"action":"query","message":"hello","sessionId":"abc"}\n');
  });

  it('handles special characters in message content', () => {
    const cmd: BridgeCommand = {
      action: 'query',
      message: 'line1\nline2\ttab "quotes" \\backslash',
      sessionId: 'x',
    };
    const encoded = encodeBridgeMessage(cmd);
    // Must be a single line (no raw newlines in the JSON)
    expect(encoded.trim().split('\n')).toHaveLength(1);
    // Must round-trip
    const decoded = decodeBridgeMessage<BridgeCommand>(encoded);
    expect(decoded).toEqual(cmd);
  });

  it('handles empty message', () => {
    const cmd: BridgeCommand = { action: 'query', message: '', sessionId: '' };
    const encoded = encodeBridgeMessage(cmd);
    const decoded = decodeBridgeMessage<BridgeCommand>(encoded);
    expect(decoded).toEqual(cmd);
  });

  it('handles unicode in message content', () => {
    const cmd: BridgeCommand = {
      action: 'query',
      message: '你好世界 🌍 ñ é ü',
      sessionId: 'uni',
    };
    const encoded = encodeBridgeMessage(cmd);
    const decoded = decodeBridgeMessage<BridgeCommand>(encoded);
    expect(decoded.message).toBe('你好世界 🌍 ñ é ü');
  });

  it('handles large messages without corruption', () => {
    const largeContent = 'x'.repeat(1_000_000); // 1MB
    const cmd: BridgeCommand = { action: 'query', message: largeContent, sessionId: 'lg' };
    const encoded = encodeBridgeMessage(cmd);
    const decoded = decodeBridgeMessage<BridgeCommand>(encoded);
    expect(decoded.message).toHaveLength(1_000_000);
  });
});

describe('decodeBridgeMessage', () => {
  it('parses valid JSON', () => {
    const event = decodeBridgeMessage<BridgeEvent>('{"type":"ready"}\n');
    expect(event).toEqual({ type: 'ready' });
  });

  it('handles trailing whitespace', () => {
    const event = decodeBridgeMessage<BridgeEvent>('{"type":"done","sessionId":"x"}  \n');
    expect(event.type).toBe('done');
  });

  it('throws on invalid JSON', () => {
    expect(() => decodeBridgeMessage('not json')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => decodeBridgeMessage('')).toThrow();
  });
});

describe('round-trip: all event types', () => {
  const events: BridgeEvent[] = [
    { type: 'ready' },
    { type: 'assistant_message', content: 'hello' },
    { type: 'tool_use', toolName: 'bash', toolId: 't1', input: { command: 'ls' } },
    { type: 'tool_result', toolId: 't1', output: 'file1\nfile2' },
    { type: 'result', content: 'done', sessionId: 'sess1' },
    { type: 'error', message: 'something broke' },
    { type: 'done', sessionId: 'sess1' },
  ];

  for (const event of events) {
    it(`round-trips ${event.type}`, () => {
      const encoded = encodeBridgeMessage(event);
      const decoded = decodeBridgeMessage<BridgeEvent>(encoded);
      expect(decoded).toEqual(event);
    });
  }
});
```

### Stream reassembly simulation

When data arrives over a socket, it comes in arbitrary chunks. Test that the consumer can reassemble messages split across chunks:

```typescript
describe('stream reassembly', () => {
  it('handles messages split across chunks', () => {
    const msg1 = '{"type":"ready"}\n';
    const msg2 = '{"type":"done","sessionId":"x"}\n';
    const combined = msg1 + msg2;

    // Simulate receiving in arbitrary chunks
    const chunks = [
      combined.slice(0, 5),
      combined.slice(5, 20),
      combined.slice(20),
    ];

    let buffer = '';
    const messages: BridgeEvent[] = [];

    for (const chunk of chunks) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          messages.push(decodeBridgeMessage<BridgeEvent>(line));
        }
      }
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('ready');
    expect(messages[1].type).toBe('done');
  });
});
```

## What NOT to test

- The TypeScript interfaces (Agent, Session, etc.) — the compiler validates these
- Constants — they're just numbers and strings
- Re-exports from index.ts
