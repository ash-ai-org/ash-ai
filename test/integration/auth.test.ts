import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AshClient } from '../../packages/sdk/src/index.js';
import { launchServer, waitForReady, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Integration test: verifies that an auth-protected Ash server rejects
 * SDK requests without a valid API key and accepts them with one.
 */

const API_KEY = 'test-integration-key-abc123';

let server: ServerHandle;
let testRoot: string;

beforeAll(async () => {
  testRoot = mkdtempSync(join(tmpdir(), 'ash-auth-'));
  const port = 4200 + Math.floor(Math.random() * 800);

  server = await launchServer({
    port,
    testRoot,
    extraEnv: { ASH_API_KEY: API_KEY },
  });
  await waitForReady(server.url);
}, 120_000);

afterAll(async () => {
  if (server) await server.stop();
  rmSync(testRoot, { recursive: true, force: true });
});

describe('SDK auth against protected server', () => {
  it('rejects requests when no API key is provided', async () => {
    const client = new AshClient({ serverUrl: server.url });
    await expect(client.listAgents()).rejects.toThrow('Missing Authorization header');
  });

  it('rejects requests when wrong API key is provided', async () => {
    const client = new AshClient({ serverUrl: server.url, apiKey: 'wrong-key' });
    await expect(client.listAgents()).rejects.toThrow('Invalid API key');
  });

  it('accepts requests when correct API key is provided', async () => {
    const client = new AshClient({ serverUrl: server.url, apiKey: API_KEY });
    const agents = await client.listAgents();
    expect(agents).toEqual([]);
  });

  it('allows health check without auth', async () => {
    const client = new AshClient({ serverUrl: server.url });
    const health = await client.health();
    expect(health.status).toBe('ok');
  });
});
