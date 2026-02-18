import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Integration test using the REAL Claude Agent SDK.
 *
 * Requires:
 *   - ANTHROPIC_API_KEY set in environment
 *   - @anthropic-ai/claude-agent-sdk installed
 *   - claude CLI available in PATH
 *
 * Run with: pnpm test:real-sdk
 *
 * This test calls the Claude Agent SDK directly, verifying that:
 *   1. The SDK can be imported and initialized
 *   2. A real prompt gets a real response from Claude
 *   3. The response includes expected metadata (cost, session_id, etc.)
 */

const SKIP_REASON = !process.env.ANTHROPIC_API_KEY
  ? 'ANTHROPIC_API_KEY not set — skipping real SDK tests'
  : undefined;

// Unset CLAUDECODE to allow nested SDK spawning in test environment
delete process.env.CLAUDECODE;

let workDir: string;

beforeAll(() => {
  if (SKIP_REASON) return;
  workDir = mkdtempSync(join(tmpdir(), 'ash-real-sdk-'));
  mkdirSync(workDir, { recursive: true });
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!!SKIP_REASON)('Real Claude Agent SDK', () => {
  it('gets a real response from Claude via query()', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const q = query({
      prompt: 'Reply with exactly the word PONG and nothing else.',
      options: {
        cwd: workDir,
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: 'You are a test bot. Reply with exactly the word PONG and nothing else. No explanation, no punctuation.',
        tools: [],
        persistSession: false,
      },
    });

    for await (const msg of q) {
      messages.push(msg as any);
    }

    // Should have at least an init, assistant, and result message
    const types = messages.map((m) => m.type);
    expect(types).toContain('assistant');
    expect(types).toContain('result');

    // Extract assistant text
    const assistant = messages.find((m) => m.type === 'assistant') as any;
    const textContent = assistant.message?.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');
    expect(textContent?.toUpperCase()).toContain('PONG');

    // Verify it's NOT a mock response
    expect(textContent).not.toContain('[Mock]');

    // Result should indicate success with real cost
    const result = messages.find((m) => m.type === 'result') as any;
    expect(result.subtype).toBe('success');
    expect(result.total_cost_usd).toBeGreaterThan(0);
    expect(result.num_turns).toBe(1);
    expect(result.session_id).toBeTruthy();
  }, 60_000);

  it('streams messages in order: init → assistant → result', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const types: string[] = [];
    const q = query({
      prompt: 'What is 2+2? Reply with just the number.',
      options: {
        cwd: workDir,
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: 'You are a calculator. Reply with only the numeric answer.',
        tools: [],
        persistSession: false,
      },
    });

    for await (const msg of q) {
      types.push((msg as any).type);
    }

    // Should see system init before assistant, and result at the end
    const initIdx = types.indexOf('system');
    const assistantIdx = types.indexOf('assistant');
    const resultIdx = types.indexOf('result');

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(assistantIdx).toBeGreaterThan(initIdx);
    expect(resultIdx).toBeGreaterThan(assistantIdx);
  }, 60_000);

  it('uses the Ash bridge sdk wrapper with ASH_REAL_SDK=1', async () => {
    // Test the bridge's sdk.ts wrapper to verify it routes to real SDK
    const bridgeSdk = await import('../../packages/bridge/src/sdk.js');

    // Save and set env
    const prev = process.env.ASH_REAL_SDK;
    process.env.ASH_REAL_SDK = '1';

    const messages: unknown[] = [];
    const controller = new AbortController();

    try {
      for await (const msg of bridgeSdk.runQuery({
        prompt: 'Reply with exactly: BRIDGE_TEST_OK',
        sessionId: 'test-session',
        workspaceDir: workDir,
        claudeMd: 'Reply with exactly what is asked. No explanation.',
        resume: false,
        signal: controller.signal,
      })) {
        messages.push(msg);
      }
    } finally {
      process.env.ASH_REAL_SDK = prev;
    }

    // Should have assistant and result messages from real SDK
    const msgTypes = messages.map((m: any) => m.type);
    expect(msgTypes).toContain('assistant');
    expect(msgTypes).toContain('result');

    // Check content
    const assistant = messages.find((m: any) => m.type === 'assistant') as any;
    const text = assistant?.message?.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');
    expect(text).toContain('BRIDGE_TEST_OK');
    expect(text).not.toContain('[Mock]');
  }, 60_000);
});
