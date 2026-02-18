#!/usr/bin/env tsx
/**
 * Benchmark: measure Ash overhead on the hot path (message in → first event out).
 *
 * Usage:
 *   pnpm bench                         # run with defaults (5 messages)
 *   pnpm bench -- --rounds 20          # more samples
 *
 * Requires: `pnpm build` first.
 *
 * What it measures:
 *   - End-to-end message latency (HTTP POST → first SSE event)
 *   - Ash server overhead (session/sandbox lookup + SSE framing)
 *   - Bridge overhead (command parse + socket serialization)
 *   - SDK latency (time inside the Claude SDK mock)
 *
 * Output: JSON summary to stdout, raw timing lines from stderr if ASH_DEBUG_TIMING=1.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const roundsIdx = args.indexOf('--rounds');
const ROUNDS = roundsIdx !== -1 ? parseInt(args[roundsIdx + 1], 10) : 5;

if (isNaN(ROUNDS) || ROUNDS < 1) {
  console.error('Usage: message-overhead.ts [--rounds N]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TimingLine {
  type: 'timing';
  source: 'server' | 'bridge';
  sessionId: string;
  [key: string]: unknown;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(values: number[]): { min: number; p50: number; p95: number; p99: number; max: number; mean: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: Math.round((sum / sorted.length) * 100) / 100,
  };
}

async function waitForReady(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

/**
 * Parse timing JSON lines from collected stderr output.
 * Bridge timing lines arrive wrapped by the sandbox manager as:
 *   [sandbox:xxxx:err] {"type":"timing",...}
 * So we extract JSON objects from anywhere in each line.
 */
function parseTimingLines(stderr: string): TimingLine[] {
  const lines: TimingLine[] = [];
  for (const line of stderr.split('\n')) {
    const jsonStart = line.indexOf('{"type":"timing"');
    if (jsonStart === -1) continue;
    try {
      const parsed = JSON.parse(line.slice(jsonStart));
      if (parsed.type === 'timing') lines.push(parsed);
    } catch {
      // not valid JSON
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[bench] message-overhead: ${ROUNDS} rounds`);
  console.error(`[bench] Date: ${new Date().toISOString()}`);
  console.error(`[bench] Platform: ${process.platform} ${process.arch}`);
  console.error(`[bench] Node: ${process.version}`);

  // Setup temp dirs
  const testRoot = mkdtempSync(join(tmpdir(), 'ash-bench-'));
  const agentDir = join(testRoot, 'bench-agent');
  const dataDir = join(testRoot, 'data');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(agentDir, 'CLAUDE.md'), '# Bench Agent\nRespond with a single word.');

  const port = 14100 + Math.floor(Math.random() * 900);
  const bridgeEntry = join(process.cwd(), 'packages/bridge/dist/index.js');
  const serverEntry = join(process.cwd(), 'packages/server/dist/index.js');

  let child: ChildProcess | null = null;
  let stderrBuf = '';

  try {
    // Launch server with timing enabled
    child = spawn('node', [serverEntry], {
      env: {
        ...process.env,
        ASH_PORT: String(port),
        ASH_HOST: '127.0.0.1',
        ASH_DATA_DIR: dataDir,
        ASH_BRIDGE_ENTRY: bridgeEntry,
        ASH_DEBUG_TIMING: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });
    child.stdout?.on('data', () => {}); // drain

    const url = `http://localhost:${port}`;
    await waitForReady(url);
    console.error(`[bench] Server ready at ${url}`);

    // Deploy agent
    const deployRes = await fetch(`${url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bench-agent', path: agentDir }),
    });
    if (!deployRes.ok) throw new Error(`Deploy failed: ${await deployRes.text()}`);
    console.error(`[bench] Agent deployed`);

    // Create session
    const sessionRes = await fetch(`${url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'bench-agent' }),
    });
    if (!sessionRes.ok) throw new Error(`Session failed: ${await sessionRes.text()}`);
    const { session } = await sessionRes.json() as any;
    console.error(`[bench] Session created: ${session.id}`);

    // Warm-up round (not counted)
    console.error(`[bench] Warm-up...`);
    const warmRes = await fetch(`${url}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'warmup' }),
    });
    await warmRes.text(); // drain
    // Reset stderr buffer after warmup — only measure real rounds
    stderrBuf = '';

    // Benchmark rounds
    const e2eLatencies: number[] = [];
    const firstEventLatencies: number[] = [];

    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      let firstEventTime = 0;

      const res = await fetch(`${url}/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `bench round ${i}` }),
      });

      if (!res.ok) {
        console.error(`[bench] Round ${i} failed: ${res.status}`);
        continue;
      }

      // Read SSE stream, measure time to first event
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstChunk) {
          firstEventTime = performance.now() - start;
          firstChunk = false;
        }
        // Check for end of stream
        const text = decoder.decode(value, { stream: true });
        if (text.includes('event: done')) break;
      }

      const totalMs = performance.now() - start;
      e2eLatencies.push(Math.round(totalMs * 100) / 100);
      firstEventLatencies.push(Math.round(firstEventTime * 100) / 100);
      console.error(`[bench] Round ${i + 1}/${ROUNDS}: firstEvent=${firstEventTime.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`);
    }

    // Collect timing data from server stderr
    // Wait briefly for any final timing lines to flush
    await new Promise((r) => setTimeout(r, 500));

    const timingLines = parseTimingLines(stderrBuf);
    const serverTimings = timingLines.filter((t) => t.source === 'server');
    const bridgeTimings = timingLines.filter((t) => t.source === 'bridge');

    // Compute Ash overhead from timing instrumentation
    const overheads: number[] = [];
    for (const st of serverTimings) {
      const bt = bridgeTimings.find((b) => b.sessionId === st.sessionId);
      if (bt && typeof st.firstEventMs === 'number' && typeof bt.sdkFirstTokenMs === 'number') {
        overheads.push(Math.round(((st.firstEventMs as number) - (bt.sdkFirstTokenMs as number)) * 100) / 100);
      }
    }

    // Results
    const results = {
      benchmark: 'message-overhead',
      date: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      rounds: ROUNDS,
      e2e: e2eLatencies.length > 0 ? stats(e2eLatencies) : null,
      firstEvent: firstEventLatencies.length > 0 ? stats(firstEventLatencies) : null,
      serverLookup: serverTimings.length > 0
        ? stats(serverTimings.map((t) => t.lookupMs as number))
        : null,
      ashOverhead: overheads.length > 0 ? stats(overheads) : null,
      serverTimingSamples: serverTimings.length,
      bridgeTimingSamples: bridgeTimings.length,
    };

    // Print to stdout (structured, pipeable)
    console.log(JSON.stringify(results, null, 2));

    // Human-readable summary to stderr
    console.error('');
    console.error('=== Results ===');
    if (results.e2e) {
      console.error(`  E2E latency:     p50=${results.e2e.p50}ms  p95=${results.e2e.p95}ms  p99=${results.e2e.p99}ms`);
    }
    if (results.firstEvent) {
      console.error(`  First event:     p50=${results.firstEvent.p50}ms  p95=${results.firstEvent.p95}ms  p99=${results.firstEvent.p99}ms`);
    }
    if (results.serverLookup) {
      console.error(`  Server lookup:   p50=${results.serverLookup.p50}ms  p95=${results.serverLookup.p95}ms  p99=${results.serverLookup.p99}ms`);
    }
    if (results.ashOverhead) {
      console.error(`  Ash overhead:    p50=${results.ashOverhead.p50}ms  p95=${results.ashOverhead.p95}ms  p99=${results.ashOverhead.p99}ms`);
    }
    console.error('');

    // Cleanup session
    await fetch(`${url}/api/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        child!.on('exit', resolve);
        setTimeout(() => {
          if (child!.exitCode === null) child!.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
    rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[bench] Fatal:', err);
  process.exit(1);
});
