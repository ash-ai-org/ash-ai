import { describe, it, expect } from 'vitest';
import { encode, decode, type BridgeCommand, type BridgeEvent } from '../index.js';

describe('protocol', () => {
  describe('encode/decode round-trip', () => {
    it('round-trips a query command', () => {
      const cmd: BridgeCommand = { cmd: 'query', prompt: 'hello', sessionId: 's1' };
      const decoded = decode(encode(cmd));
      expect(decoded).toEqual(cmd);
    });

    it('round-trips a resume command', () => {
      const cmd: BridgeCommand = { cmd: 'resume', sessionId: 's1' };
      const decoded = decode(encode(cmd));
      expect(decoded).toEqual(cmd);
    });

    it('round-trips an interrupt command', () => {
      const cmd: BridgeCommand = { cmd: 'interrupt' };
      const decoded = decode(encode(cmd));
      expect(decoded).toEqual(cmd);
    });

    it('round-trips a shutdown command', () => {
      const cmd: BridgeCommand = { cmd: 'shutdown' };
      const decoded = decode(encode(cmd));
      expect(decoded).toEqual(cmd);
    });

    it('round-trips a ready event', () => {
      const ev: BridgeEvent = { ev: 'ready' };
      const decoded = decode(encode(ev));
      expect(decoded).toEqual(ev);
    });

    it('round-trips a message event with SDK data', () => {
      const sdkMessage = {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        session_id: 's1',
      };
      const ev: BridgeEvent = { ev: 'message', data: sdkMessage };
      const decoded = decode(encode(ev)) as typeof ev;
      expect(decoded.ev).toBe('message');
      expect(decoded).toEqual(ev);
    });

    it('round-trips an error event', () => {
      const ev: BridgeEvent = { ev: 'error', error: 'something broke' };
      const decoded = decode(encode(ev));
      expect(decoded).toEqual(ev);
    });

    it('round-trips a done event', () => {
      const ev: BridgeEvent = { ev: 'done', sessionId: 's1' };
      const decoded = decode(encode(ev));
      expect(decoded).toEqual(ev);
    });
  });

  describe('encode', () => {
    it('produces newline-terminated JSON', () => {
      const encoded = encode({ cmd: 'interrupt' } as BridgeCommand);
      expect(encoded).toMatch(/\n$/);
      expect(encoded.split('\n').length).toBe(2); // content + empty after newline
    });

    it('is single-line (no embedded newlines)', () => {
      const ev: BridgeEvent = { ev: 'message', data: { text: 'line1\nline2' } };
      const encoded = encode(ev);
      const lines = encoded.trimEnd().split('\n');
      expect(lines.length).toBe(1);
    });
  });

  describe('decode', () => {
    it('handles leading/trailing whitespace', () => {
      const cmd: BridgeCommand = { cmd: 'interrupt' };
      const decoded = decode('  ' + JSON.stringify(cmd) + '  \n');
      expect(decoded).toEqual(cmd);
    });

    it('throws on invalid JSON', () => {
      expect(() => decode('not json')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => decode('')).toThrow();
    });
  });

  describe('SDK message passthrough', () => {
    it('preserves complex nested SDK message structure', () => {
      const sdkResult = {
        type: 'result',
        subtype: 'success',
        session_id: 'abc-123',
        cost_usd: 0.0042,
        duration_ms: 1500,
        duration_api_ms: 1200,
        is_error: false,
        num_turns: 3,
        result: 'Done!',
      };
      const ev: BridgeEvent = { ev: 'message', data: sdkResult };
      const decoded = decode(encode(ev)) as typeof ev;
      expect((decoded as any).data).toEqual(sdkResult);
    });

    it('preserves unicode in SDK messages', () => {
      const ev: BridgeEvent = {
        ev: 'message',
        data: { type: 'assistant', content: '你好世界 🌍 émojis' },
      };
      const decoded = decode(encode(ev)) as typeof ev;
      expect((decoded as any).data.content).toBe('你好世界 🌍 émojis');
    });
  });
});
