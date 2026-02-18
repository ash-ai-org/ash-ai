# 03: Fix the Bridge Connect Race

## Current State

In `packages/runner/src/sandbox/bridge.ts`, the `connect()` method:

```typescript
const tryConnect = () => {
  const socket = connect({ path: this.socketPath });
  socket.on('error', (err) => {
    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
      setTimeout(tryConnect, 100);  // <-- this
    }
  });
};
tryConnect();
```

The runner spawns the bridge process, then immediately starts polling the Unix socket every 100ms until it appears. The bridge process, meanwhile, is doing its startup (parsing env vars, loading CLAUDE.md, creating the socket server, calling `server.listen()`).

### Why this is wrong

1. **It's a race.** The socket file can exist before `listen()` completes. You connect, the kernel queues it, but the bridge hasn't called `accept()` yet. Usually works. Sometimes doesn't.

2. **It wastes time.** Average wait is 50ms (half a polling interval). At 1000 sandbox creates, that's 50 seconds of accumulated idle spinning.

3. **The timeout is arbitrary.** `BRIDGE_CONNECT_TIMEOUT_MS` is 10 seconds. If the bridge takes 10.05 seconds to start (slow disk, cold npm cache), you get a hard failure with no useful error.

4. **Error conflation.** `ECONNREFUSED` can mean "bridge not ready yet" or "bridge crashed on startup." The retry loop treats them identically.

## Fix: Parent Creates Socket, Child Inherits

The runner creates the Unix socket server. The bridge process inherits the file descriptor.

### Runner side (manager.ts)

```typescript
import { createServer } from 'node:net';

async function createSandbox(opts: SandboxCreateOptions): Promise<SandboxInfo> {
  const socketPath = join(sandboxDir, BRIDGE_SOCKET_FILENAME);

  // Parent creates the socket server
  const socketServer = createServer();
  await new Promise<void>((resolve, reject) => {
    socketServer.listen(socketPath, resolve);
    socketServer.on('error', reject);
  });

  // Spawn bridge with the socket server's fd
  const bridgeProcess = spawn('node', [this.bridgeEntryPoint], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      ASH_BRIDGE_SOCKET: socketPath,
      ASH_AGENT_DIR: opts.agentDir,
    },
    stdio: ['ignore', 'pipe', 'pipe', socketServer],  // fd 3 = socket server
  });

  // Close our reference — the child owns it now
  socketServer.close();

  // Now connect as client. The server is already listening.
  // No polling. No race.
  const client = new BridgeClient(socketPath);
  await client.connect();  // Connects immediately — socket is already bound

  // Wait for the bridge to send 'ready' event
  await client.waitForReady(BRIDGE_READY_TIMEOUT_MS);

  return info;
}
```

### Bridge side (index.ts)

```typescript
import { createServer } from 'node:net';

function main() {
  let server: net.Server;

  if (process.env.ASH_BRIDGE_FD) {
    // Inherited socket — adopt it
    const fd = parseInt(process.env.ASH_BRIDGE_FD, 10);
    server = createServer();
    server.listen({ fd });
  } else if (process.argv[3]) {
    // Fallback: fd passed via stdio (fd 3)
    server = createServer();
    server.listen({ fd: 3 });
  } else {
    // Standalone mode: create our own socket
    const socketPath = process.env.ASH_BRIDGE_SOCKET;
    server = createServer();
    server.listen(socketPath);
  }

  server.on('connection', (socket) => {
    // ... existing handler code
    socket.write(encodeBridgeMessage({ type: 'ready' }));
  });
}
```

### Alternative: Simpler Approach With Readiness Signal

If the fd inheritance is too clever, a simpler fix:

1. Bridge writes a single byte to stdout when `server.listen()` callback fires
2. Runner reads that byte instead of polling the socket

```typescript
// Bridge: signal ready via stdout
server.listen(socketPath, () => {
  process.stdout.write('R');  // Ready signal
});

// Runner: wait for ready signal
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Bridge startup timeout')), BRIDGE_READY_TIMEOUT_MS);
  bridgeProcess.stdout.once('data', () => {
    clearTimeout(timeout);
    resolve();
  });
  bridgeProcess.on('exit', (code) => {
    clearTimeout(timeout);
    reject(new Error(`Bridge exited with code ${code} during startup`));
  });
});

// Now connect — socket guaranteed to be listening
const client = new BridgeClient(socketPath);
await client.connect();
```

This is less elegant but easier to understand and debug. **Prefer this.**

## What This Fixes

| Issue | Before | After |
|-------|--------|-------|
| Race condition | Socket file exists before listen() completes | Explicit ready signal |
| Startup latency | 0-100ms polling jitter per sandbox | <1ms (direct signal) |
| Error reporting | ECONNREFUSED = retry (maybe forever) | Bridge exit code + stderr on failure |
| Timeout handling | Silent failure after 10s | Explicit error with bridge stderr |
