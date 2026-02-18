import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * CLI integration test: exercises the `ash` CLI commands the way an external
 * developer would use them. Builds the Docker image, starts the server,
 * deploys an agent, creates a session, sends a message, and cleans up.
 *
 * This test requires Docker and a built ash-dev image.
 * Run: npx vitest run --config vitest.integration.config.ts test/integration/cli.test.ts
 */

const CLI = join(process.cwd(), 'packages/cli/dist/index.js');

function ash(args: string[], opts?: { timeout?: number }): string {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: opts?.timeout ?? 30_000,
    env: { ...process.env },
  }).trim();
}

describe('CLI developer workflow', () => {
  let agentDir: string;
  let tmpDir: string;

  beforeAll(() => {
    // Build the image if needed
    try {
      execSync('docker image inspect ash-dev', { stdio: 'ignore' });
    } catch {
      execSync('docker build -t ash-dev .', { stdio: 'inherit', timeout: 300_000 });
    }

    // Create a test agent directory (simulates a developer's agent folder)
    tmpDir = mkdtempSync(join(tmpdir(), 'ash-cli-test-'));
    agentDir = join(tmpDir, 'my-agent');
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test Agent\nRespond briefly.');

    // Ensure no leftover server
    try { ash(['stop']); } catch { /* not running */ }
  }, 120_000);

  afterAll(() => {
    try { ash(['stop']); } catch { /* already stopped */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ash start — starts the server in Docker', () => {
    const out = ash(['start', '--image', 'ash-dev', '--no-pull'], { timeout: 60_000 });
    expect(out).toContain('Ash server is running');
    expect(out).toContain('http://localhost:4100');
  }, 60_000);

  it('ash status — shows running container', () => {
    const out = ash(['status']);
    expect(out).toContain('running');
  });

  it('ash health — reports ok', () => {
    const out = ash(['health']);
    expect(out).toContain('ok');
  });

  it('ash deploy — deploys an agent', () => {
    const out = ash(['deploy', agentDir, '--name', 'test-agent']);
    expect(out).toContain('Deployed agent');
    expect(out).toContain('test-agent');
  });

  it('ash agent list — shows the deployed agent', () => {
    const out = ash(['agent', 'list']);
    expect(out).toContain('test-agent');
  });

  let sessionId: string;

  it('ash session create — creates a session', () => {
    const out = ash(['session', 'create', 'test-agent']);
    expect(out).toContain('Session created');
    const match = out.match(/"id":\s*"([^"]+)"/);
    expect(match).toBeTruthy();
    sessionId = match![1];
  }, 30_000);

  it('ash session list — shows the session', () => {
    const out = ash(['session', 'list']);
    expect(out).toContain(sessionId.slice(0, 8));
  });

  it('ash session send — sends a message and gets a response', () => {
    const out = ash(['session', 'send', sessionId, 'what is 2+2? answer in one word'], { timeout: 60_000 });
    expect(out).toContain('[message]');
    expect(out).toContain('[done]');
  }, 60_000);

  it('ash session end — ends the session', () => {
    const out = ash(['session', 'end', sessionId]);
    expect(out).toContain('ended');
  });

  it('ash stop — stops the server', () => {
    const out = ash(['stop']);
    expect(out).toContain('stopped');
  });

  it('ash status — reports not running after stop', () => {
    const out = ash(['status']);
    expect(out).toContain('not-found');
  });
});
