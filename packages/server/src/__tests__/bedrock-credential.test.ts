import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { registerSchemas } from '../schemas.js';
import { sessionRoutes } from '../routes/sessions.js';
import { initDb, closeDb, upsertAgent } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';

// Mock decryptCredential to avoid needing ASH_CREDENTIAL_KEY at module load time
vi.mock('../routes/credentials.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../routes/credentials.js')>();
  return {
    ...orig,
    decryptCredential: vi.fn(),
  };
});

import { decryptCredential } from '../routes/credentials.js';
const mockDecrypt = vi.mocked(decryptCredential);

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

describe('Bedrock credential support', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-bedrock-test-'));
    await initDb({ dataDir });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('bedrock credential expands to AWS env vars in sandbox', async () => {
    const captured: any[] = [];

    const agentDir = join(dataDir, 'agents', 'bedrock-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test agent');
    await upsertAgent('bedrock-agent', agentDir);

    // Mock decrypt to return bedrock credential
    mockDecrypt.mockResolvedValue({
      type: 'bedrock',
      key: JSON.stringify({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-west-2',
      }),
    });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator({ createSandboxOpts: captured }), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'bedrock-agent', credentialId: 'cred-bedrock-1' },
    });

    expect(res.statusCode).toBe(201);
    expect(captured).toHaveLength(1);

    const env = captured[0].extraEnv;
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(env.AWS_ACCESS_KEY_ID).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    expect(env.AWS_REGION).toBe('us-west-2');
    expect(env.AWS_SESSION_TOKEN).toBeUndefined();
  });

  it('bedrock credential with session token includes AWS_SESSION_TOKEN', async () => {
    const captured: any[] = [];

    const agentDir = join(dataDir, 'agents', 'bedrock-agent2');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('bedrock-agent2', agentDir);

    mockDecrypt.mockResolvedValue({
      type: 'bedrock',
      key: JSON.stringify({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'eu-west-1',
        sessionToken: 'FwoGZXIvYXdzEBAaDHka0example',
      }),
    });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator({ createSandboxOpts: captured }), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'bedrock-agent2', credentialId: 'cred-bedrock-2' },
    });

    expect(res.statusCode).toBe(201);
    const env = captured[0].extraEnv;
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(env.AWS_SESSION_TOKEN).toBe('FwoGZXIvYXdzEBAaDHka0example');
  });

  it('rejects bedrock credential with invalid JSON', async () => {
    const agentDir = join(dataDir, 'agents', 'bedrock-agent3');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('bedrock-agent3', agentDir);

    mockDecrypt.mockResolvedValue({
      type: 'bedrock',
      key: 'not-valid-json',
    });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator(), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'bedrock-agent3', credentialId: 'cred-bedrock-bad' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('JSON object');
  });

  it('rejects bedrock credential missing required fields', async () => {
    const agentDir = join(dataDir, 'agents', 'bedrock-agent4');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('bedrock-agent4', agentDir);

    mockDecrypt.mockResolvedValue({
      type: 'bedrock',
      key: JSON.stringify({ accessKeyId: 'AKIAEXAMPLE', region: 'us-east-1' }),
    });

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator(), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent: 'bedrock-agent4', credentialId: 'cred-bedrock-incomplete' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('accessKeyId');
  });

  it('direct extraEnv works for bedrock without credential system', async () => {
    const captured: any[] = [];

    const agentDir = join(dataDir, 'agents', 'bedrock-direct');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'CLAUDE.md'), '# Test');
    await upsertAgent('bedrock-direct', agentDir);

    const app = Fastify();
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    sessionRoutes(app, mockCoordinator({ createSandboxOpts: captured }), dataDir, noopTelemetry());
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        agent: 'bedrock-direct',
        extraEnv: {
          CLAUDE_CODE_USE_BEDROCK: '1',
          AWS_ACCESS_KEY_ID: 'AKIADIRECT',
          AWS_SECRET_ACCESS_KEY: 'secret-direct',
          AWS_REGION: 'ap-southeast-1',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const env = captured[0].extraEnv;
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(env.AWS_ACCESS_KEY_ID).toBe('AKIADIRECT');
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('secret-direct');
    expect(env.AWS_REGION).toBe('ap-southeast-1');
  });
});
