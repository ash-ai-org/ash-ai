import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Session restore integration test: exercises all resume paths with real
 * server + real SDK in Docker (or native on Linux).
 *
 * Run: npx vitest run --config vitest.integration.config.ts test/integration/session-restore.test.ts
 */

const DOCKER_MOUNT_ROOT = '/mnt/test';
const PORT = 14300 + Math.floor(Math.random() * 700);
const AGENT_NAME = 'restore-test-agent';
let serverApiKey: string;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return serverApiKey ? { Authorization: `Bearer ${serverApiKey}` } : {};
}

async function post(url: string, body: object): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
}

async function createSession(url: string, agent: string): Promise<{ id: string; status: string }> {
  const res = await post(`${url}/api/sessions`, { agent });
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session;
}

async function getSession(url: string, sessionId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${url}/api/sessions/${sessionId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Get session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session;
}

async function pauseSession(url: string, sessionId: string): Promise<{ id: string; status: string }> {
  const res = await post(`${url}/api/sessions/${sessionId}/pause`, {});
  if (!res.ok) throw new Error(`Pause failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session;
}

async function resumeSession(url: string, sessionId: string): Promise<Response> {
  return post(`${url}/api/sessions/${sessionId}/resume`, {});
}

async function deleteSession(url: string, sessionId: string): Promise<Response> {
  return fetch(`${url}/api/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() });
}

async function deployAgent(url: string, name: string, path: string): Promise<void> {
  const res = await post(`${url}/api/agents`, { name, path });
  if (!res.ok) throw new Error(`Deploy agent failed (${res.status}): ${await res.text()}`);
}

async function deleteAgent(url: string, name: string): Promise<void> {
  const res = await fetch(`${url}/api/agents/${name}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 404) throw new Error(`Delete agent failed (${res.status}): ${await res.text()}`);
}

async function getHealth(url: string): Promise<any> {
  const res = await fetch(`${url}/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Send a message and drain the SSE stream. Returns all collected SSE event data.
 */
async function sendMessageAndCollect(
  url: string,
  sessionId: string,
  content: string,
): Promise<{ events: any[]; rawText: string }> {
  const res = await post(`${url}/api/sessions/${sessionId}/messages`, { content });
  if (!res.ok) throw new Error(`Message failed (${res.status}): ${await res.text()}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: any[] = [];
  let rawText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;

    // Parse SSE events from the chunk
    const lines = chunk.split('\n');
    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        try {
          events.push({ type: eventType, data: JSON.parse(line.slice(6)) });
        } catch { /* skip malformed */ }
        eventType = '';
      }
    }

    if (rawText.includes('event: done')) break;
  }

  return { events, rawText };
}

/** Send a message, drain the stream, return nothing. */
async function sendMessageAndDrain(url: string, sessionId: string, content: string): Promise<void> {
  await sendMessageAndCollect(url, sessionId, content);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Session restore', () => {
  let testRoot: string;
  let agentDst: string;
  let server: ServerHandle;
  let serverUrl: string;

  // Build extraEnv shared across server launches
  const useDocker = shouldUseDocker();

  function getExtraEnv(): Record<string, string> {
    const dataDir = useDocker ? `${DOCKER_MOUNT_ROOT}/data` : join(testRoot, 'data');
    return {
      ASH_DATA_DIR: dataDir,
    };
  }

  async function startAndDeploy(): Promise<void> {
    server = await launchServer({ port: PORT, testRoot, extraEnv: getExtraEnv() });
    serverUrl = server.url;
    serverApiKey = server.apiKey;
    await waitForReady(serverUrl);
    const agentPath = server.toServerPath(agentDst);
    await deployAgent(serverUrl, AGENT_NAME, agentPath);
  }

  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'ash-restore-test-'));
    mkdirSync(join(testRoot, 'data'), { recursive: true });

    const agentSrc = join(process.cwd(), 'examples/hosted-agent/agent');
    agentDst = join(testRoot, 'hosted-agent');
    cpSync(agentSrc, agentDst, { recursive: true });

    await startAndDeploy();
  }, 120_000);

  afterAll(async () => {
    if (server) await server.stop();
    rmSync(testRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Warm resume — sandbox alive
  // -------------------------------------------------------------------------
  it('warm resume — sandbox stays alive after pause', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);
    await sendMessageAndDrain(serverUrl, session.id, 'say hello');

    await pauseSession(serverUrl, session.id);

    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(200);
    const { session: resumed } = (await res.json()) as any;
    expect(resumed.status).toBe('active');

    // Can still send messages after resume
    await sendMessageAndDrain(serverUrl, session.id, 'say goodbye');

    // Check pool stats
    const health = await getHealth(serverUrl);
    expect(health.pool.resumeWarmHits).toBeGreaterThanOrEqual(1);

    // Cleanup
    await deleteSession(serverUrl, session.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 2. Warm resume — multiple cycles
  // -------------------------------------------------------------------------
  it('warm resume — survives 3 pause/resume cycles', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);
    await sendMessageAndDrain(serverUrl, session.id, 'hello');

    for (let i = 0; i < 3; i++) {
      await pauseSession(serverUrl, session.id);
      const res = await resumeSession(serverUrl, session.id);
      expect(res.status).toBe(200);
      const { session: resumed } = (await res.json()) as any;
      expect(resumed.status).toBe('active');
    }

    // Session still works
    await sendMessageAndDrain(serverUrl, session.id, 'still here?');

    await deleteSession(serverUrl, session.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 3. Cold resume — after server restart
  // -------------------------------------------------------------------------
  it('cold resume — session recovers after server restart', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);
    await sendMessageAndDrain(serverUrl, session.id, 'hello before restart');
    await pauseSession(serverUrl, session.id);

    // Restart server — all sandboxes die
    await server.stop();
    await startAndDeploy();

    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(200);
    const { session: resumed } = (await res.json()) as any;
    expect(resumed.status).toBe('active');

    // Can send messages after cold resume
    await sendMessageAndDrain(serverUrl, session.id, 'hello after restart');

    // Check pool stats for cold hit
    const health = await getHealth(serverUrl);
    expect(health.pool.resumeColdHits).toBeGreaterThanOrEqual(1);

    await deleteSession(serverUrl, session.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 4. Cold resume — file persistence across restart
  // -------------------------------------------------------------------------
  it('cold resume — files persist across server restart', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);

    // Ask the agent to create a marker file
    await sendMessageAndDrain(
      serverUrl,
      session.id,
      'Create a file called test-marker.txt with the exact content PERSIST_CHECK. Just create the file, nothing else.',
    );

    await pauseSession(serverUrl, session.id);

    // Restart server
    await server.stop();
    await startAndDeploy();

    // Resume the session (cold path — new sandbox but old workspace)
    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(200);

    // Ask the agent to read the file
    const { events } = await sendMessageAndCollect(
      serverUrl,
      session.id,
      'Read the file test-marker.txt and tell me its exact contents. Just output the contents.',
    );

    // Find text content in the response events
    const textContent = events
      .filter((e) => e.type === 'message' && e.data?.type === 'assistant')
      .flatMap((e) => {
        const content = e.data?.message?.content;
        if (!Array.isArray(content)) return [];
        return content.filter((b: any) => b.type === 'text').map((b: any) => b.text);
      })
      .join('');

    expect(textContent).toContain('PERSIST_CHECK');

    await deleteSession(serverUrl, session.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 5. Resume ended session — should 410
  // -------------------------------------------------------------------------
  it('resume ended session returns 410', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);
    await deleteSession(serverUrl, session.id);

    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(410);
    const body = (await res.json()) as any;
    expect(body.error).toContain('ended');
  }, 30_000);

  // -------------------------------------------------------------------------
  // 6. Resume nonexistent session — should 404
  // -------------------------------------------------------------------------
  it('resume nonexistent session returns 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await resumeSession(serverUrl, fakeId);
    expect(res.status).toBe(404);
  }, 10_000);

  // -------------------------------------------------------------------------
  // 7. Resume already active session — no-op
  // -------------------------------------------------------------------------
  it('resume already active session is a no-op', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);
    // Session is active — resume without pausing
    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(200);
    const { session: resumed } = (await res.json()) as any;
    expect(resumed.status).toBe('active');

    await deleteSession(serverUrl, session.id);
  }, 30_000);

  // -------------------------------------------------------------------------
  // 8. Resume after agent deleted — should 404
  // -------------------------------------------------------------------------
  it('resume after agent deleted returns 404', async () => {
    // Deploy a separate agent for this test so we can delete it
    const tempAgentName = 'restore-test-temp-agent';
    const agentPath = server.toServerPath(agentDst);
    await deployAgent(serverUrl, tempAgentName, agentPath);

    const session = await createSession(serverUrl, tempAgentName);
    await pauseSession(serverUrl, session.id);

    // Delete the agent
    await deleteAgent(serverUrl, tempAgentName);

    // Resume should fail with 404 because agent is gone
    const res = await resumeSession(serverUrl, session.id);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toContain('not found');
  }, 60_000);

  // -------------------------------------------------------------------------
  // 9. Pool stats reflect warm/cold counts
  // -------------------------------------------------------------------------
  it('pool stats show resume warm and cold hit counts', async () => {
    const health = await getHealth(serverUrl);
    expect(typeof health.pool.resumeWarmHits).toBe('number');
    expect(typeof health.pool.resumeColdHits).toBe('number');
    // We've done warm and cold resumes in prior tests
    expect(health.pool.resumeWarmHits).toBeGreaterThanOrEqual(1);
    expect(health.pool.resumeColdHits).toBeGreaterThanOrEqual(1);
  }, 10_000);
});
