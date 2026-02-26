import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Cross-sandbox isolation integration test.
 *
 * Verifies that one sandbox session cannot read another session's workspace
 * files. This is the most important security test — if it fails, agents can
 * exfiltrate data from other tenants' sessions.
 *
 * The test creates two sessions, writes a secret file in session A's workspace,
 * then tries to read it from session B using the exec API. The read must fail.
 *
 * Run:
 *   pnpm test:integration test/integration/sandbox-isolation.test.ts
 */

const PORT = 14700 + Math.floor(Math.random() * 200);
const AGENT_NAME = 'isolation-agent';
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

async function deployAgent(baseUrl: string, name: string, path: string): Promise<void> {
  const res = await post(`${baseUrl}/api/agents`, { name, path });
  if (!res.ok) throw new Error(`Deploy agent failed (${res.status}): ${await res.text()}`);
}

async function createSession(baseUrl: string, agent: string): Promise<{ id: string; sandboxId: string }> {
  const res = await post(`${baseUrl}/api/sessions`, { agent });
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session;
}

async function execInSession(
  baseUrl: string,
  sessionId: string,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const res = await post(`${baseUrl}/api/sessions/${sessionId}/exec`, { command, timeout: 10000 });
  if (!res.ok) throw new Error(`Exec failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { exitCode: number; stdout: string; stderr: string };
}

async function deleteSession(baseUrl: string, sessionId: string): Promise<void> {
  await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cross-sandbox isolation', () => {
  let server: ServerHandle;
  let testRoot: string;
  let agentDir: string;

  let sessionA: { id: string; sandboxId: string };
  let sessionB: { id: string; sandboxId: string };

  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'ash-iso-'));
    agentDir = join(testRoot, 'isolation-agent');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Isolation Test Agent\nYou are a test agent.');

    if (shouldUseDocker()) {
      console.log('[test] Using Docker (macOS detected)');
    } else {
      console.log('[test] Using direct mode (Linux or no Docker)');
    }

    server = await launchServer({ port: PORT, testRoot });
    serverApiKey = server.apiKey;
    await waitForReady(server.url);

    // Deploy agent
    await deployAgent(server.url, AGENT_NAME, server.toServerPath(agentDir));

    // Create two sessions
    sessionA = await createSession(server.url, AGENT_NAME);
    sessionB = await createSession(server.url, AGENT_NAME);

    console.log(`[test] Session A: ${sessionA.id} (sandbox: ${sessionA.sandboxId})`);
    console.log(`[test] Session B: ${sessionB.id} (sandbox: ${sessionB.sandboxId})`);

    // Write a secret file into session A's workspace
    const writeResult = await execInSession(
      server.url,
      sessionA.id,
      'echo "TOP_SECRET_DATA_a1b2c3" > secret.txt && echo ok',
    );
    expect(writeResult.exitCode).toBe(0);
    expect(writeResult.stdout.trim()).toBe('ok');
  }, 120_000);

  afterAll(async () => {
    if (sessionA) await deleteSession(server.url, sessionA.id).catch(() => {});
    if (sessionB) await deleteSession(server.url, sessionB.id).catch(() => {});
    if (server) await server.stop();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('session A can read its own secret file', async () => {
    const result = await execInSession(server.url, sessionA.id, 'cat secret.txt');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TOP_SECRET_DATA_a1b2c3');
  });

  it('session B cannot read session A workspace via absolute path', async () => {
    // First, discover session A's workspace path from session A itself
    const pwdResult = await execInSession(server.url, sessionA.id, 'pwd');
    const aWorkspace = pwdResult.stdout.trim();
    console.log(`[test] Session A workspace: ${aWorkspace}`);

    // Now try to read session A's secret from session B
    const result = await execInSession(
      server.url,
      sessionB.id,
      `cat ${aWorkspace}/secret.txt`,
    );

    // This MUST fail — if it succeeds, sandbox isolation is broken
    const leaked = result.exitCode === 0 && result.stdout.includes('TOP_SECRET_DATA_a1b2c3');
    expect(leaked).toBe(false);
  });

  it('session B cannot list the sandboxes directory', async () => {
    // Get the sandboxes parent directory from session A's workspace path
    const pwdResult = await execInSession(server.url, sessionA.id, 'pwd');
    const aWorkspace = pwdResult.stdout.trim();
    // workspace is at <sandboxesDir>/<id>/workspace, so parent of parent is sandboxesDir
    const sandboxesDir = aWorkspace.replace(/\/[^/]+\/workspace$/, '');
    console.log(`[test] Sandboxes dir: ${sandboxesDir}`);

    // Try to list all sandbox directories from session B
    const result = await execInSession(server.url, sessionB.id, `ls ${sandboxesDir}`);

    // Should not be able to list other sandbox IDs
    const canSeeOtherSandbox = result.exitCode === 0 && result.stdout.includes(sessionA.sandboxId);
    expect(canSeeOtherSandbox).toBe(false);
  });

  it('session B cannot traverse to parent directories and find other workspaces', async () => {
    // Try various path traversal attacks from session B
    const attacks = [
      // Relative traversal from workspace
      'ls ../../',
      // Reading /etc/passwd (host file access)
      'cat /etc/hostname',
      // Enumerate /tmp for socket files
      'ls /tmp/ash-*.sock 2>/dev/null',
    ];

    for (const attack of attacks) {
      const result = await execInSession(server.url, sessionB.id, attack);
      // The traversal to parent sandboxes dir should fail
      if (attack === 'ls ../../') {
        const canSeeOtherSandbox = result.exitCode === 0 && result.stdout.includes(sessionA.sandboxId);
        expect(canSeeOtherSandbox).toBe(false);
      }
    }
  });

  it('session B cannot write to session A workspace', async () => {
    const pwdResult = await execInSession(server.url, sessionA.id, 'pwd');
    const aWorkspace = pwdResult.stdout.trim();

    // Try to write a file into session A's workspace from session B
    const result = await execInSession(
      server.url,
      sessionB.id,
      `echo "HACKED" > ${aWorkspace}/hacked.txt 2>&1; echo "exit:$?"`,
    );

    // Either the command should fail, or the file should not exist in A's workspace
    const verifyResult = await execInSession(server.url, sessionA.id, 'cat hacked.txt 2>&1');
    const wasHacked = verifyResult.exitCode === 0 && verifyResult.stdout.includes('HACKED');
    expect(wasHacked).toBe(false);
  });
});
