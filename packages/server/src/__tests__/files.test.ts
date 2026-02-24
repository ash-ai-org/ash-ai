import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { registerSchemas } from '../schemas.js';
import { fileRoutes } from '../routes/files.js';
import { initDb, closeDb, upsertAgent, insertSession, updateSessionStatus } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { RunnerBackend, SandboxHandle } from '../runner/types.js';

// Minimal mock coordinator that returns a mock backend pointing at a workspace dir
function mockCoordinator(workspaceDir: string | null): RunnerCoordinator {
  const handle: SandboxHandle | undefined = workspaceDir
    ? { sandboxId: 'sbx-1', workspaceDir }
    : undefined;

  const backend: Partial<RunnerBackend> = {
    getSandbox: () => handle,
  };

  return {
    getBackendForRunnerAsync: async () => backend as RunnerBackend,
  } as unknown as RunnerCoordinator;
}

describe('file routes', () => {
  let dataDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-files-test-'));
    workspaceDir = mkdtempSync(join(tmpdir(), 'ash-files-ws-'));
    await initDb({ dataDir });
  });

  afterEach(async () => {
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function populateWorkspace() {
    writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# Agent');
    mkdirSync(join(workspaceDir, 'src'), { recursive: true });
    writeFileSync(join(workspaceDir, 'src', 'index.ts'), 'console.log("hello")');
    writeFileSync(join(workspaceDir, 'src', 'util.ts'), 'export const x = 1;');
    // Filtered dirs
    mkdirSync(join(workspaceDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(workspaceDir, 'node_modules', 'pkg', 'index.js'), '');
    mkdirSync(join(workspaceDir, '.git'), { recursive: true });
    writeFileSync(join(workspaceDir, '.git', 'HEAD'), 'ref');
  }

  async function buildApp(coordinator: RunnerCoordinator) {
    const app = Fastify();
    // Simulate auth middleware setting tenantId
    app.decorateRequest('tenantId', '');
    app.addHook('onRequest', async (req) => { req.tenantId = 'default'; });
    registerSchemas(app);
    fileRoutes(app, coordinator, dataDir);
    await app.ready();
    return app;
  }

  async function createTestSession() {
    await upsertAgent('test-agent', '/tmp/agent');
    const session = await insertSession('11111111-1111-1111-1111-111111111111', 'test-agent', 'sbx-1');
    await updateSessionStatus(session.id, 'active');
    return session;
  }

  describe('GET /api/sessions/:id/files', () => {
    it('lists files from live sandbox workspace', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.source).toBe('sandbox');
      expect(body.files).toBeInstanceOf(Array);

      const paths = body.files.map((f: any) => f.path).sort();
      expect(paths).toContain('CLAUDE.md');
      expect(paths).toContain('src/index.ts');
      expect(paths).toContain('src/util.ts');
      // Filtered dirs should not appear
      expect(paths.find((p: string) => p.includes('node_modules'))).toBeUndefined();
      expect(paths.find((p: string) => p.includes('.git'))).toBeUndefined();
    });

    it('returns file sizes and modifiedAt', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files`,
      });

      const body = res.json();
      const claude = body.files.find((f: any) => f.path === 'CLAUDE.md');
      expect(claude).toBeDefined();
      expect(claude.size).toBe(7); // '# Agent'
      expect(claude.modifiedAt).toBeTruthy();
    });

    it('falls back to persisted snapshot when sandbox is gone', async () => {
      populateWorkspace();
      const session = await createTestSession();

      // Persist state to snapshot location (uses session.id, not sandboxId)
      const snapshotDir = join(dataDir, 'sessions', session.id, 'workspace');
      mkdirSync(snapshotDir, { recursive: true });
      writeFileSync(join(snapshotDir, 'snapshot-file.txt'), 'from snapshot');

      // Coordinator returns no sandbox (sandbox gone)
      const app = await buildApp(mockCoordinator(null));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.source).toBe('snapshot');
      expect(body.files.map((f: any) => f.path)).toContain('snapshot-file.txt');
    });

    it('returns 404 for unknown session', async () => {
      const app = await buildApp(mockCoordinator(null));
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/99999999-9999-9999-9999-999999999999/files',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when no workspace available', async () => {
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(null));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/sessions/:id/files/*path', () => {
    it('returns raw file bytes by default', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files/src/index.ts`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/typescript');
      expect(res.headers['content-disposition']).toContain('index.ts');
      expect(res.headers['x-ash-source']).toBe('sandbox');
      expect(res.body).toBe('console.log("hello")');
    });

    it('returns JSON with ?format=json', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files/src/index.ts?format=json`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.path).toBe('src/index.ts');
      expect(body.content).toBe('console.log("hello")');
      expect(body.size).toBe(20);
      expect(body.source).toBe('sandbox');
    });

    it('returns 404 for nonexistent file', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files/nope.txt`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects path traversal with ..', async () => {
      populateWorkspace();
      const session = await createTestSession();
      const app = await buildApp(mockCoordinator(workspaceDir));

      // Fastify normalizes ../  in URLs before the handler runs, so the path
      // resolves to something that doesn't exist (404). Either way, the
      // traversal is blocked — the file can't be read.
      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}/files/../../../etc/passwd`,
      });
      expect([400, 404]).toContain(res.statusCode);
    });
  });
});
