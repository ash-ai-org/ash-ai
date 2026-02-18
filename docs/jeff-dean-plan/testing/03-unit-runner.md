# Unit Tests: packages/runner

The runner manages sandbox lifecycles and bridge communication. The tests here must use real processes and real Unix sockets — mocking the OS primitives defeats the purpose.

## What to test

### BridgeClient: connection and streaming

```typescript
// packages/runner/src/__tests__/bridge-client.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BridgeClient } from '../sandbox/bridge.js';
import { encodeBridgeMessage } from '@anthropic-ai/ash-shared';
import type { BridgeEvent, BridgeCommand } from '@anthropic-ai/ash-shared';

function tmpSocket(): string {
  return path.join(os.tmpdir(), `ash-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
}

describe('BridgeClient', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
  });

  function createMockBridge(socketPath: string) {
    const server = net.createServer();
    server.listen(socketPath);
    cleanups.push(() => {
      server.close();
      try { fs.unlinkSync(socketPath); } catch {}
    });
    return server;
  }

  it('connects to a Unix socket', async () => {
    const socketPath = tmpSocket();
    createMockBridge(socketPath);

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());

    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  it('retries if socket does not exist yet', async () => {
    const socketPath = tmpSocket();

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());

    // Create socket after a delay (simulates bridge startup)
    setTimeout(() => createMockBridge(socketPath), 200);

    await client.connect(); // Should succeed after retry
    expect(client.isConnected).toBe(true);
  });

  it('times out if socket never appears', async () => {
    const socketPath = tmpSocket(); // Never created

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());

    await expect(client.connect()).rejects.toThrow(/timeout/i);
  });

  it('receives events from bridge', async () => {
    const socketPath = tmpSocket();
    const server = createMockBridge(socketPath);

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());
    await client.connect();

    const received: BridgeEvent[] = [];
    client.on('event', (e: BridgeEvent) => received.push(e));

    // Server sends an event
    server.on('connection', (conn) => {
      conn.write(encodeBridgeMessage({ type: 'ready' } as BridgeEvent));
      conn.write(encodeBridgeMessage({ type: 'assistant_message', content: 'hi' } as BridgeEvent));
    });

    // Trigger reconnect to get a connection (or wait for existing)
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBeGreaterThanOrEqual(1);
  });

  it('sends commands to bridge', async () => {
    const socketPath = tmpSocket();
    const server = createMockBridge(socketPath);

    const receivedData: string[] = [];
    server.on('connection', (conn) => {
      conn.on('data', (chunk) => receivedData.push(chunk.toString()));
    });

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());
    await client.connect();

    client.send({ action: 'query', message: 'hello', sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedData.join('')).toContain('"action":"query"');
    expect(receivedData.join('')).toContain('"message":"hello"');
  });

  it('emits close when bridge disconnects', async () => {
    const socketPath = tmpSocket();
    const server = createMockBridge(socketPath);

    const client = new BridgeClient(socketPath);
    cleanups.push(() => client.disconnect());
    await client.connect();

    const closed = new Promise<void>((resolve) => client.on('close', resolve));

    // Kill the server
    server.close();
    // Force close existing connections
    server.on('connection', (conn) => conn.destroy());

    // The client should detect the close
    await expect(
      Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))])
    ).resolves.toBeUndefined();
  });

  it('throws when sending on disconnected client', () => {
    const client = new BridgeClient('/nonexistent.sock');
    expect(() => client.send({ action: 'shutdown' })).toThrow(/not connected/i);
  });
});
```

### SandboxManager: environment isolation

The most critical unit test in the project. Verify the sandbox env doesn't leak host secrets.

```typescript
// packages/runner/src/__tests__/sandbox-env.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// This test doesn't spawn a real sandbox — it tests the env construction logic.
// Extract the env construction into a testable function.

import { buildSandboxEnv } from '../sandbox/manager.js';

describe('sandbox environment isolation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up dangerous host env vars
    process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-aws-key';
    process.env.DATABASE_URL = 'postgres://admin:password@prod-db:5432';
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
    process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxx';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    // Restore
    process.env = { ...originalEnv };
  });

  it('does not include AWS credentials', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it('does not include database URLs', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('does not include SSH agent socket', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
  });

  it('does not include GitHub tokens', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it('does include ANTHROPIC_API_KEY (agents need it for SDK)', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
  });

  it('includes PATH', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.PATH).toBeTruthy();
  });

  it('includes ASH_ variables', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    expect(env.ASH_SANDBOX_ID).toBe('test');
    expect(env.ASH_AGENT_DIR).toBe('/agent');
    expect(env.ASH_WORKSPACE_DIR).toBe('/ws');
  });

  it('only contains explicitly allowed keys', () => {
    const env = buildSandboxEnv({ sandboxId: 'test', agentDir: '/agent', workspaceDir: '/ws' });
    const allowedPrefixes = ['HOME', 'PATH', 'NODE_PATH', 'ASH_', 'ANTHROPIC_API_KEY'];
    for (const key of Object.keys(env)) {
      const isAllowed = allowedPrefixes.some((p) => key === p || key.startsWith(p));
      expect(isAllowed, `Unexpected env var: ${key}`).toBe(true);
    }
  });
});
```

**Note**: This requires extracting the env construction from `manager.ts` into a `buildSandboxEnv()` function. That's the right refactor — makes the security-critical logic independently testable.

### SandboxPool: capacity enforcement

```typescript
// packages/runner/src/__tests__/pool.test.ts

import { describe, it, expect, vi } from 'vitest';
import { SandboxPool } from '../sandbox/pool.js';

// Create a mock SandboxManager for pool tests
function createMockManager() {
  const sandboxes: { id: string; state: string }[] = [];
  return {
    listSandboxes: () => sandboxes.map((s) => ({ ...s, agentName: 'test', sessionId: null, createdAt: '', pid: null })),
    createSandbox: vi.fn(async () => {
      const info = { id: `sb-${sandboxes.length}`, agentName: 'test', sessionId: null, state: 'active' as const, createdAt: '', pid: null };
      sandboxes.push({ id: info.id, state: 'active' });
      return info;
    }),
    destroySandbox: vi.fn(async (id: string) => {
      const idx = sandboxes.findIndex((s) => s.id === id);
      if (idx >= 0) sandboxes.splice(idx, 1);
    }),
    getBridgeClient: vi.fn(() => null),
    getSandbox: vi.fn(),
    destroyAll: vi.fn(),
    _sandboxes: sandboxes,
  };
}

describe('SandboxPool', () => {
  it('reports capacity correctly', () => {
    const manager = createMockManager();
    const pool = new SandboxPool(manager as any, { maxActive: 10 });

    const cap = pool.getCapacity();
    expect(cap.active).toBe(0);
    expect(cap.max).toBe(10);
  });

  it('allows allocation within capacity', async () => {
    const manager = createMockManager();
    const pool = new SandboxPool(manager as any, { maxActive: 2 });

    await pool.allocate({ agentName: 'test', agentDir: '/agent' });
    expect(pool.getCapacity().active).toBe(1);
    expect(pool.canAllocate()).toBe(true);
  });

  it('rejects allocation at capacity', async () => {
    const manager = createMockManager();
    const pool = new SandboxPool(manager as any, { maxActive: 1 });

    await pool.allocate({ agentName: 'test', agentDir: '/agent' });
    expect(pool.canAllocate()).toBe(false);

    await expect(
      pool.allocate({ agentName: 'test', agentDir: '/agent' })
    ).rejects.toThrow(/capacity/i);
  });

  it('frees capacity on release', async () => {
    const manager = createMockManager();
    const pool = new SandboxPool(manager as any, { maxActive: 1 });

    const info = await pool.allocate({ agentName: 'test', agentDir: '/agent' });
    expect(pool.canAllocate()).toBe(false);

    await pool.release(info.id);
    expect(pool.canAllocate()).toBe(true);
  });
});
```

## What NOT to test

- Bubblewrap flags (those are tested by the bwrap project)
- Child process spawning mechanics (tested by Node.js)
- File copy operations (tested in integration)
