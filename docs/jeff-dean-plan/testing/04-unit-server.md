# Unit Tests: packages/server

The server has three testable boundaries: the agent store (disk I/O), the session router (state machine), and the API routes (HTTP contracts).

## What to test

### AgentStore: CRUD on disk

```typescript
// packages/server/src/__tests__/agent-store.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentStore } from '../registry/store.js';

describe('AgentStore', () => {
  let storeDir: string;
  let store: AgentStore;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'ash-store-test-'));
    store = new AgentStore(storeDir);
    await store.init();
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
  });

  async function createAgentDir(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), `ash-agent-${name}-`));
    await writeFile(join(dir, 'CLAUDE.md'), `# ${name}\nTest agent`);
    return dir;
  }

  it('stores and retrieves an agent', async () => {
    const srcDir = await createAgentDir('test-agent');
    const agent = await store.store('test-agent', srcDir);

    expect(agent.name).toBe('test-agent');
    expect(agent.version).toBe(1);

    const retrieved = await store.get('test-agent');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('test-agent');

    await rm(srcDir, { recursive: true });
  });

  it('increments version on re-deploy', async () => {
    const srcDir = await createAgentDir('versioned');

    const v1 = await store.store('versioned', srcDir);
    expect(v1.version).toBe(1);

    const v2 = await store.store('versioned', srcDir);
    expect(v2.version).toBe(2);

    await rm(srcDir, { recursive: true });
  });

  it('lists all agents', async () => {
    const dir1 = await createAgentDir('agent-a');
    const dir2 = await createAgentDir('agent-b');

    await store.store('agent-a', dir1);
    await store.store('agent-b', dir2);

    const agents = await store.list();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual(['agent-a', 'agent-b']);

    await rm(dir1, { recursive: true });
    await rm(dir2, { recursive: true });
  });

  it('returns null for nonexistent agent', async () => {
    const agent = await store.get('nonexistent');
    expect(agent).toBeNull();
  });

  it('deletes an agent', async () => {
    const srcDir = await createAgentDir('deleteme');
    await store.store('deleteme', srcDir);

    const deleted = await store.delete('deleteme');
    expect(deleted).toBe(true);

    const retrieved = await store.get('deleteme');
    expect(retrieved).toBeNull();

    await rm(srcDir, { recursive: true });
  });

  it('returns false when deleting nonexistent agent', async () => {
    const deleted = await store.delete('ghost');
    expect(deleted).toBe(false);
  });

  it('detects hasInstallScript', async () => {
    const dir = await createAgentDir('with-install');
    await writeFile(join(dir, 'install.sh'), '#!/bin/bash\necho hello');

    const agent = await store.store('with-install', dir);
    expect(agent.hasInstallScript).toBe(true);

    await rm(dir, { recursive: true });
  });

  it('loads config from .claude/settings.json', async () => {
    const dir = await createAgentDir('with-config');
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'settings.json'), JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      permissionMode: 'bypassPermissions',
    }));

    const agent = await store.store('with-config', dir);
    expect(agent.config.model).toBe('claude-sonnet-4-5-20250929');

    await rm(dir, { recursive: true });
  });
});
```

### Agent validator

```typescript
// packages/server/src/__tests__/validator.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateAgentDir } from '../registry/validator.js';

describe('validateAgentDir', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ash-validate-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('passes for valid agent with CLAUDE.md', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Agent');
    const result = validateAgentDir(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for missing CLAUDE.md', () => {
    const result = validateAgentDir(dir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required file: CLAUDE.md');
  });

  it('fails for invalid settings.json', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Agent');
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'settings.json'), 'not json{{{');

    const result = validateAgentDir(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('settings.json'))).toBe(true);
  });

  it('warns for non-executable install.sh', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Agent');
    await writeFile(join(dir, 'install.sh'), '#!/bin/bash');
    await chmod(join(dir, 'install.sh'), 0o644); // Not executable

    const result = validateAgentDir(dir);
    expect(result.valid).toBe(true); // Still valid, just a warning
    expect(result.warnings.some((w) => w.includes('install.sh'))).toBe(true);
  });
});
```

### SessionRouter: state machine

The session router is a state machine. Test the transitions, especially the error paths.

```typescript
// packages/server/src/__tests__/session-router.test.ts

import { describe, it, expect, vi } from 'vitest';
import { SessionRouter } from '../session/router.js';

function createMockRunnerClient() {
  return {
    createSandbox: vi.fn(async () => ({ id: 'sandbox-1' })),
    sendMessage: vi.fn(async () => new Response('event: done\ndata: {}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })),
    destroySandbox: vi.fn(async () => {}),
  };
}

describe('SessionRouter', () => {
  it('creates a session in active state', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    const session = await router.createSession('test-agent', '/agents/test-agent');

    expect(session.status).toBe('active');
    expect(session.agentName).toBe('test-agent');
    expect(session.sandboxId).toBe('sandbox-1');
    expect(session.id).toBeTruthy();
  });

  it('session is findable after creation', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    const created = await router.createSession('test', '/agents/test');
    const found = router.getSession(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('returns null for nonexistent session', () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    expect(router.getSession('nonexistent')).toBeNull();
  });

  it('sets status to ended if sandbox creation fails', async () => {
    const runner = createMockRunnerClient();
    runner.createSandbox.mockRejectedValueOnce(new Error('sandbox boom'));
    const router = new SessionRouter(runner);

    await expect(router.createSession('test', '/agents/test')).rejects.toThrow('sandbox boom');
  });

  it('cannot send message to ended session', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    const session = await router.createSession('test', '/agents/test');
    await router.endSession(session.id);

    await expect(router.sendMessage(session.id, 'hello')).rejects.toThrow(/ended/i);
  });

  it('lists sessions with filters', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    await router.createSession('agent-a', '/agents/a');
    await router.createSession('agent-b', '/agents/b');
    await router.createSession('agent-a', '/agents/a');

    expect(router.listSessions()).toHaveLength(3);
    expect(router.listSessions({ agentName: 'agent-a' })).toHaveLength(2);
    expect(router.listSessions({ agentName: 'agent-b' })).toHaveLength(1);
    expect(router.listSessions({ agentName: 'agent-c' })).toHaveLength(0);
  });

  it('updates lastActiveAt on message send', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    const session = await router.createSession('test', '/agents/test');
    const beforeSend = session.lastActiveAt;

    await new Promise((r) => setTimeout(r, 10));
    await router.sendMessage(session.id, 'ping');

    const updated = router.getSession(session.id);
    expect(updated!.lastActiveAt).not.toBe(beforeSend);
  });

  it('endSession destroys sandbox and sets status', async () => {
    const runner = createMockRunnerClient();
    const router = new SessionRouter(runner);

    const session = await router.createSession('test', '/agents/test');
    await router.endSession(session.id);

    expect(runner.destroySandbox).toHaveBeenCalledWith('sandbox-1');
    expect(router.getSession(session.id)!.status).toBe('ended');
  });
});
```

## What NOT to test

- Fastify routing (Fastify tests its own router)
- JSON parsing of request bodies (Fastify does this)
- HTTP status codes for routes — these are better tested in integration tests with real HTTP requests
