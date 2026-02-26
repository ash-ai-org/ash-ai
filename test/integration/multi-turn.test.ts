import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Multi-turn conversation persistence integration test.
 *
 * Verifies that sending multiple messages to the same session preserves
 * conversation context — the agent should remember earlier turns.
 *
 * With mock SDK (default):
 *   - Verifies the bridge correctly sets resume=true on subsequent queries
 *   - Verifies separate sessions have independent resume tracking
 *
 * With real SDK (ASH_REAL_SDK=1 + ANTHROPIC_API_KEY):
 *   - Verifies the agent actually remembers information from earlier turns
 *   - Verifies session isolation — session A doesn't know session B's info
 *
 * Run:
 *   pnpm test:integration test/integration/multi-turn.test.ts
 *   ASH_REAL_SDK=1 pnpm test:integration test/integration/multi-turn.test.ts
 */

const PORT = 14400 + Math.floor(Math.random() * 500);
const AGENT_NAME = 'multi-turn-agent';
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

async function deployAgent(url: string, name: string, path: string): Promise<void> {
  const res = await post(`${url}/api/agents`, { name, path });
  if (!res.ok) throw new Error(`Deploy agent failed (${res.status}): ${await res.text()}`);
}

async function createSession(url: string, agent: string): Promise<{ id: string }> {
  const res = await post(`${url}/api/sessions`, { agent });
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  const { session } = (await res.json()) as any;
  return session;
}

async function deleteSession(url: string, sessionId: string): Promise<void> {
  await fetch(`${url}/api/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() });
}

/**
 * Send a message and collect all SSE events.
 * Returns parsed events and extracted assistant text content.
 */
async function sendMessage(
  url: string,
  sessionId: string,
  content: string,
): Promise<{ events: any[]; text: string; rawText: string }> {
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
        } catch {
          /* skip malformed */
        }
        eventType = '';
      }
    }

    if (rawText.includes('event: done')) break;
  }

  // Extract assistant text from message events
  const text = events
    .filter((e) => e.type === 'message' && e.data?.type === 'assistant')
    .flatMap((e) => {
      const content = e.data?.message?.content;
      if (!Array.isArray(content)) return [];
      return content.filter((b: any) => b.type === 'text').map((b: any) => b.text);
    })
    .join('');

  return { events, text, rawText };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Multi-turn conversation persistence', () => {
  let testRoot: string;
  let agentDir: string;
  let server: ServerHandle;
  let serverUrl: string;
  const useRealSdk = process.env.ASH_REAL_SDK === '1';

  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'ash-multi-turn-'));
    mkdirSync(join(testRoot, 'data'), { recursive: true });

    // Create a minimal test agent
    agentDir = join(testRoot, 'agent');
    mkdirSync(agentDir);
    writeFileSync(
      join(agentDir, 'CLAUDE.md'),
      [
        '# Test Agent',
        'You are a test agent. Remember everything the user tells you.',
        'When asked to recall information, provide it exactly as given.',
        'Keep responses short and direct.',
      ].join('\n'),
    );

    const extraEnv: Record<string, string> = {
      ASH_DATA_DIR: shouldUseDocker() ? '/mnt/test/data' : join(testRoot, 'data'),
    };
    if (useRealSdk) {
      extraEnv.ASH_REAL_SDK = '1';
      if (process.env.ANTHROPIC_API_KEY) {
        extraEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      }
    } else {
      // Docker image has ASH_REAL_SDK=1 baked in — override to force mock
      extraEnv.ASH_REAL_SDK = '0';
    }

    server = await launchServer({ port: PORT, testRoot, extraEnv });
    serverUrl = server.url;
    serverApiKey = server.apiKey;
    await waitForReady(serverUrl);

    const agentPath = server.toServerPath(agentDir);
    await deployAgent(serverUrl, AGENT_NAME, agentPath);
  }, 120_000);

  afterAll(async () => {
    if (server) await server.stop();
    rmSync(testRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Basic multi-turn — bridge sets resume on 2nd message
  // -------------------------------------------------------------------------
  it('bridge sets resume flag on subsequent queries', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);

    // Turn 1 — should NOT be a resume
    const turn1 = await sendMessage(serverUrl, session.id, 'Hello my name is ALPHA');
    expect(turn1.text).toBeTruthy();
    if (!useRealSdk) {
      expect(turn1.text).toContain('[Mock]');
      expect(turn1.text).not.toContain('[Resumed');
    }

    // Turn 2 — SHOULD be a resume
    const turn2 = await sendMessage(serverUrl, session.id, 'What is my name?');
    expect(turn2.text).toBeTruthy();
    if (!useRealSdk) {
      expect(turn2.text).toContain('[Resumed session]');
    }

    await deleteSession(serverUrl, session.id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // 2. Three turns maintain correct resume state
  // -------------------------------------------------------------------------
  it('resume flag persists correctly across 3 turns', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);

    const t1 = await sendMessage(serverUrl, session.id, 'Turn one');
    const t2 = await sendMessage(serverUrl, session.id, 'Turn two');
    const t3 = await sendMessage(serverUrl, session.id, 'Turn three');

    // All turns should produce text
    expect(t1.text).toBeTruthy();
    expect(t2.text).toBeTruthy();
    expect(t3.text).toBeTruthy();

    if (!useRealSdk) {
      // Mock: first turn is fresh, subsequent turns are resumed
      expect(t1.text).toContain('[Mock]');
      expect(t2.text).toContain('[Resumed session]');
      expect(t3.text).toContain('[Resumed session]');
    }

    await deleteSession(serverUrl, session.id);
  }, 90_000);

  // -------------------------------------------------------------------------
  // 3. Separate sessions have independent resume tracking
  // -------------------------------------------------------------------------
  it('separate sessions track resume state independently', async () => {
    const sessionA = await createSession(serverUrl, AGENT_NAME);
    const sessionB = await createSession(serverUrl, AGENT_NAME);

    // First message to each — neither should be resumed
    const a1 = await sendMessage(serverUrl, sessionA.id, 'I am session A');
    const b1 = await sendMessage(serverUrl, sessionB.id, 'I am session B');

    if (!useRealSdk) {
      expect(a1.text).toContain('[Mock]');
      expect(b1.text).toContain('[Mock]');
    }

    // Second message to A — should be resumed
    const a2 = await sendMessage(serverUrl, sessionA.id, 'Who am I?');
    if (!useRealSdk) {
      expect(a2.text).toContain('[Resumed session]');
    }

    // Second message to B — should also be resumed (independently)
    const b2 = await sendMessage(serverUrl, sessionB.id, 'Who am I?');
    if (!useRealSdk) {
      expect(b2.text).toContain('[Resumed session]');
    }

    await deleteSession(serverUrl, sessionA.id);
    await deleteSession(serverUrl, sessionB.id);
  }, 90_000);

  // -------------------------------------------------------------------------
  // 4. SSE stream has correct structure on resumed turn
  // -------------------------------------------------------------------------
  it('resumed turn produces valid SSE event stream', async () => {
    const session = await createSession(serverUrl, AGENT_NAME);

    await sendMessage(serverUrl, session.id, 'Setup turn');

    const turn2 = await sendMessage(serverUrl, session.id, 'Follow-up turn');

    // Should have message events and a done event
    const messageEvents = turn2.events.filter((e) => e.type === 'message');
    expect(messageEvents.length).toBeGreaterThan(0);
    expect(turn2.rawText).toContain('event: done');

    // At least one assistant message
    const assistantEvents = messageEvents.filter((e) => e.data?.type === 'assistant');
    expect(assistantEvents.length).toBeGreaterThan(0);

    await deleteSession(serverUrl, session.id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // 5. Conversation memory — real SDK only
  // -------------------------------------------------------------------------
  it.skipIf(!useRealSdk)(
    'agent remembers information from earlier turns (real SDK)',
    async () => {
      const session = await createSession(serverUrl, AGENT_NAME);

      // Turn 1: Give the agent a unique identifier
      const turn1 = await sendMessage(
        serverUrl,
        session.id,
        'Remember this: my secret code is ALPHA_SEVEN_BRAVO. Just acknowledge you got it.',
      );
      expect(turn1.text).toBeTruthy();

      // Turn 2: Ask the agent to recall
      const turn2 = await sendMessage(
        serverUrl,
        session.id,
        'What is my secret code? Reply with just the code, nothing else.',
      );

      // The agent should remember ALPHA_SEVEN_BRAVO
      expect(turn2.text.toUpperCase()).toContain('ALPHA');
      expect(turn2.text).toContain('SEVEN');

      await deleteSession(serverUrl, session.id);
    },
    120_000,
  );

  // -------------------------------------------------------------------------
  // 6. Session isolation — real SDK only
  // -------------------------------------------------------------------------
  it.skipIf(!useRealSdk)(
    'separate sessions have isolated conversation memory (real SDK)',
    async () => {
      const sessionA = await createSession(serverUrl, AGENT_NAME);
      const sessionB = await createSession(serverUrl, AGENT_NAME);

      // Tell session A a name
      await sendMessage(serverUrl, sessionA.id, 'My name is Sarah. Remember it.');

      // Tell session B a different name
      await sendMessage(serverUrl, sessionB.id, 'My name is Carlos. Remember it.');

      // Ask each session
      const askA = await sendMessage(serverUrl, sessionA.id, 'What is my name?');
      const askB = await sendMessage(serverUrl, sessionB.id, 'What is my name?');

      // Session A should know Sarah
      expect(askA.text).toContain('Sarah');

      // Session B should know Carlos
      expect(askB.text).toContain('Carlos');

      await deleteSession(serverUrl, sessionA.id);
      await deleteSession(serverUrl, sessionB.id);
    },
    120_000,
  );
});
