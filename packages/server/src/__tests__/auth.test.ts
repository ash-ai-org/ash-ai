import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuth, generateApiKey, hashApiKey } from '../auth.js';

/** Build a minimal Fastify app with auth + a test route. */
async function buildApp(apiKey: string | undefined, hasDbKeys?: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerAuth(app, apiKey, undefined, hasDbKeys);

  // Stub routes to test against
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/docs/json', async () => ({ spec: true }));
  app.get('/api/agents', async () => ({ agents: [] }));
  app.post('/api/sessions', async () => ({ session: {} }));

  await app.ready();
  return app;
}

describe('API key auth middleware', () => {
  describe('when ASH_API_KEY is set', () => {
    const API_KEY = 'test-secret-key-12345';
    let app: FastifyInstance;

    beforeAll(async () => { app = await buildApp(API_KEY); });
    afterAll(async () => { await app.close(); });

    it('rejects requests without Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Missing Authorization header');
    });

    it('rejects requests with wrong API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: { authorization: 'Bearer wrong-key' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid API key');
    });

    it('rejects requests with malformed Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: { authorization: `Basic ${API_KEY}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid Authorization header format');
    });

    it('allows requests with correct API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ agents: [] });
    });

    it('allows /health without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ok');
    });

    it('allows /docs without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(res.statusCode).toBe(200);
    });

    it('protects POST routes too', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/sessions' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('when no API key and no DB keys (fresh install, pre-key-generation)', () => {
    let app: FastifyInstance;

    beforeAll(async () => { app = await buildApp(undefined, false); });
    afterAll(async () => { await app.close(); });

    it('allows all requests without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('when DB has auto-generated keys (no ASH_API_KEY env)', () => {
    let app: FastifyInstance;

    beforeAll(async () => { app = await buildApp(undefined, true); });
    afterAll(async () => { await app.close(); });

    it('rejects requests without Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Missing Authorization header');
    });

    it('allows /health without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('real HTTP requests against auth-protected server', () => {
    const API_KEY = 'test-secret-key-12345';
    let app: FastifyInstance;
    let serverUrl: string;

    beforeAll(async () => {
      app = await buildApp(API_KEY);
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      serverUrl = address;
    });
    afterAll(async () => { await app.close(); });

    it('rejects when no API key is provided', async () => {
      const res = await fetch(`${serverUrl}/api/agents`);
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Missing Authorization header');
    });

    it('rejects when wrong API key is provided', async () => {
      const res = await fetch(`${serverUrl}/api/agents`, {
        headers: { authorization: 'Bearer wrong-key' },
      });
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Invalid API key');
    });

    it('succeeds when correct API key is provided', async () => {
      const res = await fetch(`${serverUrl}/api/agents`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { agents: unknown[] };
      expect(body.agents).toEqual([]);
    });
  });

  describe('generateApiKey', () => {
    it('generates keys with ash_ prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^ash_[A-Za-z0-9_-]{32}$/);
    });

    it('generates unique keys', () => {
      const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
      expect(keys.size).toBe(10);
    });
  });

  describe('hashApiKey', () => {
    it('produces different hashes with and without secret', () => {
      const key = 'test-key';
      const plain = hashApiKey(key);
      const hmac = hashApiKey(key, 'my-secret');
      expect(plain).not.toBe(hmac);
    });

    it('is deterministic', () => {
      const key = 'test-key';
      expect(hashApiKey(key)).toBe(hashApiKey(key));
      expect(hashApiKey(key, 'secret')).toBe(hashApiKey(key, 'secret'));
    });
  });
});
