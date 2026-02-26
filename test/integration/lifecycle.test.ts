import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Integration test: starts the real server (directly on Linux, in Docker on
 * macOS), deploys an agent, creates a session, sends a message, receives SSE
 * stream, ends the session.
 */
describe('full lifecycle', () => {
  let server: ServerHandle;
  let testRoot: string;
  let agentDir: string;
  let auth: Record<string, string>;

  beforeAll(async () => {
    // All test dirs under one root — single Docker volume mount
    testRoot = mkdtempSync(join(tmpdir(), 'ash-int-'));
    agentDir = join(testRoot, 'test-agent');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test Agent\nBe helpful.');

    const port = 4100 + Math.floor(Math.random() * 900);

    if (shouldUseDocker()) {
      console.log('[test] Using Docker (macOS detected)');
    } else {
      console.log('[test] Using direct mode (Linux or no Docker)');
    }

    server = await launchServer({ port, testRoot });
    await waitForReady(server.url);
    auth = { Authorization: `Bearer ${server.apiKey}` };
  }, 120_000); // generous timeout for first-time Docker image build

  afterAll(async () => {
    if (server) await server.stop();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('health endpoint returns ok', async () => {
    const res = await fetch(`${server.url}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
  });

  it('deploys an agent', async () => {
    const res = await fetch(`${server.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'test-agent', path: server.toServerPath(agentDir) }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.agent.name).toBe('test-agent');
    expect(body.agent.version).toBe(1);
  });

  it('lists the deployed agent', async () => {
    const res = await fetch(`${server.url}/api/agents`, { headers: auth });
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].name).toBe('test-agent');
  });

  it('returns 404 for nonexistent agent', async () => {
    const res = await fetch(`${server.url}/api/agents/ghost`, { headers: auth });
    expect(res.status).toBe(404);
  });

  it('rejects agent without CLAUDE.md', async () => {
    const emptyDir = join(testRoot, 'empty-agent');
    mkdirSync(emptyDir, { recursive: true });
    const res = await fetch(`${server.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'bad-agent', path: server.toServerPath(emptyDir) }),
    });
    expect(res.status).toBe(400);
  });

  it('creates a session', async () => {
    const res = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const body = await res.json() as any;
    if (res.status !== 201) {
      console.error('Session creation failed:', body);
    }
    expect(res.status).toBe(201);
    expect(body.session.id).toBeTruthy();
    expect(body.session.status).toBe('active');
    expect(body.session.agentName).toBe('test-agent');
  });

  it('sends a message and receives SSE stream', async () => {
    // Create session
    const createRes = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const { session } = await createRes.json() as any;

    // Send message
    const msgRes = await fetch(`${server.url}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ content: 'Hello, agent!' }),
    });

    expect(msgRes.status).toBe(200);
    expect(msgRes.headers.get('content-type')).toContain('text/event-stream');

    const text = await msgRes.text();

    // Should contain SSE events
    expect(text).toContain('event: message');
    expect(text).toContain('event: done');

    // Message data should contain SDK-shaped objects
    const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThan(0);

    // Parse first data line — should be an SDK assistant message
    const firstData = JSON.parse(dataLines[0].slice(6));
    expect(firstData.type).toBe('assistant');
  }, 15_000);

  it('rejects message to nonexistent session', async () => {
    const res = await fetch(`${server.url}/api/sessions/ghost/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(res.status).toBe(404);
  });

  it('ends a session', async () => {
    const createRes = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const { session } = await createRes.json() as any;

    const deleteRes = await fetch(`${server.url}/api/sessions/${session.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as any;
    expect(body.session.status).toBe('ended');

    // Verify can't send to ended session
    const msgRes = await fetch(`${server.url}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ content: 'hello?' }),
    });
    expect(msgRes.status).toBe(400);
  }, 15_000);

  it('rejects session for nonexistent agent', async () => {
    const res = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ agent: 'ghost-agent' }),
    });
    expect(res.status).toBe(404);
  });

  it('re-deploys with incremented version', async () => {
    const res = await fetch(`${server.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'test-agent', path: server.toServerPath(agentDir) }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.agent.version).toBe(2);
  });

  it('deletes an agent', async () => {
    const res = await fetch(`${server.url}/api/agents/test-agent`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(res.status).toBe(200);

    const listRes = await fetch(`${server.url}/api/agents`, { headers: auth });
    const body = await listRes.json() as any;
    expect(body.agents).toHaveLength(0);
  });
});
