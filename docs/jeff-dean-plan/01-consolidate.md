# 01: Consolidate Server + Runner Into One Process

## Current State

```
Client → HTTP → ash-server (port 4100) → HTTP → ash-runner (port 4200) → Unix socket → bridge
```

The server makes `fetch()` calls to the runner over localhost HTTP. The runner is a separate Fastify instance. Both run on the same machine. The server proxies SSE streams byte-by-byte from the runner to the client.

This means:
- Two processes to start, monitor, and restart
- An HTTP serialization/deserialization round-trip on every message
- SSE proxy buffering in the server (see [05-backpressure](./05-backpressure.md))
- Two ports to configure
- If the runner crashes, the server has stale session routing state pointing at dead sandboxes

## Target State

```
Client → HTTP → ash (port 4100) → Unix socket → bridge
```

One Fastify process. The `SandboxManager` and `SandboxPool` are imported directly, not called over HTTP. The session router calls `manager.getBridgeClient(sandboxId)` in-process instead of `fetch('http://localhost:4200/sandbox/...')`.

## How

### Step 1: Create `packages/server/src/local-runner.ts`

Import `SandboxManager` and `SandboxPool` directly from the runner package:

```typescript
import { SandboxManager } from '@anthropic-ai/ash-runner/sandbox/manager';
import { SandboxPool } from '@anthropic-ai/ash-runner/sandbox/pool';

export class LocalRunner {
  private manager: SandboxManager;
  private pool: SandboxPool;

  constructor(config: { sandboxesDir: string; bridgeEntryPoint: string }) {
    this.manager = new SandboxManager(config);
    this.pool = new SandboxPool(this.manager);
  }

  async createSandbox(agentName: string, agentDir: string, sessionId: string) {
    return this.pool.allocate({ agentName, agentDir, sessionId });
  }

  getBridgeClient(sandboxId: string) {
    return this.manager.getBridgeClient(sandboxId);
  }

  async destroySandbox(sandboxId: string) {
    return this.pool.release(sandboxId);
  }
}
```

### Step 2: Rewrite session message handler

Instead of proxying an HTTP SSE stream, write directly from the bridge client to the Fastify response:

```typescript
app.post('/api/sessions/:id/messages', async (request, reply) => {
  const bridge = localRunner.getBridgeClient(sandboxId);
  const events = await bridge.sendAndStream({ action: 'query', message: content, sessionId });

  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for await (const event of events) {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  reply.raw.end();
});
```

No fetch. No intermediate HTTP response to parse. Bridge events go straight to the client.

### Step 3: Export runner internals for in-process use

Update `packages/runner/package.json` exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./sandbox/manager": "./dist/sandbox/manager.js",
    "./sandbox/pool": "./dist/sandbox/pool.js",
    "./sandbox/bridge": "./dist/sandbox/bridge.js"
  }
}
```

### Step 4: Keep the runner's standalone mode

Don't delete `packages/runner/src/index.ts` and `api.ts`. They're needed for [08-split-when-full](./08-split-when-full.md). Just stop using them as the default.

### Step 5: Single entry point

```bash
# Before (two processes):
pnpm --filter @anthropic-ai/ash-runner start &
pnpm --filter @anthropic-ai/ash-server start

# After (one process):
pnpm --filter @anthropic-ai/ash-server start
```

The server config gets the runner config fields (sandboxesDir, bridgeEntryPoint, maxActive). One port. One process. One log stream.

## What This Deletes

- The `runnerClient` object in `server/src/index.ts` (the fetch-based HTTP client)
- The server → runner HTTP proxy in session message handling
- The need to start two processes
- The `ASH_RUNNER_URL` config variable

## What This Preserves

- The `SandboxManager` / `BridgeClient` / `SandboxPool` abstractions (they're good)
- The runner's standalone HTTP API (for future multi-machine use)
- The control plane / data plane conceptual split (it's in-process, not gone)

## Estimated Latency Impact

Removes ~2-5ms per message (localhost HTTP round-trip + SSE proxy overhead). More importantly, removes an entire failure mode and simplifies debugging from "which process has the bug" to "read the one log."
