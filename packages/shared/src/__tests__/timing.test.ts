import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTimer, logTiming, timingEnabled, type TimingEntry } from '../timing.js';

describe('timing', () => {
  const originalEnv = process.env.ASH_DEBUG_TIMING;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ASH_DEBUG_TIMING;
    } else {
      process.env.ASH_DEBUG_TIMING = originalEnv;
    }
  });

  describe('timingEnabled', () => {
    it('returns false when ASH_DEBUG_TIMING is not set', () => {
      delete process.env.ASH_DEBUG_TIMING;
      expect(timingEnabled()).toBe(false);
    });

    it('returns false when ASH_DEBUG_TIMING is "0"', () => {
      process.env.ASH_DEBUG_TIMING = '0';
      expect(timingEnabled()).toBe(false);
    });

    it('returns true when ASH_DEBUG_TIMING is "1"', () => {
      process.env.ASH_DEBUG_TIMING = '1';
      expect(timingEnabled()).toBe(true);
    });
  });

  describe('startTimer', () => {
    it('returns a function', () => {
      const elapsed = startTimer();
      expect(typeof elapsed).toBe('function');
    });

    it('returns elapsed time in milliseconds', () => {
      const elapsed = startTimer();
      // Spin briefly so elapsed > 0
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait ~5ms
      }
      const ms = elapsed();
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(1000); // sanity: less than 1 second
    });

    it('returns increasing values on successive calls', () => {
      const elapsed = startTimer();
      const first = elapsed();
      // Tiny spin
      const start = Date.now();
      while (Date.now() - start < 2) {
        // busy wait
      }
      const second = elapsed();
      expect(second).toBeGreaterThan(first);
    });
  });

  describe('logTiming', () => {
    let stderrWrite: typeof process.stderr.write;
    const calls: string[] = [];

    beforeEach(() => {
      calls.length = 0;
      stderrWrite = process.stderr.write;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      process.stderr.write = ((chunk: any) => {
        calls.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;
    });

    afterEach(() => {
      process.stderr.write = stderrWrite;
    });

    it('writes JSON line to stderr when enabled', () => {
      process.env.ASH_DEBUG_TIMING = '1';
      const entry: TimingEntry = {
        type: 'timing',
        source: 'server',
        sessionId: 's1',
        lookupMs: 0.1,
        timestamp: '2025-01-15T00:00:00.000Z',
      };
      logTiming(entry);
      expect(calls.length).toBe(1);
      const written = calls[0];
      expect(written).toMatch(/\n$/);
      const parsed = JSON.parse(written.trim());
      expect(parsed.type).toBe('timing');
      expect(parsed.source).toBe('server');
      expect(parsed.sessionId).toBe('s1');
      expect(parsed.lookupMs).toBe(0.1);
    });

    it('is a no-op when disabled', () => {
      delete process.env.ASH_DEBUG_TIMING;
      logTiming({
        type: 'timing',
        source: 'bridge',
        sessionId: 's1',
        timestamp: '2025-01-15T00:00:00.000Z',
      });
      expect(calls.length).toBe(0);
    });
  });
});
