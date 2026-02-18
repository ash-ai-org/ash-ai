# Integration Tests

Integration tests verify that components work together across process and protocol boundaries. Each test starts real processes and makes real HTTP/socket calls.

## Test Infrastructure

### Test harness

A reusable harness that starts the server (and co-located runner), waits for readiness, and tears down cleanly.

```typescript
// test/helpers/harness.ts

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface TestHarness {
  serverUrl: string;
  dataDir: string;
  stop: () => Promise<void>;
}

export async function startTestHarness(): Promise<TestHarness> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ash-integration-'));
  const agentsDir = join(dataDir, 'agents');
  const sandboxesDir = join(dataDir, 'sandboxes');
  await mkdir(agentsDir, { recursive: true });
  await mkdir(sandboxesDir, { recursive: true });

  // Find a free port
  const port = 4100 + Math.floor(Math.random() * 1000);

  // Start runner
  const runner = spawn('node', ['packages/runner/dist/index.js'], {
    env: {
      ...process.env,
      ASH_RUNNER_PORT: String(port + 100),
      ASH_SANDBOXES_DIR: sandboxesDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Start server
  const server = spawn('node', ['packages/server/dist/index.js'], {
    env: {
      ...process.env,
      ASH_SERVER_PORT: String(port),
      ASH_AGENTS_DIR: agentsDir,
      ASH_RUNNER_URL: `http://localhost:${port + 100}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for both to be ready
  await waitForReady(`http://localhost:${port}/health`);
  await waitForReady(`http://localhost:${port + 100}/health`);

  return {
    serverUrl: `http://localhost:${port}`,
    dataDir,
    stop: async () => {
      server.kill('SIGTERM');
      runner.kill('SIGTERM');
      await Promise.all([
        new Promise((resolve) => server.on('exit', resolve)),
        new Promise((resolve) => runner.on('exit', resolve)),
      ]);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function waitForReady(url: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}
```

## Test: Full Agent Lifecycle

Deploy an agent, verify it's listed, delete it.

```typescript
// test/integration/agent-lifecycle.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestHarness, type TestHarness } from '../helpers/harness.js';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Agent lifecycle', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startTestHarness();
  }, 30_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('deploys an agent via JSON path mode', async () => {
    // Create agent dir
    const agentDir = await mkdtemp(join(tmpdir(), 'ash-test-agent-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Test Agent\nBe helpful.');

    // Deploy
    const res = await fetch(`${harness.serverUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', path: agentDir }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agent.name).toBe('test-agent');
    expect(body.agent.version).toBe(1);
  });

  it('lists the deployed agent', async () => {
    const res = await fetch(`${harness.serverUrl}/api/agents`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].name).toBe('test-agent');
  });

  it('gets agent by name', async () => {
    const res = await fetch(`${harness.serverUrl}/api/agents/test-agent`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agent.name).toBe('test-agent');
  });

  it('returns 404 for nonexistent agent', async () => {
    const res = await fetch(`${harness.serverUrl}/api/agents/nope`);
    expect(res.status).toBe(404);
  });

  it('re-deploys with incremented version', async () => {
    const agentDir = await mkdtemp(join(tmpdir(), 'ash-test-agent-v2-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Test Agent v2');

    const res = await fetch(`${harness.serverUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', path: agentDir }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agent.version).toBe(2);
  });

  it('deletes an agent', async () => {
    const res = await fetch(`${harness.serverUrl}/api/agents/test-agent`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const listRes = await fetch(`${harness.serverUrl}/api/agents`);
    const body = await listRes.json();
    expect(body.agents).toHaveLength(0);
  });

  it('rejects agent without CLAUDE.md', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'ash-empty-'));

    const res = await fetch(`${harness.serverUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad-agent', path: emptyDir }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid');
  });
});
```

## Test: Session Lifecycle

Create a session, send a message, receive streamed response, end session.

```typescript
// test/integration/session-lifecycle.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestHarness, type TestHarness } from '../helpers/harness.js';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Session lifecycle', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startTestHarness();

    // Deploy a test agent
    const agentDir = await mkdtemp(join(tmpdir(), 'ash-session-test-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Session Test Agent');
    await fetch(`${harness.serverUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'session-agent', path: agentDir }),
    });
  }, 30_000);

  afterAll(async () => {
    await harness.stop();
  });

  it('creates a session', async () => {
    const res = await fetch(`${harness.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'session-agent' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.id).toBeTruthy();
    expect(body.session.status).toBe('active');
    expect(body.session.agentName).toBe('session-agent');
  });

  it('sends a message and receives streamed SSE response', async () => {
    // Create session
    const createRes = await fetch(`${harness.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'session-agent' }),
    });
    const { session } = await createRes.json();

    // Send message
    const msgRes = await fetch(`${harness.serverUrl}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, agent!' }),
    });

    expect(msgRes.status).toBe(200);
    expect(msgRes.headers.get('content-type')).toContain('text/event-stream');

    // Parse SSE stream
    const text = await msgRes.text();
    expect(text).toContain('event:');
    expect(text).toContain('data:');

    // Should contain at least an assistant message and done event
    expect(text).toMatch(/event:\s*(assistant_message|result)/);
    expect(text).toMatch(/event:\s*done/);
  });

  it('lists sessions', async () => {
    const res = await fetch(`${harness.serverUrl}/api/sessions`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessions.length).toBeGreaterThan(0);
  });

  it('ends a session', async () => {
    const createRes = await fetch(`${harness.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'session-agent' }),
    });
    const { session } = await createRes.json();

    const deleteRes = await fetch(`${harness.serverUrl}/api/sessions/${session.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    // Verify status is ended
    const getRes = await fetch(`${harness.serverUrl}/api/sessions/${session.id}`);
    const body = await getRes.json();
    expect(body.session.status).toBe('ended');
  });

  it('rejects session for nonexistent agent', async () => {
    const res = await fetch(`${harness.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'ghost-agent' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects message to ended session', async () => {
    const createRes = await fetch(`${harness.serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'session-agent' }),
    });
    const { session } = await createRes.json();

    await fetch(`${harness.serverUrl}/api/sessions/${session.id}`, { method: 'DELETE' });

    const msgRes = await fetch(`${harness.serverUrl}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello?' }),
    });
    expect(msgRes.status).toBe(500); // Session is ended
  });
});
```

## Test: Bridge Communication

Verify the runner can spawn a bridge process and communicate over Unix socket.

```typescript
// test/integration/bridge-comm.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SandboxManager } from '@anthropic-ai/ash-runner/sandbox/manager';

describe('Bridge communication', () => {
  let sandboxesDir: string;
  let agentDir: string;
  let manager: SandboxManager;

  beforeAll(async () => {
    sandboxesDir = await mkdtemp(join(tmpdir(), 'ash-bridge-test-'));
    agentDir = await mkdtemp(join(tmpdir(), 'ash-agent-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Bridge Test Agent');

    manager = new SandboxManager({
      sandboxesDir,
      bridgeEntryPoint: join(process.cwd(), 'packages/bridge/dist/index.js'),
    });
  });

  afterAll(async () => {
    await manager.destroyAll();
    await rm(sandboxesDir, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  });

  it('creates a sandbox and connects to bridge', async () => {
    const info = await manager.createSandbox({
      agentName: 'test',
      agentDir,
      sessionId: 'test-session-1',
    });

    expect(info.id).toBeTruthy();
    expect(info.state).toBe('active');

    const client = manager.getBridgeClient(info.id);
    expect(client).not.toBeNull();
    expect(client!.isConnected).toBe(true);

    await manager.destroySandbox(info.id);
  }, 15_000);

  it('sends query and receives events', async () => {
    const info = await manager.createSandbox({
      agentName: 'test',
      agentDir,
      sessionId: 'test-session-2',
    });

    const client = manager.getBridgeClient(info.id)!;
    const events = await client.sendAndStream({
      action: 'query',
      message: 'Hello bridge!',
      sessionId: 'test-session-2',
    });

    const collected = [];
    for await (const event of events) {
      collected.push(event);
      if (event.type === 'done' || event.type === 'error') break;
    }

    expect(collected.length).toBeGreaterThan(0);
    expect(collected[collected.length - 1].type).toBe('done');

    await manager.destroySandbox(info.id);
  }, 15_000);

  it('handles sandbox destroy while query in progress', async () => {
    const info = await manager.createSandbox({
      agentName: 'test',
      agentDir,
      sessionId: 'test-session-3',
    });

    const client = manager.getBridgeClient(info.id)!;

    // Start a query but destroy before it finishes
    const eventsPromise = client.sendAndStream({
      action: 'query',
      message: 'This will be interrupted',
      sessionId: 'test-session-3',
    });

    // Kill immediately
    await manager.destroySandbox(info.id);

    // The stream should end (not hang)
    const events = await eventsPromise;
    const collected = [];
    try {
      for await (const event of events) {
        collected.push(event);
      }
    } catch {
      // Expected — socket closed
    }

    // Should not hang or throw unhandled
  }, 15_000);
});
```

## Running Integration Tests

Integration tests are slower (they start processes) and should be separate from unit tests:

```bash
# Unit tests only (fast, <5s)
pnpm test

# Integration tests (slower, ~30s)
pnpm test:integration

# Everything
pnpm test:all
```

In root `package.json`:
```json
{
  "scripts": {
    "test": "pnpm -r test",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:all": "pnpm test && pnpm test:integration"
  }
}
```
