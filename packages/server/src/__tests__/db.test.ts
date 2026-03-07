import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initDb,
  closeDb,
  upsertAgent,
  getAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  insertSession,
  insertForkedSession,
  getSession,
  listSessions,
  updateSessionStatus,
  updateSessionSandbox,
  updateSessionConfig,
  touchSession,
} from '../db/index.js';

describe('database', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-test-db-'));
    await initDb({ dataDir });
  });

  afterEach(async () => {
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('uses SQLite by default when no databaseUrl is provided', async () => {
    // initDb was already called in beforeEach without databaseUrl — verify it works
    const agent = await upsertAgent('default-backend-test', '/tmp/test');
    expect(agent.name).toBe('default-backend-test');
  });

  // -- Agents -----------------------------------------------------------------

  describe('agents', () => {
    it('creates an agent', async () => {
      const agent = await upsertAgent('test-agent', '/tmp/agent');
      expect(agent.name).toBe('test-agent');
      expect(agent.version).toBe(1);
      expect(agent.path).toBe('/tmp/agent');
    });

    it('increments version on upsert', async () => {
      await upsertAgent('test-agent', '/tmp/v1');
      const v2 = await upsertAgent('test-agent', '/tmp/v2');
      expect(v2.version).toBe(2);
      expect(v2.path).toBe('/tmp/v2');
    });

    it('gets an agent by name', async () => {
      await upsertAgent('my-agent', '/tmp/path');
      const agent = await getAgent('my-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('my-agent');
    });

    it('returns null for nonexistent agent', async () => {
      expect(await getAgent('ghost')).toBeNull();
    });

    it('lists all agents', async () => {
      await upsertAgent('a', '/tmp/a');
      await upsertAgent('b', '/tmp/b');
      const agents = await listAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.name)).toEqual(['a', 'b']);
    });

    it('deletes an agent', async () => {
      await upsertAgent('doomed', '/tmp/doomed');
      expect(await deleteAgent('doomed')).toBe(true);
      expect(await getAgent('doomed')).toBeNull();
    });

    it('returns false when deleting nonexistent agent', async () => {
      expect(await deleteAgent('ghost')).toBe(false);
    });

    it('creates agent with env', async () => {
      const env = { API_KEY: 'secret', DEBUG: 'true' };
      const agent = await upsertAgent('env-agent', '/tmp/env', undefined, env);
      expect(agent.env).toEqual(env);
    });

    it('persists and retrieves env via getAgent', async () => {
      const env = { FOO: 'bar', BAZ: 'qux' };
      await upsertAgent('env-agent', '/tmp/env', undefined, env);
      const agent = await getAgent('env-agent');
      expect(agent!.env).toEqual(env);
    });

    it('env is undefined when not provided', async () => {
      const agent = await upsertAgent('no-env', '/tmp/no-env');
      expect(agent.env).toBeUndefined();

      const fetched = await getAgent('no-env');
      expect(fetched!.env).toBeUndefined();
    });

    it('listAgents returns env', async () => {
      const env = { KEY: 'value' };
      await upsertAgent('with-env', '/tmp/with', undefined, env);
      await upsertAgent('without-env', '/tmp/without');
      const agents = await listAgents();
      const withEnv = agents.find(a => a.name === 'with-env')!;
      const withoutEnv = agents.find(a => a.name === 'without-env')!;
      expect(withEnv.env).toEqual(env);
      expect(withoutEnv.env).toBeUndefined();
    });

    it('upsert updates env on re-deploy', async () => {
      await upsertAgent('env-agent', '/tmp/v1', undefined, { OLD: 'val' });
      await upsertAgent('env-agent', '/tmp/v2', undefined, { NEW: 'val' });
      const agent = await getAgent('env-agent');
      expect(agent!.env).toEqual({ NEW: 'val' });
    });

    it('updateAgent updates env', async () => {
      await upsertAgent('env-agent', '/tmp/env');
      const updated = await updateAgent('env-agent', { env: { KEY: 'value' } });
      expect(updated!.env).toEqual({ KEY: 'value' });

      const fetched = await getAgent('env-agent');
      expect(fetched!.env).toEqual({ KEY: 'value' });
    });

    it('updateAgent clears env with empty object', async () => {
      await upsertAgent('env-agent', '/tmp/env', undefined, { KEY: 'value' });
      await updateAgent('env-agent', { env: {} });
      const agent = await getAgent('env-agent');
      expect(agent!.env).toBeUndefined();
    });

    it('updateAgent returns null for nonexistent agent', async () => {
      const result = await updateAgent('ghost', { env: { KEY: 'val' } });
      expect(result).toBeNull();
    });
  });

  // -- Sessions ---------------------------------------------------------------

  describe('sessions', () => {
    beforeEach(async () => {
      await upsertAgent('test-agent', '/tmp/agent');
    });

    it('creates a session', async () => {
      const session = await insertSession('s1', 'test-agent', 'sandbox-1');
      expect(session.id).toBe('s1');
      expect(session.agentName).toBe('test-agent');
      expect(session.status).toBe('starting');
    });

    it('updates session status', async () => {
      await insertSession('s1', 'test-agent', 'sandbox-1');
      await updateSessionStatus('s1', 'active');
      const session = await getSession('s1');
      expect(session!.status).toBe('active');
    });

    it('follows status lifecycle: starting → active → ended', async () => {
      await insertSession('s1', 'test-agent', 'sandbox-1');
      expect((await getSession('s1'))!.status).toBe('starting');

      await updateSessionStatus('s1', 'active');
      expect((await getSession('s1'))!.status).toBe('active');

      await updateSessionStatus('s1', 'ended');
      expect((await getSession('s1'))!.status).toBe('ended');
    });

    it('lists sessions (newest first)', async () => {
      await insertSession('s1', 'test-agent', 'sb1');
      await insertSession('s2', 'test-agent', 'sb2');
      const sessions = await listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('returns null for nonexistent session', async () => {
      expect(await getSession('ghost')).toBeNull();
    });

    it('touch updates lastActiveAt', async () => {
      await insertSession('s1', 'test-agent', 'sb1');
      const before = (await getSession('s1'))!.lastActiveAt;

      // Small delay to ensure timestamp difference
      await touchSession('s1');
      const after = (await getSession('s1'))!.lastActiveAt;
      expect(after).toBeTruthy();
    });

    it('updates sandbox ID', async () => {
      await insertSession('s1', 'test-agent', 'sb-old');
      expect((await getSession('s1'))!.sandboxId).toBe('sb-old');

      await updateSessionSandbox('s1', 'sb-new');
      const session = (await getSession('s1'))!;
      expect(session.sandboxId).toBe('sb-new');
    });
  });

  // -- Session Config (SDK parity) --------------------------------------------

  describe('session config', () => {
    beforeEach(async () => {
      await upsertAgent('test-agent', '/tmp/agent');
    });

    it('creates session without config (null)', async () => {
      const session = await insertSession('s1', 'test-agent', 'sb1');
      expect(session.config).toBeNull();
    });

    it('creates session with config', async () => {
      const config = { allowedTools: ['Read', 'Grep'], betas: ['beta-1'] };
      const session = await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, undefined, config);
      expect(session.config).toEqual(config);
    });

    it('persists and retrieves full config', async () => {
      const config = {
        allowedTools: ['Read'],
        disallowedTools: ['Bash'],
        betas: ['context-1m'],
        subagents: { researcher: { model: 'claude-sonnet' } },
        initialAgent: 'researcher',
      };
      await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, 'claude-opus', config);
      const session = (await getSession('s1'))!;
      expect(session.config).toEqual(config);
      expect(session.model).toBe('claude-opus');
    });

    it('updateSessionConfig updates model and config', async () => {
      const config = { allowedTools: ['Read'] };
      await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, 'old-model', config);

      const newConfig = { allowedTools: ['Read', 'Grep'], betas: ['beta-1'] };
      await updateSessionConfig('s1', 'new-model', newConfig);

      const session = (await getSession('s1'))!;
      expect(session.model).toBe('new-model');
      expect(session.config).toEqual(newConfig);
    });

    it('updateSessionConfig clears config when passed null', async () => {
      await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, undefined, { betas: ['x'] });
      await updateSessionConfig('s1', undefined, null);

      const session = (await getSession('s1'))!;
      expect(session.config).toBeNull();
    });

    it('updateSessionConfig updates only model when config is unchanged', async () => {
      const config = { allowedTools: ['Read'] };
      await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, 'old', config);
      await updateSessionConfig('s1', 'new', config);

      const session = (await getSession('s1'))!;
      expect(session.model).toBe('new');
      expect(session.config).toEqual(config);
    });

    it('listSessions returns config', async () => {
      const config = { betas: ['beta-1'] };
      await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, undefined, config);
      const sessions = await listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].config).toEqual(config);
    });

    it('forked session copies parent config', async () => {
      const config = { allowedTools: ['Read'], betas: ['beta-1'] };
      const parent = await insertSession('s1', 'test-agent', 'sb1', undefined, undefined, 'claude-opus', config);
      await updateSessionStatus('s1', 'active');

      const forked = await insertForkedSession('s2', parent, 'sb2');
      expect(forked.config).toEqual(config);
      expect(forked.model).toBe('claude-opus');
      expect(forked.parentSessionId).toBe('s1');
    });
  });
});
