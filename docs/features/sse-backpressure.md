# SSE Stream Backpressure

**Date**: 2026-02-18
**Plan step**: [05-backpressure](../jeff-dean-plan/05-backpressure.md)

## What

Flow control on the two write boundaries in the streaming pipeline:

1. **Bridge → Unix socket**: `send()` in the bridge process now awaits `drain` when the socket buffer is full
2. **Fastify → SSE/TCP**: `writeSSE()` helper awaits `drain` with a 30-second timeout for dead clients

## Why

Without backpressure, a fast agent producing events to a slow client causes unbounded memory growth. At 100 concurrent sessions with slow clients, that's 100 × unbounded = OOM.

Node.js `writable.write()` returns `false` when the kernel buffer is full. Ignoring this and continuing to write causes Node.js to buffer in userspace without limit.

## How

### Bridge side (`packages/bridge/src/index.ts`)

```typescript
async function send(conn: net.Socket, event: BridgeEvent): Promise<void> {
  const canWrite = conn.write(encode(event));
  if (!canWrite) {
    await new Promise<void>((resolve) => conn.once('drain', resolve));
  }
}
```

When the runner (BridgeClient) isn't consuming events fast enough, the bridge pauses the SDK query loop. This propagates backpressure all the way to the Claude SDK.

### Server side (`packages/server/src/routes/sessions.ts`)

```typescript
async function writeSSE(raw: ServerResponse, frame: string): Promise<void> {
  const canWrite = raw.write(frame);
  if (!canWrite) {
    const drained = await Promise.race([
      new Promise<true>((resolve) => raw.once('drain', () => resolve(true))),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), SSE_WRITE_TIMEOUT_MS)),
    ]);
    if (!drained) {
      throw new Error('Client write timeout — closing stream');
    }
  }
}
```

If the client stops reading entirely (dead TCP connection, no RST), the timeout fires after 30 seconds and closes the stream. The sandbox keeps running — the session is still active and the client can reconnect.

### Full pipeline with backpressure

```
SDK query loop
    ↓ (pauses when bridge send() awaits drain)
Bridge send()
    ↓ (respects Unix socket backpressure)
Unix Socket
    ↓ (BridgeClient reads at consumption pace)
BridgeClient async generator
    ↓ (pauses when writeSSE() awaits drain)
writeSSE()
    ↓ (respects TCP backpressure, 30s timeout)
Client
```

Memory per connection is now bounded to `highWaterMark` bytes in kernel + `highWaterMark` bytes in Node.js userspace. Constant regardless of agent speed or client speed.

## Constants

- `SSE_WRITE_TIMEOUT_MS`: 30,000ms — in `packages/shared/src/constants.ts`

## Known Limitations

- The BridgeClient's internal `queue` array still has no maximum size. If the Fastify handler pauses (waiting for client drain), events from the bridge accumulate in-memory in the BridgeClient queue. This is bounded indirectly — the bridge-side backpressure slows event production — but a hard cap on queue size would be a belt-and-suspenders improvement.
- No per-connection memory metrics yet. Step 06 (measure) will add observability.

## Tests

- `packages/server/src/__tests__/backpressure.test.ts` — 4 tests:
  - Writes immediately when buffer has room
  - Waits for drain when write returns false
  - Blocks when client never drains (timeout behavior)
  - Multiple sequential writes with backpressure
