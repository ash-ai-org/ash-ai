#!/usr/bin/env tsx
/**
 * Benchmark: measure sandbox lifecycle operation latency + TTFT.
 *
 * Three scenarios against a real server (Docker on macOS, direct on Linux):
 *   1. New session (cold start) — POST /api/sessions creating a fresh sandbox
 *   2. Warm resume — POST /api/sessions/:id/resume where sandbox is still alive
 *   3. Cold resume — POST /api/sessions/:id/resume after server restart (sandbox dead)
 *
 * Each scenario measures:
 *   - API latency: time for the create/resume HTTP call to return
 *   - TTFT: time from sending a message to receiving the first SSE event
 *
 * Usage:
 *   tsx test/bench/sandbox-startup.ts                    # defaults (3 rounds, sqlite)
 *   tsx test/bench/sandbox-startup.ts --rounds 5         # more samples
 *   tsx test/bench/sandbox-startup.ts --db crdb          # use CockroachDB
 *   tsx test/bench/sandbox-startup.ts --db crdb --rounds 5
 *
 * Requires: `pnpm build` first (and `make docker-build` on macOS).
 *
 * Output: JSON summary to stdout. Human-readable summary to stderr.
 */

import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';
import { launchCrdb, type CrdbHandle } from '../helpers/crdb-launcher.js';

const DOCKER_MOUNT_ROOT = '/mnt/test';
const TTFT_PROMPT = 'Respond with the number 1 and nothing else.';

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
const DB_BACKEND = argVal('db', 'sqlite') as 'sqlite' | 'crdb';

if (isNaN(ROUNDS) || ROUNDS < 1) {
  console.error('Usage: sandbox-startup.ts [--rounds N] [--db sqlite|crdb]');
  process.exit(1);
}

if (DB_BACKEND !== 'sqlite' && DB_BACKEND !== 'crdb') {
  console.error(`Invalid --db value: ${DB_BACKEND}. Must be "sqlite" or "crdb".`);
  process.exit(1);
}

const PORT = 14200 + Math.floor(Math.random() * 800);
const CRDB_PORT = 26257 + Math.floor(Math.random() * 900);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function post(url: string, body: object): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Send a message and measure TTFT (time to first SSE event).
 * Returns { ttftMs, totalMs } and drains the stream.
 */
async function sendMessageMeasured(
  url: string,
  sessionId: string,
  content: string,
): Promise<{ ttftMs: number; totalMs: number }> {
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

/** Send a message and drain the SSE stream until done (no measurement). */
async function sendMessageAndDrain(url: string, sessionId: string, content: string): Promise<void> {
  await sendMessageMeasured(url, sessionId, content);
}

async function createSession(url: string, agent: string): Promise<string> {
  const res = await post(`${url}/api/sessions`, { agent });
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session.id as string;
}

async function pauseSession(url: string, sessionId: string): Promise<void> {
  const res = await post(`${url}/api/sessions/${sessionId}/pause`, {});
  if (!res.ok) throw new Error(`Pause failed (${res.status}): ${await res.text()}`);
}

async function resumeSession(url: string, sessionId: string): Promise<void> {
  const res = await post(`${url}/api/sessions/${sessionId}/resume`, {});
  if (!res.ok) throw new Error(`Resume failed (${res.status}): ${await res.text()}`);
}

async function deleteSession(url: string, sessionId: string): Promise<void> {
  const res = await fetch(`${url}/api/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
}

async function deployAgent(url: string, name: string, path: string): Promise<void> {
  const res = await post(`${url}/api/agents`, { name, path });
  if (!res.ok) throw new Error(`Deploy agent failed (${res.status}): ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[bench] sandbox-startup: ${ROUNDS} rounds, db=${DB_BACKEND}`);
  console.error(`[bench] Date: ${new Date().toISOString()}`);
  console.error(`[bench] Platform: ${process.platform} ${process.arch}`);
  console.error(`[bench] Node: ${process.version}`);

  const testRoot = mkdtempSync(join(tmpdir(), 'ash-bench-sandbox-'));
  const agentSrc = join(process.cwd(), 'examples/hosted-agent/agent');
  const agentDst = join(testRoot, 'hosted-agent');
  cpSync(agentSrc, agentDst, { recursive: true });

  // Ensure data dir is inside the mounted volume so SQLite persists
  // across Docker container restarts (cold resume scenario).
  const dataDir = join(testRoot, 'data');
  mkdirSync(dataDir, { recursive: true });
  const useDocker = shouldUseDocker();
  const serverDataDir = useDocker ? `${DOCKER_MOUNT_ROOT}/data` : dataDir;
  console.error(`[bench] Docker mode: ${useDocker}`);

  const AGENT_NAME = 'bench-hosted';

  let crdb: CrdbHandle | null = null;
  let server: ServerHandle | null = null;

  // Build extraEnv — shared across server launches
  const extraEnv: Record<string, string> = {
    ASH_DEBUG_TIMING: '1',
    ASH_DATA_DIR: serverDataDir,
  };

  try {
    // --- Start CRDB if needed ---
    if (DB_BACKEND === 'crdb') {
      console.error(`[bench] Starting CockroachDB on port ${CRDB_PORT}...`);
      crdb = await launchCrdb({ port: CRDB_PORT });
      console.error(`[bench] CockroachDB ready at ${crdb.url}`);
      // In Docker mode, the server container can't reach host's localhost —
      // use host.docker.internal instead.
      extraEnv.ASH_DATABASE_URL = useDocker
        ? crdb.url.replace('localhost', 'host.docker.internal')
        : crdb.url;
    }

    // --- Launch server ---
    server = await launchServer({
      port: PORT,
      testRoot,
      extraEnv,
    });
    await waitForReady(server.url);
    console.error(`[bench] Server ready at ${server.url}`);

    const agentPath = server.toServerPath(agentDst);
    await deployAgent(server.url, AGENT_NAME, agentPath);
    console.error(`[bench] Agent deployed: ${AGENT_NAME}`);

    // =====================================================================
    // Scenario 1: New session (cold start)
    // =====================================================================
    console.error(`\n[bench] === Scenario 1: New Session (cold start) ===`);
    const newSessionTimes: number[] = [];
    const newSessionTtft: number[] = [];

    for (let i = 0; i < ROUNDS; i++) {
      const start = performance.now();
      const sid = await createSession(server.url, AGENT_NAME);
      const createMs = performance.now() - start;
      newSessionTimes.push(round(createMs));

      // Measure TTFT
      const { ttftMs } = await sendMessageMeasured(server.url, sid, TTFT_PROMPT);
      newSessionTtft.push(ttftMs);

      console.error(`[bench]   Round ${i + 1}/${ROUNDS}: create=${createMs.toFixed(1)}ms  ttft=${ttftMs.toFixed(1)}ms`);

      // Clean up for next round
      await deleteSession(server.url, sid);
    }

    // =====================================================================
    // Scenario 2: Warm resume (sandbox still alive)
    // =====================================================================
    console.error(`\n[bench] === Scenario 2: Warm Resume ===`);
    const warmResumeTimes: number[] = [];
    const warmResumeTtft: number[] = [];

    // Create a session and warm it up
    const warmSid = await createSession(server.url, AGENT_NAME);
    await sendMessageAndDrain(server.url, warmSid, 'hello');
    console.error(`[bench]   Session ${warmSid} created and warmed`);

    for (let i = 0; i < ROUNDS; i++) {
      // Pause first (sandbox stays alive)
      await pauseSession(server.url, warmSid);

      const start = performance.now();
      await resumeSession(server.url, warmSid);
      const resumeMs = performance.now() - start;
      warmResumeTimes.push(round(resumeMs));

      // Measure TTFT
      const { ttftMs } = await sendMessageMeasured(server.url, warmSid, TTFT_PROMPT);
      warmResumeTtft.push(ttftMs);

      console.error(`[bench]   Round ${i + 1}/${ROUNDS}: resume=${resumeMs.toFixed(1)}ms  ttft=${ttftMs.toFixed(1)}ms`);
    }

    // Clean up warm session
    await deleteSession(server.url, warmSid);

    // =====================================================================
    // Scenario 3: Cold resume (server restarted, sandbox dead)
    // =====================================================================
    console.error(`\n[bench] === Scenario 3: Cold Resume (after server restart) ===`);
    const coldResumeTimes: number[] = [];
    const coldResumeTtft: number[] = [];

    // Create N sessions, message each, pause each
    const coldSids: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const sid = await createSession(server.url, AGENT_NAME);
      await sendMessageAndDrain(server.url, sid, 'hello for cold resume');
      await pauseSession(server.url, sid);
      coldSids.push(sid);
      console.error(`[bench]   Prepared session ${i + 1}/${ROUNDS}: ${sid}`);
    }

    // Restart server — all sandboxes die, sessions persist in DB
    console.error(`[bench]   Restarting server...`);
    await server.stop();
    server = await launchServer({
      port: PORT,
      testRoot,
      extraEnv,
    });
    await waitForReady(server.url);
    console.error(`[bench]   Server restarted`);

    // Re-deploy agent (agent registry may not survive restart on all backends)
    await deployAgent(server.url, AGENT_NAME, server.toServerPath(agentDst));

    // Resume each session — triggers cold path, then measure TTFT
    for (let i = 0; i < coldSids.length; i++) {
      const sid = coldSids[i];
      const start = performance.now();
      await resumeSession(server.url, sid);
      const resumeMs = performance.now() - start;
      coldResumeTimes.push(round(resumeMs));

      // Measure TTFT
      const { ttftMs } = await sendMessageMeasured(server.url, sid, TTFT_PROMPT);
      coldResumeTtft.push(ttftMs);

      console.error(`[bench]   Round ${i + 1}/${ROUNDS}: resume=${resumeMs.toFixed(1)}ms  ttft=${ttftMs.toFixed(1)}ms`);

      // Clean up
      await deleteSession(server.url, sid);
    }

    // =====================================================================
    // Results
    // =====================================================================
    const results = {
      benchmark: 'sandbox-startup',
      date: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      docker: useDocker,
      db: DB_BACKEND,
      rounds: ROUNDS,
      scenarios: {
        newSession: {
          apiLatency: stats(newSessionTimes),
          ttft: stats(newSessionTtft),
        },
        warmResume: {
          apiLatency: stats(warmResumeTimes),
          ttft: stats(warmResumeTtft),
        },
        coldResume: {
          apiLatency: stats(coldResumeTimes),
          ttft: stats(coldResumeTtft),
        },
      },
    };

    // Structured JSON to stdout
    console.log(JSON.stringify(results, null, 2));

    // Human-readable summary to stderr
    console.error('');
    console.error(`=== Sandbox Startup Latency — db=${DB_BACKEND} (ms) ===`);
    console.error('');
    console.error('  Scenario             Metric         p50        p95        mean       n');
    console.error('  -------------------  -------------  ---------  ---------  ---------  ---');
    for (const [name, scenario] of Object.entries(results.scenarios)) {
      const api = scenario.apiLatency;
      const ttft = scenario.ttft;
      if (api) {
        console.error(`  ${name.padEnd(20)} API latency    ${String(api.p50).padEnd(10)} ${String(api.p95).padEnd(10)} ${String(api.mean).padEnd(10)} ${api.count}`);
      }
      if (ttft) {
        console.error(`  ${''.padEnd(20)} TTFT           ${String(ttft.p50).padEnd(10)} ${String(ttft.p95).padEnd(10)} ${String(ttft.mean).padEnd(10)} ${ttft.count}`);
      }
    }
    console.error('');
  } finally {
    if (server) await server.stop();
    if (crdb) await crdb.stop();
    rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[bench] Fatal:', err);
  process.exit(1);
});
