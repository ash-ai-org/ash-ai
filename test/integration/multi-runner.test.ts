import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, type ServerHandle } from '../helpers/server-launcher.js';
import { launchRunner, waitForRunnerReady, type RunnerHandle } from '../helpers/runner-launcher.js';

/**
 * Integration test: coordinator + runner mode.
 *
 * Launches a coordinator (ASH_MODE=coordinator), one runner process,
 * then exercises the full lifecycle through the coordinator proxy:
 *   - Runner registration and health
 *   - Agent deployment
 *   - Session creation (routed to runner)
 *   - Message send + SSE stream through coordinator proxy
 *   - Graceful runner shutdown (sessions paused)
 *   - New runner joins (sessions route there)
 *
 * Runs directly (no Docker) on macOS/Linux.
 */
describe('multi-runner lifecycle', () => {
  let coordinator: ServerHandle;
  let runner1: RunnerHandle;
  let testRoot: string;
  let agentDir: string;

  const COORD_PORT = 14300 + Math.floor(Math.random() * 200);
  const RUNNER1_PORT = COORD_PORT + 100;
  const RUNNER2_PORT = COORD_PORT + 101;
  const INTERNAL_SECRET = 'test-secret-' + Date.now();

  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'ash-multi-runner-'));
    agentDir = join(testRoot, 'test-agent');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test Agent\nBe helpful.');

    const coordDataDir = join(testRoot, 'coord-data');
    mkdirSync(coordDataDir, { recursive: true });

    const runner1DataDir = join(testRoot, 'runner1-data');
    mkdirSync(runner1DataDir, { recursive: true });

    // Start coordinator (no local sandbox pool)
    // Force direct mode — coordinator doesn't need Docker (no sandbox creation),
    // and running in Docker would mean the runner can't reach it or the Docker image
    // may not have latest code.
    coordinator = await launchServer({
      port: COORD_PORT,
      testRoot,
      forceDirect: true,
      extraEnv: {
        ASH_MODE: 'coordinator',
        ASH_DATA_DIR: coordDataDir,
        ASH_INTERNAL_SECRET: INTERNAL_SECRET,
      },
    });
    await waitForReady(coordinator.url);

    // Start runner 1
    runner1 = launchRunner({
      runnerId: 'runner-1',
      port: RUNNER1_PORT,
      serverUrl: coordinator.url,
      maxSandboxes: 10,
      dataDir: runner1DataDir,
      internalSecret: INTERNAL_SECRET,
    });
    await waitForRunnerReady(runner1.url);

    // Wait for runner to register with coordinator (heartbeat takes a bit)
    await waitForRunnerRegistered(coordinator.url, 'runner-1');
  }, 60_000);

  afterAll(async () => {
    if (runner1) await runner1.stop();
    if (coordinator) await coordinator.stop();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('coordinator health shows remote runner', async () => {
    const res = await fetch(`${coordinator.url}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.remoteRunners).toBeGreaterThanOrEqual(1);
  });

  it('lists the registered runner', async () => {
    const res = await fetch(`${coordinator.url}/api/internal/runners`);
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.count).toBeGreaterThanOrEqual(1);
    const runner = body.runners.find((r: any) => r.runnerId === 'runner-1');
    expect(runner).toBeTruthy();
    expect(runner.port).toBe(RUNNER1_PORT);
  });

  it('rejects unauthenticated runner registration', async () => {
    const res = await fetch(`${coordinator.url}/api/internal/runners/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runnerId: 'rogue-runner',
        host: '127.0.0.1',
        port: 9999,
        maxSandboxes: 10,
      }),
    });
    expect(res.status).toBe(401);
  });

  it('deploys an agent via coordinator', async () => {
    const res = await fetch(`${coordinator.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', path: agentDir }),
    });
    expect(res.status).toBe(201);
  });

  it('creates a session routed to runner', async () => {
    const res = await fetch(`${coordinator.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const body = await res.json() as any;
    if (res.status !== 201) {
      console.error('Session creation failed:', body);
    }
    expect(res.status).toBe(201);
    expect(body.session.id).toBeTruthy();
    expect(body.session.status).toBe('active');
    expect(body.session.runnerId).toBe('runner-1');
  });

  it('sends a message through coordinator→runner proxy', async () => {
    // Create session
    const createRes = await fetch(`${coordinator.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const { session } = await createRes.json() as any;
    expect(createRes.status).toBe(201);

    // Send message — goes through coordinator proxy to runner
    const msgRes = await fetch(`${coordinator.url}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello through proxy!' }),
    });

    expect(msgRes.status).toBe(200);
    expect(msgRes.headers.get('content-type')).toContain('text/event-stream');

    const text = await msgRes.text();
    expect(text).toContain('event: done');

    // SSE stream should contain events — either granular (text_delta) or raw (message)
    const lines = text.split('\n');
    const eventLines = lines.filter((l) => l.startsWith('event: '));
    expect(eventLines.length).toBeGreaterThan(0);

    // Look for a message event with SDK data (type: 'assistant')
    const messageEvents: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'event: message' && i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
        messageEvents.push(JSON.parse(lines[i + 1].slice(6)));
      }
    }
    expect(messageEvents.length).toBeGreaterThan(0);
    expect(messageEvents[0].type).toBe('assistant');

    // Clean up
    await fetch(`${coordinator.url}/api/sessions/${session.id}`, { method: 'DELETE' });
  }, 15_000);

  it('pauses session when runner is stopped', async () => {
    // Create a session on runner-1
    const createRes = await fetch(`${coordinator.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const { session } = await createRes.json() as any;
    expect(session.status).toBe('active');
    expect(session.runnerId).toBe('runner-1');

    // Stop runner-1 gracefully (sends deregister)
    await runner1.stop();

    // Wait for deregistration to propagate
    await new Promise((r) => setTimeout(r, 1000));

    // Session should now be paused
    const getRes = await fetch(`${coordinator.url}/api/sessions/${session.id}`);
    const body = await getRes.json() as any;
    expect(body.session.status).toBe('paused');

    // Runner should be removed from registry
    const runnersRes = await fetch(`${coordinator.url}/api/internal/runners`);
    const runnersBody = await runnersRes.json() as any;
    const r1 = runnersBody.runners.find((r: any) => r.runnerId === 'runner-1');
    expect(r1).toBeUndefined();
  }, 15_000);

  it('new runner picks up new sessions after previous runner dies', async () => {
    const runner2DataDir = join(testRoot, 'runner2-data');
    mkdirSync(runner2DataDir, { recursive: true });

    // Start runner 2
    const runner2 = launchRunner({
      runnerId: 'runner-2',
      port: RUNNER2_PORT,
      serverUrl: coordinator.url,
      maxSandboxes: 10,
      dataDir: runner2DataDir,
      internalSecret: INTERNAL_SECRET,
    });

    try {
      await waitForRunnerReady(runner2.url);
      await waitForRunnerRegistered(coordinator.url, 'runner-2');

      // Create a new session — should route to runner-2
      const createRes = await fetch(`${coordinator.url}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'test-agent' }),
      });
      const { session } = await createRes.json() as any;
      expect(createRes.status).toBe(201);
      expect(session.runnerId).toBe('runner-2');

      // Send a message to verify full proxy works
      const msgRes = await fetch(`${coordinator.url}/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello runner 2!' }),
      });
      expect(msgRes.status).toBe(200);
      const text = await msgRes.text();
      expect(text).toContain('event: done');

      await fetch(`${coordinator.url}/api/sessions/${session.id}`, { method: 'DELETE' });
    } finally {
      await runner2.stop();
    }
  }, 30_000);

  it('rejects session creation when no runners available', async () => {
    // At this point, both runners are stopped
    const res = await fetch(`${coordinator.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    // Should fail since no runners are available in coordinator-only mode
    expect(res.status).toBe(503);
  });
});

/**
 * Wait for a specific runner to appear in the coordinator's registry.
 */
async function waitForRunnerRegistered(
  coordinatorUrl: string,
  runnerId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${coordinatorUrl}/api/internal/runners`);
      if (res.ok) {
        const body = await res.json() as any;
        if (body.runners?.some((r: any) => r.runnerId === runnerId)) {
          return;
        }
      }
    } catch {
      // coordinator not ready
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Runner ${runnerId} did not register within ${timeoutMs}ms`);
}
