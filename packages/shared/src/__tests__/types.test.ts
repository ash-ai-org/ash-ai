import { describe, it, expect } from 'vitest';
import { extractStreamDelta, extractTextFromEvent } from '../types.js';

describe('extractStreamDelta', () => {
  it('returns text from a text_delta stream event', () => {
    const data = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    };
    expect(extractStreamDelta(data)).toBe('Hello');
  });

  it('returns null for non-stream_event messages', () => {
    expect(extractStreamDelta({ type: 'assistant', message: { content: [] } })).toBeNull();
    expect(extractStreamDelta({ type: 'result' })).toBeNull();
  });

  it('returns null for stream events that are not content_block_delta', () => {
    expect(extractStreamDelta({ type: 'stream_event', event: { type: 'message_start' } })).toBeNull();
    expect(extractStreamDelta({ type: 'stream_event', event: { type: 'content_block_stop' } })).toBeNull();
  });

  it('returns null for content_block_delta with non-text delta type', () => {
    const data = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"key":' },
      },
    };
    expect(extractStreamDelta(data)).toBeNull();
  });
});

describe('extractTextFromEvent', () => {
  it('returns null for stream_event messages', () => {
    const data = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
    };
    expect(extractTextFromEvent(data)).toBeNull();
  });

  it('returns text from assistant messages', () => {
    const data = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    };
    expect(extractTextFromEvent(data)).toBe('Hello world');
  });
});
