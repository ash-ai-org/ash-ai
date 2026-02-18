import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { writeSSE } from '../routes/sessions.js';

describe('writeSSE backpressure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes immediately when buffer has room', async () => {
    const written: string[] = [];
    const fakeRaw = {
      write: (data: string) => {
        written.push(data);
        return true; // buffer has room
      },
      once: () => {},
    } as unknown as ServerResponse;

    await writeSSE(fakeRaw, 'event: message\ndata: {"hello":"world"}\n\n');

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('hello');
  });

  it('waits for drain when write returns false', async () => {
    const written: string[] = [];
    let drainCb: (() => void) | null = null;

    const fakeRaw = {
      write: (data: string) => {
        written.push(data);
        return false; // buffer full
      },
      once: (event: string, cb: () => void) => {
        if (event === 'drain') drainCb = cb;
      },
    } as unknown as ServerResponse;

    let resolved = false;
    const writePromise = writeSSE(fakeRaw, 'event: test\ndata: {}\n\n').then(() => {
      resolved = true;
    });

    // Give the microtask queue a tick — writeSSE should be waiting for drain
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    expect(drainCb).not.toBeNull();

    // Simulate drain
    drainCb!();
    await writePromise;
    expect(resolved).toBe(true);
    expect(written).toHaveLength(1);
  });

  it('blocks when client never drains (timeout behavior)', async () => {
    const fakeRaw = {
      write: () => false,
      once: (_event: string, _cb: () => void) => {
        // Never call the callback — simulates a dead client
      },
    } as unknown as ServerResponse;

    // writeSSE will wait up to SSE_WRITE_TIMEOUT_MS (30s) — verify it doesn't
    // resolve within a short window, proving it's blocked on drain
    const result = await Promise.race([
      writeSSE(fakeRaw, 'event: test\ndata: {}\n\n').then(() => 'resolved').catch(() => 'rejected'),
      new Promise<string>((resolve) => setTimeout(() => resolve('still-waiting'), 200)),
    ]);

    expect(result).toBe('still-waiting');
  });

  it('handles multiple sequential writes when buffer drains', async () => {
    // Use a PassThrough with a large enough buffer and consume output
    const stream = new PassThrough({ highWaterMark: 64 * 1024 });
    const raw = stream as unknown as ServerResponse;
    const chunks: string[] = [];

    // Consume output so the buffer stays drained
    stream.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    for (let i = 0; i < 10; i++) {
      await writeSSE(raw, `event: message\ndata: {"i":${i}}\n\n`);
    }

    expect(chunks).toHaveLength(10);
    expect(chunks[0]).toContain('"i":0');
    expect(chunks[9]).toContain('"i":9');
    stream.destroy();
  });
});
