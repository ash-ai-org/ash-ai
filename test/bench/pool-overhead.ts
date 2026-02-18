#!/usr/bin/env tsx
/**
 * Benchmark: measure SandboxPool operation latency in isolation.
 *
 * No real sandbox processes or bridge — uses a mock SandboxManager and real
 * SQLite in a temp dir to measure pure pool + DB overhead.
 *
 * Usage:
 *   tsx test/bench/pool-overhead.ts                # defaults (100 sandboxes, 50 rounds)
 *   tsx test/bench/pool-overhead.ts --rounds 200   # more samples
 *   tsx test/bench/pool-overhead.ts --sandboxes 500 # larger pool
 *
 * Output: JSON summary to stdout. Human-readable to stderr.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { SqliteDb } from '../../packages/server/src/db/sqlite.js';
import { SandboxPool } from '../../packages/server/src/sandbox/pool.js';
import type { SandboxManager, ManagedSandbox, CreateSandboxOpts } from '../../packages/server/src/sandbox/manager.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function argVal(name: string, fallback: number): number {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = parseInt(args[idx + 1], 10);
  return isNaN(v) ? fallback : v;
}

const ROUNDS = argVal('rounds', 50);
const SANDBOX_COUNT = argVal('sandboxes', 100);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: round(sorted[0]),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000; // microsecond precision
}

let nextId = 0;

function mockProcess(): any {
  const proc = new EventEmitter();
  (proc as any).exitCode = null;
  (proc as any).kill = () => {};
  (proc as any).pid = ++nextId;
  return proc;
}

function mockSandbox(id: string): ManagedSandbox {
  return {
    id,
    process: mockProcess(),
    client: { connect: async () => {}, disconnect: () => {}, sendCommand: async () => ({}) } as any,
    socketPath: `/tmp/ash-${id.slice(0, 8)}.sock`,
    workspaceDir: `/tmp/test-sandboxes/${id}/workspace`,
    createdAt: new Date().toISOString(),
    limits: { memoryMb: 512, cpuPercent: 100, diskMb: 1024, maxProcesses: 64 },
  };
}

function mockManager(): SandboxManager {
  const sandboxes = new Map<string, ManagedSandbox>();
  return {
    create: async (opts: CreateSandboxOpts) => {
      const sb = mockSandbox(opts.id ?? opts.sessionId);
      sandboxes.set(sb.id, sb);
      return sb;
    },
    get: (id: string) => sandboxes.get(id),
    destroy: async (id: string) => { sandboxes.delete(id); },
    destroyAll: async () => { sandboxes.clear(); },
    get activeCount() { return sandboxes.size; },
  } as any;
}

async function measure(fn: () => Promise<void> | void): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[bench] pool-overhead: ${ROUNDS} rounds, ${SANDBOX_COUNT} pre-populated sandboxes`);
  console.error(`[bench] Date: ${new Date().toISOString()}`);
  console.error(`[bench] Platform: ${process.platform} ${process.arch}`);
  console.error(`[bench] Node: ${process.version}`);

  const dataDir = mkdtempSync(join(tmpdir(), 'ash-bench-pool-'));

  try {
    const db = new SqliteDb(dataDir);
    const manager = mockManager();

    // Insert a test agent for FK
    await db.upsertAgent('bench-agent', '/tmp/agent');

    const pool = new SandboxPool({
      manager,
      db,
      dataDir,
      maxCapacity: SANDBOX_COUNT + ROUNDS + 100, // enough headroom
      idleTimeoutMs: 0, // instant timeout for sweep benchmark
    });

    // Pre-populate sandboxes in various states
    const liveIds: string[] = [];
    for (let i = 0; i < SANDBOX_COUNT; i++) {
      const sb = await pool.create({
        agentDir: '/tmp/agent',
        sessionId: `sess-${i}`,
        id: `sb-${i}`,
        agentName: 'bench-agent',
      });

      // Distribute states: 40% running, 30% waiting, 20% warm, 10% cold (via DB only)
      if (i < SANDBOX_COUNT * 0.4) {
        pool.markRunning(sb.id);
      } else if (i < SANDBOX_COUNT * 0.7) {
        pool.markRunning(sb.id);
        pool.markWaiting(sb.id);
      }
      // else: warm (default from create)

      liveIds.push(sb.id);
    }

    // Add some cold entries directly in DB (no live process)
    const coldCount = Math.floor(SANDBOX_COUNT * 0.1);
    for (let i = 0; i < coldCount; i++) {
      await db.insertSandbox(`cold-${i}`, 'bench-agent', `/tmp/ws-cold-${i}`);
      await db.updateSandboxState(`cold-${i}`, 'cold');
    }

    // Wait for fire-and-forget DB writes to settle
    await new Promise((r) => setTimeout(r, 100));

    console.error(`[bench] Setup complete. Pre-populated ${SANDBOX_COUNT} live + ${coldCount} cold sandboxes.`);

    // --- Benchmarks ---

    // 1. markRunning
    const markRunningTimes: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      // Pick a warm sandbox
      const warmIdx = Math.floor(SANDBOX_COUNT * 0.7) + (i % Math.floor(SANDBOX_COUNT * 0.3));
      const id = liveIds[warmIdx];
      if (!id) continue;
      const ms = await measure(() => pool.markRunning(id));
      markRunningTimes.push(ms);
      // Reset to warm for next iteration
      pool.markWaiting(id);
    }
    await new Promise((r) => setTimeout(r, 50));

    // 2. markWaiting
    const markWaitingTimes: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const runIdx = i % Math.floor(SANDBOX_COUNT * 0.4);
      const id = liveIds[runIdx];
      if (!id) continue;
      const ms = await measure(() => pool.markWaiting(id));
      markWaitingTimes.push(ms);
      // Reset to running
      pool.markRunning(id);
    }
    await new Promise((r) => setTimeout(r, 50));

    // 3. evictOne (via create at capacity — forces eviction)
    // We'll lower maxCapacity temporarily
    const evictTimes: number[] = [];
    const totalNow = await db.countSandboxes();
    (pool as any).maxCapacity = totalNow; // set to current count to force eviction on next create
    for (let i = 0; i < Math.min(ROUNDS, coldCount); i++) {
      const ms = await measure(async () => {
        await pool.create({
          agentDir: '/tmp/agent',
          sessionId: `evict-sess-${i}`,
          id: `evict-sb-${i}`,
          agentName: 'bench-agent',
        });
      });
      evictTimes.push(ms);
    }

    // 4. countSandboxes
    const countTimes: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ms = await measure(() => db.countSandboxes());
      countTimes.push(ms);
    }

    // 5. statsAsync
    const statsAsyncTimes: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ms = await measure(() => pool.statsAsync());
      statsAsyncTimes.push(ms);
    }

    // 6. sweepIdle
    // Re-populate some waiting sandboxes with old timestamps for sweep
    const sweepTimes: number[] = [];
    for (let i = 0; i < Math.min(ROUNDS, 10); i++) {
      // Create a batch of waiting sandboxes with old last_used_at
      const batchSize = 5;
      for (let j = 0; j < batchSize; j++) {
        const sb = await pool.create({
          agentDir: '/tmp/agent',
          sessionId: `sweep-sess-${i}-${j}`,
          id: `sweep-sb-${i}-${j}`,
          agentName: 'bench-agent',
        });
        pool.markRunning(sb.id);
        pool.markWaiting(sb.id);
      }
      await new Promise((r) => setTimeout(r, 20)); // let DB writes settle

      const ms = await measure(() => pool.sweepIdle());
      sweepTimes.push(ms);
    }

    // 7. getBestEvictionCandidate (raw DB method)
    const evictQueryTimes: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ms = await measure(() => db.getBestEvictionCandidate());
      evictQueryTimes.push(ms);
    }

    // 8. getIdleSandboxes (raw DB method)
    const idleQueryTimes: number[] = [];
    const threshold = new Date().toISOString();
    for (let i = 0; i < ROUNDS; i++) {
      const ms = await measure(() => db.getIdleSandboxes(threshold));
      idleQueryTimes.push(ms);
    }

    // --- Results ---
    const results = {
      benchmark: 'pool-overhead',
      date: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      rounds: ROUNDS,
      preSeedSandboxes: SANDBOX_COUNT + coldCount,
      operations: {
        markRunning: markRunningTimes.length > 0 ? stats(markRunningTimes) : null,
        markWaiting: markWaitingTimes.length > 0 ? stats(markWaitingTimes) : null,
        evictOne: evictTimes.length > 0 ? stats(evictTimes) : null,
        countSandboxes: countTimes.length > 0 ? stats(countTimes) : null,
        statsAsync: statsAsyncTimes.length > 0 ? stats(statsAsyncTimes) : null,
        sweepIdle: sweepTimes.length > 0 ? stats(sweepTimes) : null,
        getBestEvictionCandidate: evictQueryTimes.length > 0 ? stats(evictQueryTimes) : null,
        getIdleSandboxes: idleQueryTimes.length > 0 ? stats(idleQueryTimes) : null,
      },
    };

    console.log(JSON.stringify(results, null, 2));

    // Human-readable summary
    console.error('');
    console.error('=== Pool Operation Latency (ms) ===');
    for (const [name, s] of Object.entries(results.operations)) {
      if (!s) continue;
      console.error(`  ${name.padEnd(30)} p50=${String(s.p50).padEnd(8)} p95=${String(s.p95).padEnd(8)} p99=${String(s.p99).padEnd(8)} mean=${s.mean}`);
    }
    console.error('');

    await db.close();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[bench] Fatal:', err);
  process.exit(1);
});
