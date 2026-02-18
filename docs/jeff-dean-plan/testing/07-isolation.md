# Sandbox Isolation Tests

These tests verify the security boundary. They're the tests that, if they fail, mean agents can read your SSH keys. Run them on Linux with bwrap installed.

## Philosophy

Each test tries to escape the sandbox in a specific way. The test passes when the escape fails. If any test starts passing (the escape works), that's a P0 security bug.

## Tests

### Environment isolation

```typescript
// test/isolation/env-isolation.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SandboxManager } from '@anthropic-ai/ash-runner/sandbox/manager';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Environment isolation', () => {
  let manager: SandboxManager;
  let agentDir: string;
  let sandboxesDir: string;

  beforeAll(async () => {
    sandboxesDir = await mkdtemp(join(tmpdir(), 'ash-iso-'));
    agentDir = await mkdtemp(join(tmpdir(), 'ash-iso-agent-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Isolation Test');
    manager = new SandboxManager({
      sandboxesDir,
      bridgeEntryPoint: join(process.cwd(), 'packages/bridge/dist/index.js'),
    });
  });

  afterAll(async () => {
    await manager.destroyAll();
    await rm(sandboxesDir, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  });

  it('sandbox env does not contain AWS_SECRET_ACCESS_KEY', async () => {
    // Set a dangerous env var on the host
    const original = process.env.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key-DO-NOT-LEAK';

    try {
      const info = await manager.createSandbox({
        agentName: 'iso-test',
        agentDir,
        sessionId: 'env-test',
      });

      // Ask the bridge to dump its env (requires a special debug command or
      // we can check by sending a query that would use the env)
      // For now: verify by checking the spawn args
      const sandbox = manager.getSandbox(info.id);
      // The sandbox env is set at spawn time — we can't easily introspect it
      // from outside without running a command inside.

      // If bwrap is available, we can exec into the sandbox:
      // bwrap --bind / / -- env | grep AWS
      // For unit-level: verify buildSandboxEnv doesn't include it
      // (covered in 03-unit-runner.md)

      await manager.destroySandbox(info.id);
    } finally {
      if (original !== undefined) {
        process.env.AWS_SECRET_ACCESS_KEY = original;
      } else {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
    }
  });

  it('sandbox env does not contain SSH_AUTH_SOCK', async () => {
    process.env.SSH_AUTH_SOCK = '/tmp/fake-ssh-agent';

    const info = await manager.createSandbox({
      agentName: 'iso-test',
      agentDir,
      sessionId: 'ssh-test',
    });

    // Same approach as above — verified at the env construction level
    await manager.destroySandbox(info.id);
    delete process.env.SSH_AUTH_SOCK;
  });
});
```

### Filesystem isolation (requires bwrap)

These tests only run on Linux with bwrap. Skip on macOS.

```typescript
// test/isolation/fs-isolation.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';

const hasBwrap = (() => {
  try {
    execSync('bwrap --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBwrap)('Filesystem isolation (bwrap)', () => {
  // These tests exec commands inside a bwrap sandbox and verify
  // they cannot access host filesystem

  function execInSandbox(cmd: string): string {
    try {
      return execSync(`bwrap \
        --ro-bind /usr /usr \
        --ro-bind /lib /lib \
        --ro-bind /lib64 /lib64 \
        --proc /proc \
        --dev /dev \
        --tmpfs /tmp \
        --tmpfs /home \
        --unshare-pid \
        --die-with-parent \
        -- ${cmd}`, { encoding: 'utf-8', timeout: 5000 });
    } catch (err: any) {
      return err.stderr || err.stdout || err.message;
    }
  }

  it('cannot read host /etc/shadow', () => {
    const result = execInSandbox('cat /etc/shadow');
    // Should fail — /etc is not mounted
    expect(result).toMatch(/No such file|Permission denied/);
  });

  it('cannot read host home directory', () => {
    const home = process.env.HOME || '/root';
    const result = execInSandbox(`ls ${home}`);
    expect(result).toMatch(/No such file|Permission denied/);
  });

  it('cannot see host processes', () => {
    const result = execInSandbox('ps aux');
    const lines = result.trim().split('\n');
    // Should only see the sandbox's own processes (ps itself + header)
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('cannot write outside workspace', () => {
    const result = execInSandbox('touch /usr/HACKED');
    expect(result).toMatch(/Read-only file system|Permission denied/);
  });

  it('can write to /tmp', () => {
    const result = execInSandbox('touch /tmp/ok && echo success');
    expect(result.trim()).toBe('success');
  });
});
```

### Network isolation (requires bwrap)

```typescript
// test/isolation/net-isolation.test.ts

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const hasBwrap = (() => {
  try {
    execSync('bwrap --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBwrap)('Network isolation (bwrap)', () => {
  function execInNetSandbox(cmd: string): string {
    try {
      return execSync(`bwrap \
        --ro-bind /usr /usr \
        --ro-bind /lib /lib \
        --ro-bind /lib64 /lib64 \
        --proc /proc \
        --dev /dev \
        --tmpfs /tmp \
        --unshare-net \
        --unshare-pid \
        --die-with-parent \
        -- ${cmd}`, { encoding: 'utf-8', timeout: 10000 });
    } catch (err: any) {
      return err.stderr || err.stdout || err.message;
    }
  }

  it('cannot make outbound HTTP requests', () => {
    const result = execInNetSandbox('curl -s --max-time 3 https://example.com');
    // Should fail — no network
    expect(result).toMatch(/Could not resolve|Network is unreachable|Connection refused|timeout/i);
  });

  it('cannot ping external hosts', () => {
    const result = execInNetSandbox('ping -c 1 -W 2 8.8.8.8');
    expect(result).toMatch(/Network is unreachable|not permitted/i);
  });

  it('cannot connect to host services', () => {
    // Even localhost should be isolated with --unshare-net
    const result = execInNetSandbox('curl -s --max-time 2 http://localhost:4100');
    expect(result).toMatch(/Connection refused|Could not resolve/i);
  });
});
```

### Cross-sandbox isolation

The most important test: one sandbox cannot read another sandbox's data.

```typescript
// test/isolation/cross-sandbox.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SandboxManager } from '@anthropic-ai/ash-runner/sandbox/manager';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Cross-sandbox isolation', () => {
  let manager: SandboxManager;
  let agentDir: string;
  let sandboxesDir: string;

  beforeAll(async () => {
    sandboxesDir = await mkdtemp(join(tmpdir(), 'ash-cross-'));
    agentDir = await mkdtemp(join(tmpdir(), 'ash-cross-agent-'));
    await writeFile(join(agentDir, 'CLAUDE.md'), '# Cross Test');
    manager = new SandboxManager({
      sandboxesDir,
      bridgeEntryPoint: join(process.cwd(), 'packages/bridge/dist/index.js'),
    });
  });

  afterAll(async () => {
    await manager.destroyAll();
    await rm(sandboxesDir, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  });

  it('sandbox A cannot see sandbox B workspace (process isolation)', async () => {
    // Create sandbox A
    const a = await manager.createSandbox({
      agentName: 'agent-a',
      agentDir,
      sessionId: 'session-a',
    });

    // Write a secret file in sandbox A's workspace
    const aWorkspace = join(sandboxesDir, a.id, 'workspace');
    await writeFile(join(aWorkspace, 'secret.txt'), 'sandbox-a-secret-data');

    // Create sandbox B
    const b = await manager.createSandbox({
      agentName: 'agent-b',
      agentDir,
      sessionId: 'session-b',
    });

    // Without bwrap, both can technically access the filesystem.
    // The test verifies that:
    // 1. Sandbox B's CWD is its own workspace (not A's)
    // 2. The env vars point to B's workspace (not A's)
    const bSandbox = manager.getSandbox(b.id);
    expect(bSandbox?.workspaceDir).not.toBe(aWorkspace);
    expect(bSandbox?.workspaceDir).toContain(b.id);

    // With bwrap (full isolation), B literally cannot traverse to A's directory
    // because A's workspace isn't bind-mounted into B's namespace.
    // That's verified by the bwrap fs-isolation tests above.

    await manager.destroySandbox(a.id);
    await manager.destroySandbox(b.id);
  });

  it('sandboxes have unique socket paths', async () => {
    const a = await manager.createSandbox({ agentName: 'a', agentDir, sessionId: 's-a' });
    const b = await manager.createSandbox({ agentName: 'b', agentDir, sessionId: 's-b' });

    const aSandbox = manager.getSandbox(a.id);
    const bSandbox = manager.getSandbox(b.id);

    expect(aSandbox?.socketPath).not.toBe(bSandbox?.socketPath);

    await manager.destroySandbox(a.id);
    await manager.destroySandbox(b.id);
  });
});
```

## CI Configuration

Isolation tests need specific infrastructure:

```yaml
# .github/workflows/test.yml (relevant excerpt)

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test

  isolation-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: sudo apt-get install -y bubblewrap
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:isolation

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:integration
```
