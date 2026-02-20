import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  initDb,
  closeDb,
  upsertAgent,
  getAgent,
  listAgents,
  deleteAgent,
  insertSession,
  getSession,
  listSessions,
  insertApiKey,
  getApiKeyByHash,
  listApiKeysByTenant,
  deleteApiKey,
} from '../db/index.js';
import { hashApiKey } from '../auth.js';

describe('multi-tenant isolation', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-test-mt-'));
    await initDb({ dataDir });
  });

  afterEach(async () => {
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // -- Agent isolation --------------------------------------------------------

  describe('agents', () => {
    it('tenant A cannot see tenant B agents', async () => {
      await upsertAgent('shared-name', '/tmp/a', 'tenant-a');
      await upsertAgent('only-b', '/tmp/b', 'tenant-b');

      const agentsA = await listAgents('tenant-a');
      expect(agentsA).toHaveLength(1);
      expect(agentsA[0].name).toBe('shared-name');

      const agentsB = await listAgents('tenant-b');
      expect(agentsB).toHaveLength(1);
      expect(agentsB[0].name).toBe('only-b');
    });

    it('getAgent filters by tenant', async () => {
      await upsertAgent('my-agent', '/tmp/a', 'tenant-a');

      expect(await getAgent('my-agent', 'tenant-a')).not.toBeNull();
      expect(await getAgent('my-agent', 'tenant-b')).toBeNull();
    });

    it('deleteAgent only affects the correct tenant', async () => {
      await upsertAgent('my-agent', '/tmp/a', 'tenant-a');

      // Tenant B cannot delete tenant A's agent
      expect(await deleteAgent('my-agent', 'tenant-b')).toBe(false);
      expect(await getAgent('my-agent', 'tenant-a')).not.toBeNull();

      // Tenant A can delete their own
      expect(await deleteAgent('my-agent', 'tenant-a')).toBe(true);
      expect(await getAgent('my-agent', 'tenant-a')).toBeNull();
    });

    it('default tenant works when no tenantId passed', async () => {
      await upsertAgent('default-agent', '/tmp/default');
      const agent = await getAgent('default-agent');
      expect(agent).not.toBeNull();
      expect(agent!.tenantId).toBe('default');

      const agents = await listAgents();
      expect(agents).toHaveLength(1);
    });

    it('agents have UUID ids', async () => {
      const agent = await upsertAgent('uuid-agent', '/tmp/a', 'tenant-a');
      expect(agent.id).toBeDefined();
      expect(agent.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('upsert preserves agent id across updates', async () => {
      const v1 = await upsertAgent('stable-agent', '/tmp/v1', 'tenant-a');
      const v2 = await upsertAgent('stable-agent', '/tmp/v2', 'tenant-a');
      expect(v2.id).toBe(v1.id);
      expect(v2.version).toBe(2);
      expect(v2.path).toBe('/tmp/v2');
    });

    it('same agent name in different tenants gets different ids', async () => {
      const agentA = await upsertAgent('shared-name', '/tmp/a', 'tenant-a');
      const agentB = await upsertAgent('shared-name', '/tmp/b', 'tenant-b');
      expect(agentA.id).not.toBe(agentB.id);
    });
  });

  // -- Session isolation ------------------------------------------------------

  describe('sessions', () => {
    beforeEach(async () => {
      await upsertAgent('agent-a', '/tmp/a', 'tenant-a');
      await upsertAgent('agent-b', '/tmp/b', 'tenant-b');
    });

    it('tenant A cannot see tenant B sessions', async () => {
      await insertSession('s1', 'agent-a', 'sb1', 'tenant-a');
      await insertSession('s2', 'agent-b', 'sb2', 'tenant-b');

      const sessA = await listSessions('tenant-a');
      expect(sessA).toHaveLength(1);
      expect(sessA[0].id).toBe('s1');

      const sessB = await listSessions('tenant-b');
      expect(sessB).toHaveLength(1);
      expect(sessB[0].id).toBe('s2');
    });

    it('getSession returns tenantId for route-level access control', async () => {
      await insertSession('s1', 'agent-a', 'sb1', 'tenant-a');

      const session = await getSession('s1');
      expect(session).not.toBeNull();
      expect(session!.tenantId).toBe('tenant-a');
    });

    it('listSessions with agent filter respects tenant', async () => {
      await insertSession('s1', 'agent-a', 'sb1', 'tenant-a');
      await insertSession('s2', 'agent-a', 'sb2', 'tenant-b');

      const sessA = await listSessions('tenant-a', 'agent-a');
      expect(sessA).toHaveLength(1);
      expect(sessA[0].id).toBe('s1');
    });

    it('session includes tenantId in response', async () => {
      const session = await insertSession('s1', 'agent-a', 'sb1', 'tenant-a');
      expect(session.tenantId).toBe('tenant-a');
    });
  });

  // -- API Keys ---------------------------------------------------------------

  describe('api keys', () => {
    it('creates and retrieves API key by hash', async () => {
      const rawKey = 'ash_key_abc123';
      const hash = hashApiKey(rawKey);
      const id = randomUUID();

      const key = await insertApiKey(id, 'tenant-a', hash, 'test key');
      expect(key.tenantId).toBe('tenant-a');
      expect(key.label).toBe('test key');

      const found = await getApiKeyByHash(hash);
      expect(found).not.toBeNull();
      expect(found!.tenantId).toBe('tenant-a');
    });

    it('returns null for unknown hash', async () => {
      expect(await getApiKeyByHash('nonexistent')).toBeNull();
    });

    it('lists keys by tenant', async () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      await insertApiKey(randomUUID(), 'tenant-a', hash1, 'key 1');
      await insertApiKey(randomUUID(), 'tenant-b', hash2, 'key 2');

      const keysA = await listApiKeysByTenant('tenant-a');
      expect(keysA).toHaveLength(1);
      expect(keysA[0].label).toBe('key 1');

      const keysB = await listApiKeysByTenant('tenant-b');
      expect(keysB).toHaveLength(1);
    });

    it('deletes API key', async () => {
      const id = randomUUID();
      const hash = hashApiKey('deleteme');
      await insertApiKey(id, 'tenant-a', hash, 'deleteable');

      expect(await deleteApiKey(id)).toBe(true);
      expect(await getApiKeyByHash(hash)).toBeNull();
    });

    it('returns false when deleting nonexistent key', async () => {
      expect(await deleteApiKey('nonexistent')).toBe(false);
    });
  });

  // -- Auth integration (hashApiKey) ------------------------------------------

  describe('hashApiKey', () => {
    it('produces consistent SHA-256 hashes', () => {
      const key = 'ash_test_key_xyz';
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it('different keys produce different hashes', () => {
      expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'));
    });
  });
});
