#!/usr/bin/env tsx
/**
 * Benchmark: measure latency against a remote Ash server.
 *
 * Two scenarios (no server restart needed):
 *   1. New session (cold start) — create sandbox + first message
 *   2. Warm resume — pause then resume while sandbox is alive
 *
 * Each scenario measures:
 *   - API latency: time for the create/resume HTTP call
 *   - TTFT: time from sending a message to first SSE data chunk
 *   - Total: time from message send to stream completion
 *
 * Usage:
 *   tsx test/bench/remote-latency.ts --url http://1.2.3.4:4100
 *   tsx test/bench/remote-latency.ts --url http://1.2.3.4:4100 --rounds 5
 *   tsx test/bench/remote-latency.ts --url http://1.2.3.4:4100 --agent my-agent
 *
 * The server must already have an agent deployed (default: "qa-bot").
 */

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

const SERVER_URL = argVal('url', '').replace(/\/$/, '');
const ROUNDS = parseInt(argVal('rounds', '5'), 10);
const AGENT = argVal('agent', 'qa-bot');
const TTFT_PROMPT = 'Respond with exactly: ok';

if (!SERVER_URL) {
  console.error('Usage: remote-latency.ts --url <server-url> [--rounds N] [--agent name]');
  console.error('  Example: tsx test/bench/remote-latency.ts --url http://1.2.3.4:4100');
  process.exit(1);
}

if (isNaN(ROUNDS) || ROUNDS < 1) {
  console.error('Invalid --rounds value');
  process.exit(1);
}

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

async function createSession(agent: string): Promise<string> {
  const res = await post(`${SERVER_URL}/api/sessions`, { agent });
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session.id as string;
}

async function pauseSession(sessionId: string): Promise<void> {
  const res = await post(`${SERVER_URL}/api/sessions/${sessionId}/pause`, {});
  if (!res.ok) throw new Error(`Pause failed (${res.status}): ${await res.text()}`);
}

async function resumeSession(sessionId: string): Promise<void> {
  const res = await post(`${SERVER_URL}/api/sessions/${sessionId}/resume`, {});
  if (!res.ok) throw new Error(`Resume failed (${res.status}): ${await res.text()}`);
}

async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
}

/**
 * Send a message and measure TTFT + total time.
 */
async function sendMessageMeasured(
  sessionId: string,
  content: string,
): Promise<{ ttftMs: number; totalMs: number }> {
  const start = performance.now();

  const res = await post(`${SERVER_URL}/api/sessions/${sessionId}/messages`, { content });
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[bench] remote-latency: ${ROUNDS} rounds against ${SERVER_URL}`);
  console.error(`[bench] Agent: ${AGENT}`);
  console.error(`[bench] Date: ${new Date().toISOString()}`);
  console.error(`[bench] Platform: ${process.platform} ${process.arch} (client)`);
  console.error('');

  // Verify server is reachable
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    console.error(`[bench] Server healthy`);
  } catch (err: any) {
    console.error(`[bench] Cannot reach server at ${SERVER_URL}: ${err.message}`);
    process.exit(1);
  }

  // Verify agent exists
  try {
    const res = await fetch(`${SERVER_URL}/api/agents/${AGENT}`);
    if (!res.ok) throw new Error(`Agent "${AGENT}" not found (${res.status})`);
    console.error(`[bench] Agent "${AGENT}" found`);
  } catch (err: any) {
    console.error(`[bench] ${err.message}`);
    process.exit(1);
  }

  // =====================================================================
  // Scenario 1: New session (cold start)
  // =====================================================================
  console.error(`\n[bench] === Scenario 1: New Session (cold start) ===`);
  const newSessionTimes: number[] = [];
  const newSessionTtft: number[] = [];
  const newSessionTotal: number[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    const sid = await createSession(AGENT);
    const createMs = performance.now() - start;
    newSessionTimes.push(round(createMs));

    const { ttftMs, totalMs } = await sendMessageMeasured(sid, TTFT_PROMPT);
    newSessionTtft.push(ttftMs);
    newSessionTotal.push(totalMs);

    console.error(
      `[bench]   Round ${i + 1}/${ROUNDS}: create=${createMs.toFixed(0)}ms  ttft=${ttftMs.toFixed(0)}ms  total=${totalMs.toFixed(0)}ms`,
    );

    await deleteSession(sid);
  }

  // =====================================================================
  // Scenario 2: Warm resume (sandbox still alive)
  // =====================================================================
  console.error(`\n[bench] === Scenario 2: Warm Resume ===`);
  const warmResumeTimes: number[] = [];
  const warmResumeTtft: number[] = [];
  const warmResumeTotal: number[] = [];

  // Create and warm up a session
  const warmSid = await createSession(AGENT);
  await sendMessageMeasured(warmSid, 'hello');
  console.error(`[bench]   Session ${warmSid} created and warmed`);

  for (let i = 0; i < ROUNDS; i++) {
    await pauseSession(warmSid);

    const start = performance.now();
    await resumeSession(warmSid);
    const resumeMs = performance.now() - start;
    warmResumeTimes.push(round(resumeMs));

    const { ttftMs, totalMs } = await sendMessageMeasured(warmSid, TTFT_PROMPT);
    warmResumeTtft.push(ttftMs);
    warmResumeTotal.push(totalMs);

    console.error(
      `[bench]   Round ${i + 1}/${ROUNDS}: resume=${resumeMs.toFixed(0)}ms  ttft=${ttftMs.toFixed(0)}ms  total=${totalMs.toFixed(0)}ms`,
    );
  }

  await deleteSession(warmSid);

  // =====================================================================
  // Results
  // =====================================================================
  const results = {
    benchmark: 'remote-latency',
    date: new Date().toISOString(),
    server: SERVER_URL,
    agent: AGENT,
    clientPlatform: `${process.platform} ${process.arch}`,
    rounds: ROUNDS,
    scenarios: {
      newSession: {
        apiLatency: stats(newSessionTimes),
        ttft: stats(newSessionTtft),
        totalMessage: stats(newSessionTotal),
      },
      warmResume: {
        apiLatency: stats(warmResumeTimes),
        ttft: stats(warmResumeTtft),
        totalMessage: stats(warmResumeTotal),
      },
    },
  };

  // Structured JSON to stdout
  console.log(JSON.stringify(results, null, 2));

  // Human-readable summary to stderr
  console.error('');
  console.error(`=== Remote Latency — ${SERVER_URL} (ms) ===`);
  console.error('');
  console.error('  Scenario          Metric         p50        p95        mean       min        max        n');
  console.error('  ----------------  -------------  ---------  ---------  ---------  ---------  ---------  ---');
  for (const [name, scenario] of Object.entries(results.scenarios)) {
    const { apiLatency: api, ttft, totalMessage: total } = scenario;
    if (api) {
      console.error(
        `  ${name.padEnd(18)} API latency    ${String(api.p50).padEnd(10)} ${String(api.p95).padEnd(10)} ${String(api.mean).padEnd(10)} ${String(api.min).padEnd(10)} ${String(api.max).padEnd(10)} ${api.count}`,
      );
    }
    if (ttft) {
      console.error(
        `  ${''.padEnd(18)} TTFT           ${String(ttft.p50).padEnd(10)} ${String(ttft.p95).padEnd(10)} ${String(ttft.mean).padEnd(10)} ${String(ttft.min).padEnd(10)} ${String(ttft.max).padEnd(10)} ${ttft.count}`,
      );
    }
    if (total) {
      console.error(
        `  ${''.padEnd(18)} Total msg      ${String(total.p50).padEnd(10)} ${String(total.p95).padEnd(10)} ${String(total.mean).padEnd(10)} ${String(total.min).padEnd(10)} ${String(total.max).padEnd(10)} ${total.count}`,
      );
    }
  }
  console.error('');
}

main().catch((err) => {
  console.error('[bench] Fatal:', err);
  process.exit(1);
});
