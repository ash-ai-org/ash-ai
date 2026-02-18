// =============================================================================
// Lightweight hot-path timing instrumentation.
// Gated behind ASH_DEBUG_TIMING=1. Zero overhead when off.
// Output: one JSON line per message to stderr.
// =============================================================================

export interface TimingEntry {
  type: 'timing';
  source: 'server' | 'bridge';
  sessionId: string;
  [key: string]: unknown;
  timestamp: string;
}

/**
 * Returns true when timing instrumentation is enabled.
 */
export function timingEnabled(): boolean {
  return process.env.ASH_DEBUG_TIMING === '1';
}

/**
 * Returns a function that, when called, returns elapsed milliseconds
 * since `startTimer()` was invoked. Uses `process.hrtime.bigint()` for
 * sub-millisecond precision.
 */
export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000;
}

/**
 * Writes a TimingEntry as a single JSON line to stderr.
 * No-op if timing is disabled.
 */
export function logTiming(entry: TimingEntry): void {
  if (!timingEnabled()) return;
  process.stderr.write(JSON.stringify(entry) + '\n');
}
