import { describe, it, expect } from 'vitest';
import {
  extractStreamDelta,
  extractTextFromEvent,
  parseMessageContent,
  classifyToStreamEvents,
} from '../types.js';

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

// =============================================================================
// Plan 01: parseMessageContent
// =============================================================================

describe('parseMessageContent', () => {
  it('parses assistant message with text blocks', () => {
    const raw = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    });
    const result = parseMessageContent(raw);
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('parses assistant message with tool_use blocks', () => {
    const raw = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/foo.ts' } },
        ],
      },
    });
    const result = parseMessageContent(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'Let me read that file.' });
    expect(result[1]).toEqual({ type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/foo.ts' } });
  });

  it('parses thinking blocks', () => {
    const raw = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'Let me think about this...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      },
    });
    const result = parseMessageContent(raw);
    expect(result[0]).toEqual({ type: 'thinking', thinking: 'Let me think about this...' });
    expect(result[1]).toEqual({ type: 'text', text: 'Here is my answer.' });
  });

  it('wraps unknown block types as RawContent — never drops data', () => {
    const raw = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'citation', source: 'arxiv', ref: '2301.00001' },
          { type: 'audio', encoding: 'mp3', data: 'base64...' },
        ],
      },
    });
    const result = parseMessageContent(raw);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', text: 'hi' });
    expect(result[1]).toEqual({
      type: 'raw',
      rawType: 'citation',
      raw: { type: 'citation', source: 'arxiv', ref: '2301.00001' },
    });
    expect(result[2]).toEqual({
      type: 'raw',
      rawType: 'audio',
      raw: { type: 'audio', encoding: 'mp3', data: 'base64...' },
    });
  });

  it('parses tool_result messages', () => {
    const raw = JSON.stringify({
      type: 'user',
      tool_use_result: {
        tool_use_id: 'tu_1',
        stdout: 'file contents here',
        is_error: false,
      },
    });
    const result = parseMessageContent(raw);
    expect(result).toEqual([{
      type: 'tool_result',
      tool_use_id: 'tu_1',
      content: 'file contents here',
      is_error: false,
    }]);
  });

  it('parses result messages as text', () => {
    const raw = JSON.stringify({ type: 'result', result: 'Done!' });
    const result = parseMessageContent(raw);
    expect(result).toEqual([{ type: 'text', text: 'Done!' }]);
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseMessageContent('not json at all');
    expect(result).toEqual([{ type: 'text', text: 'not json at all' }]);
  });

  it('wraps completely unknown message shapes as RawContent', () => {
    const raw = JSON.stringify({ type: 'future_type', data: { foo: 'bar' } });
    const result = parseMessageContent(raw);
    expect(result).toEqual([{
      type: 'raw',
      rawType: 'future_type',
      raw: { type: 'future_type', data: { foo: 'bar' } },
    }]);
  });
});

// =============================================================================
// Plan 02: classifyToStreamEvents
// =============================================================================

describe('classifyToStreamEvents', () => {
  it('classifies text_delta from stream_event', () => {
    const data = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    };
    const events = classifyToStreamEvents(data);
    expect(events).toHaveLength(2); // text_delta + raw message
    expect(events[0]).toEqual({ type: 'text_delta', data: { delta: 'Hello' } });
    expect(events[1].type).toBe('message');
  });

  it('classifies thinking_delta from stream_event', () => {
    const data = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Hmm...' },
      },
    };
    const events = classifyToStreamEvents(data);
    expect(events[0]).toEqual({ type: 'thinking_delta', data: { delta: 'Hmm...' } });
  });

  it('classifies assistant messages with mixed content', () => {
    const data = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    };
    const events = classifyToStreamEvents(data);
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('tool_use');
    expect(types).toContain('message'); // always includes raw
  });

  it('classifies tool results', () => {
    const data = {
      type: 'user',
      tool_use_result: {
        tool_use_id: 'tu_1',
        tool_name: 'Bash',
        stdout: 'file1.ts\nfile2.ts',
      },
    };
    const events = classifyToStreamEvents(data);
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect((toolResult as any).data.tool_use_id).toBe('tu_1');
  });

  it('classifies turn complete', () => {
    const data = { type: 'result', num_turns: 3, result: 'Done!' };
    const events = classifyToStreamEvents(data);
    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
    expect((turnComplete as any).data.numTurns).toBe(3);
  });

  it('always includes raw message event', () => {
    const data = { type: 'result', result: 'hi' };
    const events = classifyToStreamEvents(data);
    const raw = events.find((e) => e.type === 'message');
    expect(raw).toBeDefined();
    expect((raw as any).data).toEqual(data);
  });

  it('forwards unknown stream_event delta types without dropping', () => {
    const data = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'audio_delta', audio: 'base64chunk' },
      },
    };
    const events = classifyToStreamEvents(data);
    // Should have the unknown delta type + raw message
    const audioDelta = events.find((e) => e.type === 'audio_delta');
    expect(audioDelta).toBeDefined();
    expect((audioDelta as any).data.audio).toBe('base64chunk');
  });

  it('forwards unknown content block types from assistant messages', () => {
    const data = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'hi' },
          { type: 'citation', source: 'arxiv', ref: '2301.00001' },
        ],
      },
    };
    const events = classifyToStreamEvents(data);
    const citation = events.find((e) => e.type === 'citation');
    expect(citation).toBeDefined();
    expect((citation as any).data.source).toBe('arxiv');
  });
});
