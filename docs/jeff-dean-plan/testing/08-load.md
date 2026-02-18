# Load Tests and Performance Benchmarks

## Purpose

Answer three questions:
1. What's the per-message overhead Ash adds on top of the SDK?
2. How many concurrent sessions can one machine handle?
3. Where does it break?

These aren't pass/fail tests. They produce numbers. Run them before and after every optimization to verify you actually made things faster.

## Benchmark 1: Message Overhead

Measure Ash's tax per message round-trip.

```typescript
// test/bench/message-overhead.ts

import { SandboxManager } from '@anthropic-ai/ash-runner/sandbox/manager';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function benchMessageOverhead() {
  const sandboxesDir = await mkdtemp(join(tmpdir(), 'ash-bench-'));
  const agentDir = await mkdtemp(join(tmpdir(), 'ash-bench-agent-'));
  await writeFile(join(agentDir, 'CLAUDE.md'), '# Bench Agent');

  const manager = new SandboxManager({
    sandboxesDir,
    bridgeEntryPoint: join(process.cwd(), 'packages/bridge/dist/index.js'),
  });

  const info = await manager.createSandbox({
    agentName: 'bench',
    agentDir,
    sessionId: 'bench-session',
  });

  const client = manager.getBridgeClient(info.id)!;

  // Warmup
  for (let i = 0; i < 3; i++) {
    const events = await client.sendAndStream({
      action: 'query', message: 'warmup', sessionId: 'bench',
    });
    for await (const e of events) {
      if (e.type === 'done') break;
    }
  }

  // Measure
  const N = 100;
  const latencies: number[] = [];

  for (let i = 0; i < N; i++) {
    const start = process.hrtime.bigint();

    const events = await client.sendAndStream({
      action: 'query', message: `message ${i}`, sessionId: 'bench',
    });

    let firstEvent = false;
    for await (const e of events) {
      if (!firstEvent) {
        const firstEventNs = process.hrtime.bigint() - start;
        latencies.push(Number(firstEventNs) / 1_000_000);
        firstEvent = true;
      }
      if (e.type === 'done') break;
    }
  }

  latencies.sort((a, b) => a - b);

  console.log(`Message overhead (${N} messages):`);
  console.log(`  p50: ${latencies[Math.floor(N * 0.5)].toFixed(2)}ms`);
  console.log(`  p95: ${latencies[Math.floor(N * 0.95)].toFixed(2)}ms`);
  console.log(`  p99: ${latencies[Math.floor(N * 0.99)].toFixed(2)}ms`);
  console.log(`  min: ${latencies[0].toFixed(2)}ms`);
  console.log(`  max: ${latencies[N - 1].toFixed(2)}ms`);

  await manager.destroyAll();
  await rm(sandboxesDir, { recursive: true, force: true });
  await rm(agentDir, { recursive: true, force: true });
}

benchMessageOverhead().catch(console.error);
```

**Target**: p50 < 3ms, p99 < 10ms (mock SDK; real SDK will be dominated by API latency).

## Benchmark 2: Concurrent Session Capacity

How many sandboxes can run simultaneously before things degrade?

```typescript
// test/bench/concurrent-sessions.ts

async function benchConcurrentSessions() {
  const LEVELS = [1, 5, 10, 25, 50, 100, 200];

  for (const n of LEVELS) {
    const sandboxesDir = await mkdtemp(join(tmpdir(), `ash-conc-${n}-`));
    const agentDir = await mkdtemp(join(tmpdir(), 'ash-conc-agent-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Concurrent Test');

    const manager = new SandboxManager({
      sandboxesDir,
      bridgeEntryPoint: join(process.cwd(), 'packages/bridge/dist/index.js'),
    });

    const startMem = process.memoryUsage().heapUsed;
    const createStart = process.hrtime.bigint();

    // Create N sandboxes
    const sandboxes = [];
    for (let i = 0; i < n; i++) {
      try {
        const info = await manager.createSandbox({
          agentName: 'conc-test',
          agentDir,
          sessionId: `session-${i}`,
        });
        sandboxes.push(info);
      } catch (err) {
        console.log(`  Failed at sandbox ${i}: ${err.message}`);
        break;
      }
    }

    const createMs = Number(process.hrtime.bigint() - createStart) / 1_000_000;
    const endMem = process.memoryUsage().heapUsed;
    const memPerSandboxKb = (endMem - startMem) / sandboxes.length / 1024;

    // Send one message to each sandbox concurrently
    const msgStart = process.hrtime.bigint();
    const results = await Promise.allSettled(
      sandboxes.map(async (info) => {
        const client = manager.getBridgeClient(info.id)!;
        const events = await client.sendAndStream({
          action: 'query', message: 'ping', sessionId: info.sessionId || info.id,
        });
        for await (const e of events) {
          if (e.type === 'done') break;
        }
      }),
    );
    const msgMs = Number(process.hrtime.bigint() - msgStart) / 1_000_000;

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    console.log(`${n} concurrent sandboxes:`);
    console.log(`  Created: ${sandboxes.length} in ${createMs.toFixed(0)}ms (${(createMs / sandboxes.length).toFixed(0)}ms each)`);
    console.log(`  Memory per sandbox: ${memPerSandboxKb.toFixed(0)}KB`);
    console.log(`  Concurrent messages: ${succeeded} OK, ${failed} failed, ${msgMs.toFixed(0)}ms total`);
    console.log();

    await manager.destroyAll();
    await rm(sandboxesDir, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
}

benchConcurrentSessions().catch(console.error);
```

**What to look for**:
- Memory per sandbox should be roughly constant (not growing with N)
- Create time per sandbox should be roughly constant
- Message success rate should stay at 100% until resource exhaustion
- When it breaks, it should break cleanly (error, not hang or crash)

## Benchmark 3: Sandbox Create/Destroy Throughput

How fast can we churn sandboxes? Important for session resume cold path.

```typescript
// test/bench/sandbox-churn.ts

async function benchSandboxChurn() {
  const N = 50;

  // Measure create + destroy cycle
  const latencies: number[] = [];

  for (let i = 0; i < N; i++) {
    const start = process.hrtime.bigint();
    const info = await manager.createSandbox({ ... });
    await manager.destroySandbox(info.id);
    latencies.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  console.log(`Sandbox create/destroy (${N} cycles):`);
  console.log(`  p50: ${percentile(latencies, 50)}ms`);
  console.log(`  p99: ${percentile(latencies, 99)}ms`);
}
```

**Target**: p50 < 500ms, p99 < 2000ms (process spawn + socket connect + destroy).

## Running Benchmarks

```bash
# All benchmarks
pnpm bench

# Specific benchmark
tsx test/bench/message-overhead.ts
tsx test/bench/concurrent-sessions.ts
```

In root `package.json`:
```json
{
  "scripts": {
    "bench": "tsx test/bench/message-overhead.ts && tsx test/bench/concurrent-sessions.ts"
  }
}
```

## When To Run

- Before and after each step in the jeff-dean-plan
- Before any PR that touches the hot path (manager, bridge, socket, SSE)
- Weekly in CI to catch regressions

## What Good Looks Like

| Metric | Bad | OK | Good |
|--------|-----|----|----- |
| Message overhead (p50) | >10ms | 3-10ms | <3ms |
| Concurrent sessions | <50 | 50-200 | >200 |
| Memory per sandbox | >10MB | 2-10MB | <2MB |
| Sandbox create (p50) | >2s | 0.5-2s | <500ms |
| Sandbox destroy (p50) | >1s | 200ms-1s | <200ms |

These numbers are for the mock SDK. With real Claude API calls, the SDK latency dominates and Ash overhead becomes irrelevant (as it should).
