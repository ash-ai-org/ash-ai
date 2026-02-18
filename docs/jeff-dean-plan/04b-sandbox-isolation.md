# 04b: Actually Sandbox the Sandboxes

## Current State

Line 50 of `packages/runner/src/sandbox/manager.ts`:

```typescript
const bridgeProcess = spawn('node', [this.bridgeEntryPoint], {
  cwd: workspaceDir,
  env: {
    ...process.env,  // <-- inherits ALL host env vars
    ASH_BRIDGE_SOCKET: socketPath,
    ASH_AGENT_DIR: opts.agentDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

This is a normal child process. It can:

| Threat | Can it? | Impact |
|--------|---------|--------|
| Read any file on the host | Yes | Steal secrets, SSH keys, other agents' data |
| Write any file the user owns | Yes | Tamper with host system, other sandboxes |
| See all host processes | Yes | Enumerate what's running, find targets |
| Make arbitrary network requests | Yes | Exfiltrate data, attack internal services |
| Access host env vars | Yes | AWS keys, API tokens, database URLs from `...process.env` |
| Signal other processes | Yes | Kill other sandboxes, kill the runner |
| Read other sandboxes' workspaces | Yes | Cross-sandbox data leak |
| Read the agent store | Yes | Read other agents' CLAUDE.md and secrets |
| Mount filesystems | Depends on user | Potentially escape further |

The Claude agent inside the bridge has `permissionMode: 'bypassPermissions'` and `allowDangerouslySkipPermissions: true`. It can run arbitrary shell commands. The "sandbox" name is security theater.

## What "Sandboxed" Means

A sandboxed agent process should only see:

```
/                          (minimal root filesystem, read-only)
├── usr/                   (node, system libs — read-only)
├── workspace/             (agent's workspace — read-write)
├── agent/                 (CLAUDE.md, .claude/, tools/ — read-only)
├── tmp/                   (scratch space — read-write, size-limited)
└── run/
    └── bridge.sock        (communication socket — read-write)
```

And it should NOT have:
- Access to the host filesystem outside these mounts
- Visibility into host processes (PID namespace)
- Unrestricted network access (network namespace)
- Host environment variables
- Ability to signal processes outside the sandbox
- Ability to mount or unmount filesystems
- Access to host devices

## Implementation: bubblewrap (bwrap)

bubblewrap is the right tool. It's what Flatpak uses. It creates Linux namespaces without requiring root (uses unprivileged user namespaces). Fast startup (~5ms), no daemon, no image to pull.

### Install

```bash
# Ubuntu/Debian
apt install bubblewrap

# Amazon Linux 2023
dnf install bubblewrap

# Verify
bwrap --version
```

### The bwrap command

Replace `spawn('node', [...])` with `spawn('bwrap', [...])`:

```typescript
function buildBwrapArgs(opts: {
  sandboxId: string;
  bridgeEntryPoint: string;
  workspaceDir: string;
  agentDir: string;
  socketPath: string;
  rootfsDir: string;       // Pre-built base rootfs
  nodeBinDir: string;      // Path to node binary + modules
}): string[] {
  return [
    // -- Namespaces --
    '--unshare-pid',           // Own PID namespace (can't see host processes)
    '--unshare-uts',           // Own hostname
    '--unshare-ipc',           // Own IPC namespace
    '--unshare-cgroup',        // Own cgroup namespace

    // -- Root filesystem (read-only) --
    '--ro-bind', opts.rootfsDir, '/',

    // -- System essentials (read-only) --
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',       // if exists
    '--proc', '/proc',                      // needed by node
    '--dev', '/dev',                        // minimal /dev

    // -- Node.js runtime (read-only) --
    '--ro-bind', opts.nodeBinDir, '/usr/local/node',

    // -- Agent definition (read-only) --
    '--ro-bind', opts.agentDir, '/agent',

    // -- Workspace (read-write) --
    '--bind', opts.workspaceDir, '/workspace',

    // -- Temp space (read-write) --
    '--tmpfs', '/tmp',

    // -- Bridge socket (the only way to talk to the host) --
    '--bind', opts.socketPath, '/run/bridge.sock',

    // -- Network: isolated by default --
    '--unshare-net',
    // To allow network: remove --unshare-net, or use --share-net
    // Per-agent config controls this

    // -- User mapping --
    '--uid', '1000',
    '--gid', '1000',

    // -- Working directory --
    '--chdir', '/workspace',

    // -- Die when parent dies --
    '--die-with-parent',

    // -- The actual command --
    '/usr/local/node/bin/node',
    '/agent/bridge/index.js',   // bridge entry point, placed in agent dir
  ];
}
```

### Updated manager.ts spawn

```typescript
async createSandbox(opts: SandboxCreateOptions): Promise<SandboxInfo> {
  const id = randomUUID();
  const sandboxDir = join(this.sandboxesDir, id);
  const workspaceDir = join(sandboxDir, 'workspace');
  const socketPath = join(sandboxDir, BRIDGE_SOCKET_FILENAME);

  await mkdir(workspaceDir, { recursive: true });

  // Copy agent workspace files if they exist
  // ...

  // Build environment (only what the bridge needs, NOT host env)
  const sandboxEnv: Record<string, string> = {
    HOME: '/workspace',
    PATH: '/usr/local/node/bin:/usr/bin:/bin',
    NODE_PATH: '/usr/local/node/lib/node_modules',
    ASH_BRIDGE_SOCKET: '/run/bridge.sock',
    ASH_AGENT_DIR: '/agent',
    ASH_WORKSPACE_DIR: '/workspace',
    ASH_SANDBOX_ID: id,
    ASH_SESSION_ID: opts.sessionId || '',
    // Explicitly NO: AWS_*, ANTHROPIC_*, SSH_*, etc.
  };

  // If agent needs API keys, they come from agent config, not host env
  const agentSecrets = await this.loadAgentSecrets(opts.agentName);
  if (agentSecrets.ANTHROPIC_API_KEY) {
    sandboxEnv.ANTHROPIC_API_KEY = agentSecrets.ANTHROPIC_API_KEY;
  }

  let bridgeProcess: ChildProcess;

  if (this.useBwrap) {
    const bwrapArgs = buildBwrapArgs({
      sandboxId: id,
      bridgeEntryPoint: this.bridgeEntryPoint,
      workspaceDir,
      agentDir: opts.agentDir,
      socketPath,
      rootfsDir: this.rootfsDir,
      nodeBinDir: this.nodeBinDir,
    });
    bridgeProcess = spawn('bwrap', bwrapArgs, {
      env: sandboxEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    // Development fallback: no bwrap (macOS, or Linux without bwrap)
    bridgeProcess = spawn('node', [this.bridgeEntryPoint], {
      cwd: workspaceDir,
      env: sandboxEnv,  // Still use restricted env, even without bwrap
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  // ... rest of setup
}
```

## Rootfs: The Base Filesystem

Each sandbox gets a read-only root filesystem. Build it once, share it across all sandboxes.

### Build script: `deploy/ec2/base-rootfs.sh`

```bash
#!/bin/bash
# Create a minimal rootfs for sandbox processes

ROOTFS_DIR=/opt/ash/rootfs

mkdir -p $ROOTFS_DIR/{bin,usr/bin,lib,lib64,etc,tmp,workspace,agent,run}

# Copy essential binaries
cp /bin/sh $ROOTFS_DIR/bin/
cp /usr/bin/env $ROOTFS_DIR/usr/bin/

# Copy essential config
echo "root:x:0:0::/root:/bin/sh" > $ROOTFS_DIR/etc/passwd
echo "sandbox:x:1000:1000::/workspace:/bin/sh" >> $ROOTFS_DIR/etc/passwd
echo "root:x:0:" > $ROOTFS_DIR/etc/group
echo "sandbox:x:1000:" >> $ROOTFS_DIR/etc/group
echo "nameserver 8.8.8.8" > $ROOTFS_DIR/etc/resolv.conf

# Install Node.js (standalone, not system-wide)
NODE_VERSION=22.0.0
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" | \
  tar xJ -C /opt/ash/ --strip-components=1 --one-top-level=node

echo "Rootfs ready at $ROOTFS_DIR"
echo "Node.js at /opt/ash/node"
```

## Network Isolation Modes

Agents have different network needs. Configure per-agent:

```json
// .claude/settings.json
{
  "sandbox": {
    "network": "none"       // or "restricted" or "full"
  }
}
```

| Mode | bwrap flag | What it allows |
|------|-----------|----------------|
| `none` | `--unshare-net` | No network at all. Agent can only use local tools and files. |
| `restricted` | `--unshare-net` + slirp4netns | Outbound HTTP/HTTPS only, no inbound. DNS works. |
| `full` | (omit `--unshare-net`) | Full host network. Use only for agents that need it. |

For `restricted` mode, use `slirp4netns` to create a user-mode network namespace with outbound-only connectivity:

```typescript
if (networkMode === 'restricted') {
  // Start slirp4netns after bwrap creates the network namespace
  const slirp = spawn('slirp4netns', [
    '--configure',
    '--mtu=65520',
    '--disable-host-loopback',  // Can't reach host services
    String(bridgeProcess.pid),
    'tap0',
  ]);
}
```

## The `...process.env` Problem

Even without bwrap, the immediate fix is to stop leaking host environment:

```diff
- env: {
-   ...process.env,
-   ASH_BRIDGE_SOCKET: socketPath,
-   ASH_AGENT_DIR: opts.agentDir,
- },
+ env: {
+   HOME: workspaceDir,
+   PATH: process.env.PATH,
+   NODE_PATH: process.env.NODE_PATH || '',
+   ASH_BRIDGE_SOCKET: socketPath,
+   ASH_AGENT_DIR: opts.agentDir,
+   ASH_SANDBOX_ID: id,
+   ASH_WORKSPACE_DIR: workspaceDir,
+   // ANTHROPIC_API_KEY injected from agent secrets, not host env
+ },
```

This is a one-line fix that eliminates the most dangerous leak. Do it right now, before anything else in this doc.

## macOS Development Story

bwrap doesn't work on macOS (no user namespaces). Options for development:

### Option A: Just restrict the env (minimum viable)

On macOS, run without filesystem/PID isolation but with:
- Restricted environment (no host env leak)
- Workspace set to sandbox directory (honor the boundary by convention)
- Resource limits via ulimit (from step 04)

Good enough for local development. Not secure. Don't run untrusted agents on macOS.

### Option B: Docker

```typescript
if (process.platform === 'darwin') {
  const containerName = `ash-sandbox-${id}`;
  bridgeProcess = spawn('docker', [
    'run', '--rm',
    '--name', containerName,
    '--network=none',
    '--memory=512m',
    '--cpus=1',
    '-v', `${workspaceDir}:/workspace`,
    '-v', `${opts.agentDir}:/agent:ro`,
    '-v', `${socketPath}:/run/bridge.sock`,
    '-e', `ASH_BRIDGE_SOCKET=/run/bridge.sock`,
    '-e', `ASH_AGENT_DIR=/agent`,
    '-w', '/workspace',
    'ash-sandbox:latest',  // Pre-built image with node
    'node', '/agent/bridge/index.js',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}
```

Heavier (~200ms startup vs ~5ms for bwrap) but provides real isolation on macOS. Use this if you need to test isolation behavior locally.

### Recommendation

Use Option A for daily development (fast, good enough). Use Option B when testing isolation-specific behavior. Use bwrap in production (Linux).

## Agent Secrets Management

Agents often need API keys (ANTHROPIC_API_KEY for the SDK, or custom keys for MCP tools). These should NOT come from the host environment. They should be:

1. **Stored per-agent** in the agent store (encrypted at rest, later)
2. **Injected at sandbox creation** into the sandbox env
3. **Not visible to other agents**

For Phase 1, store them in a simple file:

```
data/agents/<agent-name>/secrets.json
```

```json
{
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "CUSTOM_API_KEY": "..."
}
```

The manager reads this file and injects only the keys for that specific agent:

```typescript
async loadAgentSecrets(agentName: string): Promise<Record<string, string>> {
  const secretsPath = join(this.agentsDir, agentName, 'secrets.json');
  try {
    return JSON.parse(await readFile(secretsPath, 'utf-8'));
  } catch {
    return {};
  }
}
```

This is not good secrets management. But it's infinitely better than `...process.env` which gives every agent every secret on the host.

## Isolation Verification

How do you know the sandbox actually works? Test it:

```typescript
// test/sandbox-isolation.test.ts

test('sandbox cannot read host /etc/passwd', async () => {
  const result = await runInSandbox('cat /etc/passwd');
  // Should see the sandbox's minimal passwd, not the host's
  expect(result).not.toContain(os.userInfo().username);
});

test('sandbox cannot see host processes', async () => {
  const result = await runInSandbox('ps aux');
  // Should only see PID 1 (bwrap init) and the node process
  expect(result.split('\n').length).toBeLessThan(5);
});

test('sandbox cannot reach the network', async () => {
  const result = await runInSandbox('curl -s https://example.com', { network: 'none' });
  expect(result).toContain('Connection refused');  // or timeout
});

test('sandbox cannot read other sandboxes', async () => {
  // Create sandbox A with a file
  // Create sandbox B, try to read sandbox A's file
  // Should fail
});

test('sandbox env does not contain host secrets', async () => {
  process.env.SUPER_SECRET = 'should-not-leak';
  const result = await runInSandbox('env');
  expect(result).not.toContain('SUPER_SECRET');
  expect(result).not.toContain('should-not-leak');
  delete process.env.SUPER_SECRET;
});
```

## Priority and Ordering

1. **Right now** (5 minutes): Fix the `...process.env` leak. This is the `env: sandboxEnv` change above.
2. **Before running untrusted agents**: Implement bwrap isolation on Linux.
3. **Before multi-tenant**: Add network isolation, secrets management, and isolation tests.

Step 1 costs nothing and eliminates the worst vulnerability. Do it as part of this PR.
