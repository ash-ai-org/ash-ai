import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { registerSchemas } from '../schemas.js';
import { sessionRoutes } from '../routes/sessions.js';
import { initDb, closeDb, upsertAgent } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';

function mockCoordinator(captureOpts?: { createSandboxOpts?: any[] }): RunnerCoordinator {
  return {
    selectBackend: async () => ({
      backend: {
        createSandbox: async (opts: any) => {
          if (captureOpts) captureOpts.createSandboxOpts!.push(opts);
          return { sandboxId: 'sbx-1', workspaceDir: '/tmp/ws' };
        },
      },
      runnerId: '__local__',
    }),
    getBackendForRunnerAsync: async () => ({}),
  } as unknown as RunnerCoordinator;
}

function noopTelemetry() {
  return { emit() {}, async flush() {}, async shutdown() {} } as any;
}

describe('POST /api/sessions', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-session-test-'));
    await initDb({ dataDir });
  });

  afterEach(async () => {
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator(), dataDir, noopTelemetry());
    await app.ready();
    return app;
  }

  it('returns 404 when agent does not exist', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('not found');
  });

  it('returns 422 when agent directory is missing from disk', async () => {
    // Agent exists in DB but points to a directory that does not exist
    await upsertAgent('ghost-agent', '/tmp/nonexistent-agent-dir-' + Date.now());

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'ghost-agent' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain('Agent directory not found');
    expect(res.json().error).toContain('re-deployed');
  });

  it('proceeds past directory check when agent directory exists', async () => {
    // Create a real agent directory
    const agentDir = join(dataDir, 'agents', 'real-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('real-agent', agentDir);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'real-agent' },
    });
    // Should get past the 422 check — may succeed (201) or fail later in sandbox creation
    // but should NOT be 422 or 404
    expect(res.statusCode).not.toBe(422);
    expect(res.statusCode).not.toBe(404);
  });

  it('passes agent-level env to sandbox creation', async () => {
    const captured: any[] = [];
    const agentDir = join(dataDir, 'agents', 'env-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('env-agent', agentDir, undefined, { AGENT_KEY: 'agent-val' });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator({ createSandboxOpts: captured }), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'env-agent' },
    });
    expect(res.statusCode).toBe(201);
    expect(captured).toHaveLength(1);
    expect(captured[0].extraEnv).toEqual({ AGENT_KEY: 'agent-val' });
  });

  it('session-level extraEnv overrides agent-level env', async () => {
    const captured: any[] = [];
    const agentDir = join(dataDir, 'agents', 'env-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('env-agent', agentDir, undefined, { SHARED: 'agent', AGENT_ONLY: 'yes' });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator({ createSandboxOpts: captured }), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'env-agent', extraEnv: { SHARED: 'session', SESSION_ONLY: 'yes' } },
    });
    expect(res.statusCode).toBe(201);
    expect(captured).toHaveLength(1);
    expect(captured[0].extraEnv).toEqual({
      SHARED: 'session',        // session overrides agent
      AGENT_ONLY: 'yes',        // agent-level preserved
      SESSION_ONLY: 'yes',      // session-level added
    });
  });
});
