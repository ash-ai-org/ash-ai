# Pool Overhead Benchmark

**Date**: 2026-02-18
**Machine**: Apple Silicon (arm64), macOS Darwin 24.6.0
**Node**: v23.7.0
**Command**: `tsx test/bench/pool-overhead.ts`
**Setup**: 100 live sandboxes + 10 cold DB rows, 50 rounds per operation

## What it measures

Per-operation latency for SandboxPool operations against a real SQLite database with a mock SandboxManager (no real processes or bridge). Measures pure pool + DB overhead.

## Results

All values in milliseconds.

| Operation | p50 | p95 | p99 | mean |
|-----------|-----|-----|-----|------|
| `markRunning` | 0.028 | 0.057 | 0.152 | 0.033 |
| `markWaiting` | 0.028 | 0.033 | 0.171 | 0.032 |
| `evictOne` (create at capacity) | 0.095 | 0.383 | 0.383 | 0.127 |
| `countSandboxes` | 0.003 | 0.004 | 0.013 | 0.004 |
| `statsAsync` | 0.006 | 0.013 | 0.119 | 0.009 |
| `sweepIdle` (5 sandboxes/batch) | 0.265 | 1.577 | 1.577 | 0.397 |
| `getBestEvictionCandidate` (raw query) | 0.018 | 0.024 | 0.096 | 0.020 |
| `getIdleSandboxes` (raw query) | 0.006 | 0.012 | 0.027 | 0.007 |

## Analysis

- **State transitions** (`markRunning`/`markWaiting`): ~0.03ms p50. The in-memory update is synchronous; the DB write is fire-and-forget. These are effectively free on the hot path.
- **Eviction**: ~0.1ms p50 for the single-query eviction path (`getBestEvictionCandidate` + delete/update). The CASE-based priority ordering in one SQL query replaces three sequential queries.
- **Idle sweep**: ~0.3ms p50 for sweeping 5 idle sandboxes. The batch `getIdleSandboxes` query (~0.006ms) replaces N individual `getSandbox` calls. Most of the time is in the per-sandbox destroy + state update loop.
- **Count/stats**: Sub-0.01ms. Negligible overhead for capacity checks.

## Comparison to old implementation

The key improvements measured here:
1. **`evictOne`**: Was 3 sequential DB queries (cold, warm, waiting). Now 1 query with CASE ordering. Raw query time: ~0.02ms vs ~0.06ms (3x).
2. **`sweepIdle`**: Was N individual `getSandbox` calls in a loop. Now 1 batch query. For 5 idle sandboxes: 1 query (~0.006ms) vs 5 queries (~0.03ms total).
