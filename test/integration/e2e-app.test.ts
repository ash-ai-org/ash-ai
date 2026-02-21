import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AshClient } from '../../packages/sdk/src/index.js';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * E2E test: exercises the Ash SDK and CLI from the perspective of an
 * external application. Uses the real AshClient class and CLI binary.
 *
 * Covers: streaming, multi-turn conversations, concurrent sessions, CLI
 * commands — things the basic lifecycle test does not.
 */

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let server: ServerHandle;
let testRoot: string;
let agentDir: string;
let client: AshClient;
let cliEnv: Record<string, string>;
const cliPath = join(process.cwd(), 'packages/cli/dist/index.js');

beforeAll(async () => {
  testRoot = mkdtempSync(join(tmpdir(), 'ash-e2e-'));

  agentDir = join(testRoot, 'qa-agent');
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, 'CLAUDE.md'), '# QA Agent\nAnswer questions concisely.');

  const port = 4200 + Math.floor(Math.random() * 800);

  if (shouldUseDocker()) {
    console.log('[e2e-test] Using Docker mode');
  } else {
    console.log('[e2e-test] Using direct mode');
  }

  server = await launchServer({ port, testRoot });
  await waitForReady(server.url);

  client = new AshClient({ serverUrl: server.url });
  cliEnv = { ...process.env, ASH_SERVER_URL: server.url };
}, 120_000);

afterAll(async () => {
  if (server) await server.stop();
  rmSync(testRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: run CLI command
// ---------------------------------------------------------------------------

function cli(args: string): string {
  return execSync(`node ${cliPath} ${args}`, {
    env: cliEnv,
    timeout: 15_000,
  }).toString().trim();
}

// ---------------------------------------------------------------------------
// SDK Tests
// ---------------------------------------------------------------------------

describe('SDK application', () => {
  it('checks server health', async () => {
    const health = await client.health();
    expect(health.status).toBe('ok');
    expect(typeof health.uptime).toBe('number');
  });

  it('deploys an agent', async () => {
    const agent = await client.deployAgent('sdk-agent', server.toServerPath(agentDir));
    expect(agent.name).toBe('sdk-agent');
    expect(agent.version).toBe(1);
  });

  it('lists and gets agent details', async () => {
    const agents = await client.listAgents();
    expect(agents.find((a) => a.name === 'sdk-agent')).toBeTruthy();

    const agent = await client.getAgent('sdk-agent');
    expect(agent.name).toBe('sdk-agent');
    expect(agent.version).toBe(1);
  });

  it('creates a session and retrieves it', async () => {
    const session = await client.createSession('sdk-agent');
    expect(session.id).toBeTruthy();
    expect(session.status).toBe('active');
    expect(session.agentName).toBe('sdk-agent');

    const fetched = await client.getSession(session.id);
    expect(fetched.id).toBe(session.id);

    await client.endSession(session.id);
  });

  it('streams a response via sendMessageStream', async () => {
    const session = await client.createSession('sdk-agent');

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const event of client.sendMessageStream(session.id, 'What is 2+2?')) {
      events.push(event);
    }

    const messageEvents = events.filter((e) => e.type === 'message');
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(messageEvents.length).toBeGreaterThan(0);
    expect(doneEvents).toHaveLength(1);

    // First message is an assistant message (SDK passthrough)
    expect((messageEvents[0].data as any).type).toBe('assistant');

    await client.endSession(session.id);
  }, 15_000);

  it('multi-turn conversation in same session', async () => {
    const session = await client.createSession('sdk-agent');

    // Turn 1
    const events1: Array<{ type: string; data: unknown }> = [];
    for await (const ev of client.sendMessageStream(session.id, 'Hello')) {
      events1.push(ev);
    }
    expect(events1.some((e) => e.type === 'done')).toBe(true);

    // Turn 2 — same session, conversation continues
    const events2: Array<{ type: string; data: unknown }> = [];
    for await (const ev of client.sendMessageStream(session.id, 'Follow up question')) {
      events2.push(ev);
    }
    expect(events2.some((e) => e.type === 'done')).toBe(true);

    // Done event carries the session ID
    const done = events2.find((e) => e.type === 'done');
    expect((done?.data as any).sessionId).toBe(session.id);

    await client.endSession(session.id);
  }, 15_000);

  it('multi-turn conversation preserves history in mock bridge', async () => {
    const session = await client.createSession('sdk-agent');

    // Helper to extract assistant text from a stream
    const getAssistantText = async (sessionId: string, message: string): Promise<string> => {
      const events: Array<{ type: string; data: unknown }> = [];
      for await (const ev of client.sendMessageStream(sessionId, message)) {
        events.push(ev);
      }
      const assistantEvent = events.find(
        (e) => e.type === 'message' && (e.data as any).type === 'assistant',
      );
      const content = (assistantEvent?.data as any)?.message?.content;
      return content?.[0]?.text ?? '';
    };

    // Turn 1
    const text1 = await getAssistantText(session.id, 'first question');
    expect(text1).toContain('Turn 1');
    expect(text1).toContain('first question');
    expect(text1).not.toContain('second question');

    // Turn 2 — should see both prompts in history
    const text2 = await getAssistantText(session.id, 'second question');
    expect(text2).toContain('Turn 2');
    expect(text2).toContain('first question');
    expect(text2).toContain('second question');

    // Turn 3 — full history
    const text3 = await getAssistantText(session.id, 'third question');
    expect(text3).toContain('Turn 3');
    expect(text3).toContain('first question');
    expect(text3).toContain('second question');
    expect(text3).toContain('third question');

    await client.endSession(session.id);
  }, 20_000);

  it('separate sessions have independent history', async () => {
    const s1 = await client.createSession('sdk-agent');
    const s2 = await client.createSession('sdk-agent');

    const getAssistantText = async (sessionId: string, message: string): Promise<string> => {
      const events: Array<{ type: string; data: unknown }> = [];
      for await (const ev of client.sendMessageStream(sessionId, message)) {
        events.push(ev);
      }
      const assistantEvent = events.find(
        (e) => e.type === 'message' && (e.data as any).type === 'assistant',
      );
      return (assistantEvent?.data as any)?.message?.content?.[0]?.text ?? '';
    };

    // Send to session 1
    await getAssistantText(s1.id, 'session-one-msg');

    // Send to session 2 — should NOT see session 1's history
    const text2 = await getAssistantText(s2.id, 'session-two-msg');
    expect(text2).toContain('Turn 1');
    expect(text2).toContain('session-two-msg');
    expect(text2).not.toContain('session-one-msg');

    await Promise.all([client.endSession(s1.id), client.endSession(s2.id)]);
  }, 20_000);

  it('concurrent sessions to the same agent', async () => {
    const [s1, s2] = await Promise.all([
      client.createSession('sdk-agent'),
      client.createSession('sdk-agent'),
    ]);
    expect(s1.id).not.toBe(s2.id);

    // Send messages concurrently
    const collect = async (sid: string, msg: string) => {
      const events: Array<{ type: string; data: unknown }> = [];
      for await (const ev of client.sendMessageStream(sid, msg)) {
        events.push(ev);
      }
      return events;
    };

    const [ev1, ev2] = await Promise.all([
      collect(s1.id, 'Session 1'),
      collect(s2.id, 'Session 2'),
    ]);

    expect(ev1.some((e) => e.type === 'done')).toBe(true);
    expect(ev2.some((e) => e.type === 'done')).toBe(true);

    // Both appear in session list
    const sessions = await client.listSessions();
    const activeIds = sessions.filter((s) => s.status === 'active').map((s) => s.id);
    expect(activeIds).toContain(s1.id);
    expect(activeIds).toContain(s2.id);

    await Promise.all([client.endSession(s1.id), client.endSession(s2.id)]);
  }, 20_000);

  it('rejects messages to ended sessions', async () => {
    const session = await client.createSession('sdk-agent');
    await client.endSession(session.id);

    await expect(client.sendMessage(session.id, 'hello?')).rejects.toThrow();
  });

  it('rejects session for nonexistent agent', async () => {
    await expect(client.createSession('ghost-agent')).rejects.toThrow();
  });

  it('redeploys with version bump', async () => {
    const agent = await client.deployAgent('sdk-agent', server.toServerPath(agentDir));
    expect(agent.version).toBe(2);
  });

  it('deletes agent', async () => {
    await client.deleteAgent('sdk-agent');
    const agents = await client.listAgents();
    expect(agents.find((a) => a.name === 'sdk-agent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CLI Tests
// ---------------------------------------------------------------------------

describe('CLI application', () => {
  it('checks health via CLI', () => {
    const output = cli('health');
    expect(output).toContain('"status"');
    expect(output).toContain('ok');
  });

  it('deploys agent via CLI', () => {
    const agentPath = server.toServerPath(agentDir);
    const output = cli(`deploy ${agentPath} --name cli-agent`);
    expect(output).toContain('cli-agent');
  });

  it('lists agents via CLI', () => {
    const output = cli('agent list');
    expect(output).toContain('cli-agent');
  });

  it('gets agent info via CLI', () => {
    const output = cli('agent info cli-agent');
    expect(output).toContain('cli-agent');
  });

  it('full CLI session workflow: create → send → end', () => {
    // Create
    const createOut = cli('session create cli-agent');
    expect(createOut).toContain('Session created');
    const idMatch = createOut.match(/"id":\s*"([^"]+)"/);
    expect(idMatch).toBeTruthy();
    const sessionId = idMatch![1];

    // Send message — output should contain the SSE-parsed events
    const sendOut = cli(`session send ${sessionId} "What is Ash?"`);
    expect(sendOut).toContain('assistant');

    // End
    const endOut = cli(`session end ${sessionId}`);
    expect(endOut).toContain('ended');
  }, 15_000);

  it('lists sessions via CLI', () => {
    const output = cli('session list');
    // Should contain at least one session (from the workflow above)
    expect(output).toContain('cli-agent');
  });

  it('deletes agent via CLI', () => {
    const output = cli('agent delete cli-agent');
    expect(output).toContain('Deleted');

    const listOut = cli('agent list');
    expect(listOut).not.toContain('cli-agent');
  });
});
