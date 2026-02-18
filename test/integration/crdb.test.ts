import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { launchServer, waitForReady, type ServerHandle } from '../helpers/server-launcher.js';
import { launchCrdb, type CrdbHandle } from '../helpers/crdb-launcher.js';

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = isDockerAvailable();

/**
 * Integration test: exercises the full Ash lifecycle against a real
 * CockroachDB (Postgres-compatible) database running in Docker.
 *
 * Skipped when Docker is not available.
 */
describe.skipIf(!dockerAvailable)('crdb lifecycle', () => {
  let crdb: CrdbHandle;
  let server: ServerHandle;
  let testRoot: string;
  let agentDir: string;

  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'ash-crdb-'));
    agentDir = join(testRoot, 'test-agent');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test Agent\nBe helpful.');

    const crdbPort = 26257 + Math.floor(Math.random() * 900);
    const serverPort = 4100 + Math.floor(Math.random() * 900);

    console.log(`[crdb-test] Starting CockroachDB on port ${crdbPort}...`);
    crdb = await launchCrdb({ port: crdbPort });
    console.log(`[crdb-test] CockroachDB ready at ${crdb.url}`);

    console.log(`[crdb-test] Starting Ash server on port ${serverPort} with Postgres backend...`);
    server = await launchServer({
      port: serverPort,
      testRoot,
      extraEnv: { ASH_DATABASE_URL: crdb.url },
    });
    await waitForReady(server.url);
    console.log(`[crdb-test] Server ready at ${server.url}`);
  }, 120_000);

  afterAll(async () => {
    if (server) await server.stop();
    if (crdb) await crdb.stop();
    if (testRoot) rmSync(testRoot, { recursive: true, force: true });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', path: server.toServerPath(agentDir) }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.agent.name).toBe('test-agent');
    expect(body.agent.version).toBe(1);
  });

  it('lists the deployed agent', async () => {
    const res = await fetch(`${server.url}/api/agents`);
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].name).toBe('test-agent');
  });

  it('returns 404 for nonexistent agent', async () => {
    const res = await fetch(`${server.url}/api/agents/ghost`);
    expect(res.status).toBe(404);
  });

  it('creates a session', async () => {
    const res = await fetch(`${server.url}/api/sessions`, {
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
    expect(body.session.agentName).toBe('test-agent');
  });

  it('ends a session', async () => {
    const createRes = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test-agent' }),
    });
    const { session } = await createRes.json() as any;

    const deleteRes = await fetch(`${server.url}/api/sessions/${session.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as any;
    expect(body.session.status).toBe('ended');

    // Verify can't send to ended session
    const msgRes = await fetch(`${server.url}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello?' }),
    });
    expect(msgRes.status).toBe(400);
  }, 15_000);

  it('rejects session for nonexistent agent', async () => {
    const res = await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'ghost-agent' }),
    });
    expect(res.status).toBe(404);
  });

  it('re-deploys with incremented version', async () => {
    const res = await fetch(`${server.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', path: server.toServerPath(agentDir) }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.agent.version).toBe(2);
  });

  it('deletes an agent', async () => {
    const res = await fetch(`${server.url}/api/agents/test-agent`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const listRes = await fetch(`${server.url}/api/agents`);
    const body = await listRes.json() as any;
    expect(body.agents).toHaveLength(0);
  });
});
