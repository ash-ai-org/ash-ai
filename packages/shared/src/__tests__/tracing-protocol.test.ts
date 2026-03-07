import { describe, it, expect } from 'vitest';
import { encode, decode, type BridgeCommand } from '../index.js';

describe('protocol traceContext field', () => {
  it('round-trips a query command with traceContext', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const cmd: BridgeCommand = {
      cmd: 'query',
      prompt: 'hello',
      sessionId: 's1',
      traceContext: traceparent,
    };
    const decoded = decode(encode(cmd)) as typeof cmd;
    expect(decoded).toEqual(cmd);
    expect(decoded.traceContext).toBe(traceparent);
  });

  it('round-trips a query command without traceContext', () => {
    const cmd: BridgeCommand = { cmd: 'query', prompt: 'hello', sessionId: 's1' };
    const decoded = decode(encode(cmd)) as typeof cmd;
    expect(decoded).toEqual(cmd);
    expect(decoded.traceContext).toBeUndefined();
  });

  it('round-trips a resume command with traceContext', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const cmd: BridgeCommand = {
      cmd: 'resume',
      sessionId: 's1',
      traceContext: traceparent,
    };
    const decoded = decode(encode(cmd)) as typeof cmd;
    expect(decoded).toEqual(cmd);
  });

  it('round-trips an exec command with traceContext', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const cmd: BridgeCommand = {
      cmd: 'exec',
      command: 'ls',
      traceContext: traceparent,
    };
    const decoded = decode(encode(cmd)) as typeof cmd;
    expect(decoded).toEqual(cmd);
  });

  it('traceContext is a valid W3C traceparent format', () => {
    // W3C traceparent: version-traceid-parentid-traceflags
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const parts = traceparent.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('00'); // version
    expect(parts[1]).toHaveLength(32); // trace-id (16 bytes hex)
    expect(parts[2]).toHaveLength(16); // parent-id (8 bytes hex)
    expect(parts[3]).toMatch(/^[0-9a-f]{2}$/); // trace-flags
  });
});
