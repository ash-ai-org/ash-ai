import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAshServer, type AshServer } from '../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardOut = resolve(__dirname, '..', '..', '..', 'dashboard', 'out');

const TEST_API_KEY = 'test-dashboard-key';

describe('dashboard static serving', () => {
  let server: AshServer;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-dashboard-test-'));

    // Point ASH_DASHBOARD_PATH at the real dashboard build output
    process.env.ASH_DASHBOARD_PATH = dashboardOut;

    server = await createAshServer({
      dataDir,
      mode: 'standalone',
      apiKey: TEST_API_KEY,
    });

    await server.app.ready();
  }, 30_000);

  afterAll(async () => {
    delete process.env.ASH_DASHBOARD_PATH;
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // ─── Static File Serving ─────────────────────────────────────────────

  it('serves index.html at /dashboard/', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html');
  });

  it('serves index.html at /dashboard/index.html', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/index.html',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  // ─── Route Pages ─────────────────────────────────────────────────────

  it('serves agents page at /dashboard/agents/', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/agents/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html');
  });

  it('serves sessions page at /dashboard/sessions/', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/sessions/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('serves settings/api-keys page', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/settings/api-keys/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  // ─── Runtime Config Endpoint ─────────────────────────────────────────

  it('serves /dashboard/config.js with runtime API key and version', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/config.js',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.body).toContain('window.__ASH_CONFIG__');
    expect(res.body).toContain(TEST_API_KEY);

    // Verify it's valid JS with parseable JSON
    const match = res.body.match(/window\.__ASH_CONFIG__\s*=\s*(.+);/);
    expect(match).not.toBeNull();
    const config = JSON.parse(match![1]);
    expect(config.apiKey).toBe(TEST_API_KEY);
    expect(config.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  // ─── SPA Fallback ────────────────────────────────────────────────────

  it('falls back to index.html for unknown /dashboard/* paths (SPA routing)', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/dashboard/some/unknown/route',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html');
  });

  // ─── Static Assets ───────────────────────────────────────────────────

  it('serves Next.js static chunks under /dashboard/_next/', async () => {
    // Get the index.html to find an actual chunk filename
    const indexRes = await server.app.inject({
      method: 'GET',
      url: '/dashboard/',
    });

    // Extract a JS filename from the HTML
    const jsMatch = indexRes.body.match(/\/_next\/static\/[^"]+\.js/);
    expect(jsMatch).not.toBeNull();

    // The HTML references paths with basePath stripped (/_next/...),
    // but static serving is under /dashboard/ prefix
    const jsPath = '/dashboard' + jsMatch![0];
    const jsRes = await server.app.inject({
      method: 'GET',
      url: jsPath,
    });

    expect(jsRes.statusCode).toBe(200);
    expect(jsRes.headers['content-type']).toContain('javascript');
  });

  // ─── Non-dashboard Paths ─────────────────────────────────────────────

  it('returns 404 for non-dashboard paths (with auth)', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/nonexistent',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 401 for non-dashboard paths without auth', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(res.statusCode).toBe(401);
  });

  it('health endpoint still works alongside dashboard', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  // ─── API Routes Still Work ───────────────────────────────────────────

  it('API routes still work with dashboard enabled', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agents).toBeDefined();
  });

  it('public API keys endpoint works', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/api-keys',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
  });
});
