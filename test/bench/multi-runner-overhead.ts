#!/usr/bin/env tsx
/**
 * Benchmark: measure the overhead of the coordinator→runner HTTP proxy.
 *
 * Runs the same workload in two configurations:
 *   1. Standalone (server handles everything in-process)
 *   2. Coordinator + Runner (server proxies to runner over HTTP)
 *
 * For each configuration, measures:
 *   - Session creation latency
 *   - TTFT (time to first SSE event for a message)
 *   - Total message round-trip time
 *
 * The difference between the two is the cost of the coordinator→runner hop.
 *
 * Usage:
 *   tsx test/bench/multi-runner-overhead.ts             # defaults (3 rounds)
 *   tsx test/bench/multi-runner-overhead.ts --rounds 10  # more samples
 *
 * Requires: `pnpm build` first.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const ROUNDS = parseInt(argVal('rounds', '3'), 10);
if (isNaN(ROUNDS) || ROUNDS < 1) {
  console.error('Usage: multi-runner-overhead.ts [--rounds N]');
  process.exit(1);
}

const TTFT_PROMPT = 'Respond with the number 1 and nothing else.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: round(sorted[0]),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    count: sorted.length,
  };
}

async function post(url: string, body: object): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function waitForReady(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function waitForRunnerHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/runner/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Runner at ${url} did not become ready within ${timeoutMs}ms`);
}

async function waitForRunnerRegistered(coordUrl: string, runnerId: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${coordUrl}/api/internal/runners`);
      if (res.ok) {
        const body = await res.json() as any;
        if (body.runners?.some((r: any) => r.runnerId === runnerId)) return;
      }
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Runner ${runnerId} did not register within ${timeoutMs}ms`);
}

function launchProcess(cmd: string, args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });
  child.stdout?.on('data', () => {}); // drain
  child.stderr?.on('data', () => {}); // drain
  return child;
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.kill('SIGTERM');
    child.on('exit', () => resolve());
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
  });
}

async function sendMessageMeasured(url: string, sessionId: string, content: string) {
  const start = performance.now();
  const res = await post(`${url}/api/sessions/${sessionId}/messages`, { content });
  if (!res.ok) throw new Error(`Message failed (${res.status}): ${await res.text()}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let ttftMs = 0;
  let firstChunk = true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstChunk) {
      ttftMs = performance.now() - start;
      firstChunk = false;
    }
    const text = decoder.decode(value, { stream: true });
    if (text.includes('event: done')) break;
  }

  return { ttftMs: round(ttftMs), totalMs: round(performance.now() - start) };
}

interface BenchResult {
  createLatency: number[];
  ttft: number[];
  totalMsg: number[];
}

async function runWorkload(serverUrl: string, agentName: string, rounds: number): Promise<BenchResult> {
  const result: BenchResult = { createLatency: [], ttft: [], totalMsg: [] };

  // Warm-up session
  const warmRes = await post(`${serverUrl}/api/sessions`, { agent: agentName });
  if (!warmRes.ok) throw new Error(`Warmup session failed: ${await warmRes.text()}`);
  const { session: warmSession } = await warmRes.json() as any;
  await sendMessageMeasured(serverUrl, warmSession.id, 'warmup');
  await fetch(`${serverUrl}/api/sessions/${warmSession.id}`, { method: 'DELETE' });

  for (let i = 0; i < rounds; i++) {
    // Create session
    const createStart = performance.now();
    const createRes = await post(`${serverUrl}/api/sessions`, { agent: agentName });
    if (!createRes.ok) throw new Error(`Create failed: ${await createRes.text()}`);
    const createMs = performance.now() - createStart;
    result.createLatency.push(round(createMs));

    const { session } = await createRes.json() as any;

    // Send message and measure TTFT
    const { ttftMs, totalMs } = await sendMessageMeasured(serverUrl, session.id, TTFT_PROMPT);
    result.ttft.push(ttftMs);
    result.totalMsg.push(totalMs);

    console.error(`[bench]   Round ${i + 1}/${rounds}: create=${createMs.toFixed(0)}ms  ttft=${ttftMs.toFixed(0)}ms  total=${totalMs.toFixed(0)}ms`);

    await fetch(`${serverUrl}/api/sessions/${session.id}`, { method: 'DELETE' });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[bench] multi-runner-overhead: ${ROUNDS} rounds per mode`);
  console.error(`[bench] Date: ${new Date().toISOString()}`);
  console.error(`[bench] Platform: ${process.platform} ${process.arch}`);
  console.error(`[bench] Node: ${process.version}`);

  const testRoot = mkdtempSync(join(tmpdir(), 'ash-bench-mr-'));
  const agentDir = join(testRoot, 'bench-agent');
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'CLAUDE.md'), '# Bench Agent\nRespond with a single word.');

  const bridgeEntry = join(process.cwd(), 'packages/bridge/dist/index.js');
  const serverEntry = join(process.cwd(), 'packages/server/dist/index.js');
  const runnerEntry = join(process.cwd(), 'packages/runner/dist/index.js');

  const AGENT = 'bench-mr-agent';
  const STANDALONE_PORT = 14500 + Math.floor(Math.random() * 200);
  const COORD_PORT = STANDALONE_PORT + 1;
  const RUNNER_PORT = STANDALONE_PORT + 2;

  let standaloneResult: BenchResult | null = null;
  let multiRunnerResult: BenchResult | null = null;

  // =========================================================================
  // Mode 1: Standalone
  // =========================================================================
  console.error(`\n[bench] === Mode 1: Standalone ===`);

  const standaloneDataDir = join(testRoot, 'standalone-data');
  mkdirSync(standaloneDataDir, { recursive: true });

  const standaloneProc = launchProcess('node', [serverEntry], {
    ASH_PORT: String(STANDALONE_PORT),
    ASH_HOST: '127.0.0.1',
    ASH_DATA_DIR: standaloneDataDir,
    ASH_BRIDGE_ENTRY: bridgeEntry,
  });

  try {
    const standaloneUrl = `http://127.0.0.1:${STANDALONE_PORT}`;
    await waitForReady(standaloneUrl);
    console.error(`[bench] Standalone server ready at ${standaloneUrl}`);

    // Deploy agent
    const deployRes = await post(`${standaloneUrl}/api/agents`, { name: AGENT, path: agentDir });
    if (!deployRes.ok) throw new Error(`Deploy failed: ${await deployRes.text()}`);

    standaloneResult = await runWorkload(standaloneUrl, AGENT, ROUNDS);
  } finally {
    await stopProcess(standaloneProc);
  }

  // =========================================================================
  // Mode 2: Coordinator + Runner
  // =========================================================================
  console.error(`\n[bench] === Mode 2: Coordinator + Runner ===`);

  const coordDataDir = join(testRoot, 'coord-data');
  mkdirSync(coordDataDir, { recursive: true });
  const runnerDataDir = join(testRoot, 'runner-data');
  mkdirSync(runnerDataDir, { recursive: true });

  const coordProc = launchProcess('node', [serverEntry], {
    ASH_PORT: String(COORD_PORT),
    ASH_HOST: '127.0.0.1',
    ASH_MODE: 'coordinator',
    ASH_DATA_DIR: coordDataDir,
    ASH_BRIDGE_ENTRY: bridgeEntry,
  });

  let runnerProc: ChildProcess | null = null;

  try {
    const coordUrl = `http://127.0.0.1:${COORD_PORT}`;
    await waitForReady(coordUrl);
    console.error(`[bench] Coordinator ready at ${coordUrl}`);

    // Start runner
    runnerProc = launchProcess('node', [runnerEntry], {
      ASH_RUNNER_ID: 'bench-runner',
      ASH_RUNNER_PORT: String(RUNNER_PORT),
      ASH_RUNNER_HOST: '127.0.0.1',
      ASH_SERVER_URL: coordUrl,
      ASH_RUNNER_ADVERTISE_HOST: '127.0.0.1',
      ASH_MAX_SANDBOXES: '50',
      ASH_BRIDGE_ENTRY: bridgeEntry,
      ASH_DATA_DIR: runnerDataDir,
    });

    const runnerUrl = `http://127.0.0.1:${RUNNER_PORT}`;
    await waitForRunnerHealth(runnerUrl);
    await waitForRunnerRegistered(coordUrl, 'bench-runner');
    console.error(`[bench] Runner registered with coordinator`);

    // Deploy agent on coordinator
    const deployRes = await post(`${coordUrl}/api/agents`, { name: AGENT, path: agentDir });
    if (!deployRes.ok) throw new Error(`Deploy failed: ${await deployRes.text()}`);

    multiRunnerResult = await runWorkload(coordUrl, AGENT, ROUNDS);
  } finally {
    if (runnerProc) await stopProcess(runnerProc);
    await stopProcess(coordProc);
  }

  // =========================================================================
  // Results
  // =========================================================================
  const results = {
    benchmark: 'multi-runner-overhead',
    date: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    rounds: ROUNDS,
    standalone: standaloneResult ? {
      createLatency: stats(standaloneResult.createLatency),
      ttft: stats(standaloneResult.ttft),
      totalMsg: stats(standaloneResult.totalMsg),
    } : null,
    multiRunner: multiRunnerResult ? {
      createLatency: stats(multiRunnerResult.createLatency),
      ttft: stats(multiRunnerResult.ttft),
      totalMsg: stats(multiRunnerResult.totalMsg),
    } : null,
    overhead: (standaloneResult && multiRunnerResult) ? {
      createLatency: round(mean(multiRunnerResult.createLatency) - mean(standaloneResult.createLatency)),
      ttft: round(mean(multiRunnerResult.ttft) - mean(standaloneResult.ttft)),
      totalMsg: round(mean(multiRunnerResult.totalMsg) - mean(standaloneResult.totalMsg)),
    } : null,
  };

  // Structured JSON to stdout
  console.log(JSON.stringify(results, null, 2));

  // Human-readable summary to stderr
  console.error('');
  console.error('=== Multi-Runner Overhead (ms) ===');
  console.error('');
  console.error('  Mode              Metric            p50        p95        mean');
  console.error('  ----------------  ----------------  ---------  ---------  ---------');

  if (results.standalone) {
    const s = results.standalone;
    if (s.createLatency) console.error(`  Standalone        Create session    ${String(s.createLatency.p50).padEnd(10)} ${String(s.createLatency.p95).padEnd(10)} ${s.createLatency.mean}`);
    if (s.ttft)          console.error(`                    TTFT              ${String(s.ttft.p50).padEnd(10)} ${String(s.ttft.p95).padEnd(10)} ${s.ttft.mean}`);
    if (s.totalMsg)      console.error(`                    Total msg         ${String(s.totalMsg.p50).padEnd(10)} ${String(s.totalMsg.p95).padEnd(10)} ${s.totalMsg.mean}`);
  }
  if (results.multiRunner) {
    const m = results.multiRunner;
    if (m.createLatency) console.error(`  Coord+Runner      Create session    ${String(m.createLatency.p50).padEnd(10)} ${String(m.createLatency.p95).padEnd(10)} ${m.createLatency.mean}`);
    if (m.ttft)          console.error(`                    TTFT              ${String(m.ttft.p50).padEnd(10)} ${String(m.ttft.p95).padEnd(10)} ${m.ttft.mean}`);
    if (m.totalMsg)      console.error(`                    Total msg         ${String(m.totalMsg.p50).padEnd(10)} ${String(m.totalMsg.p95).padEnd(10)} ${m.totalMsg.mean}`);
  }
  if (results.overhead) {
    console.error('');
    console.error(`  Overhead (mean)   Create session    ${results.overhead.createLatency}ms`);
    console.error(`                    TTFT              ${results.overhead.ttft}ms`);
    console.error(`                    Total msg         ${results.overhead.totalMsg}ms`);
  }
  console.error('');

  rmSync(testRoot, { recursive: true, force: true });
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

main().catch((err) => {
  console.error('[bench] Fatal:', err);
  process.exit(1);
});
