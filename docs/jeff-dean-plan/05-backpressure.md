# 05: Add Backpressure to SSE Streams

## Current State

The message flow for streaming responses:

```
Bridge → (unix socket) → BridgeClient → (async generator) → Fastify handler → (SSE) → Client
```

The Fastify handler does:

```typescript
for await (const event of events) {
  reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
```

`reply.raw.write()` returns a boolean. If it returns `false`, the kernel TCP send buffer is full — the client isn't reading fast enough. We ignore this and keep writing.

### What happens

1. Fast agent produces 1000 tool_use events quickly
2. Slow client (bad network, mobile, overloaded browser) reads at 10 events/sec
3. Node.js buffers all 1000 events in the write stream's internal buffer
4. Memory grows unboundedly
5. At 100 concurrent sessions with slow clients: 100 × unbounded = OOM

## Fix

### Step 1: Respect write() backpressure

```typescript
async function writeSSE(raw: ServerResponse, event: BridgeEvent): Promise<void> {
  const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  const canWrite = raw.write(data);
  if (!canWrite) {
    // Wait for drain before writing more
    await new Promise<void>((resolve) => raw.once('drain', resolve));
  }
}
```

Then in the handler:

```typescript
for await (const event of events) {
  await writeSSE(reply.raw, event);
}
```

This is the minimum fix. If the client is slow, the async generator pauses, which pauses reading from the bridge, which applies backpressure to the bridge process via the Unix socket. The whole pipeline slows to the speed of the slowest consumer. Correct behavior.

### Step 2: Add a timeout for stuck clients

A client that connects and then stops reading entirely (dead connection, no TCP RST) will block the bridge forever. Add a write timeout:

```typescript
async function writeSSE(raw: ServerResponse, event: BridgeEvent): Promise<void> {
  const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  const canWrite = raw.write(data);
  if (!canWrite) {
    const drained = await Promise.race([
      new Promise<true>((resolve) => raw.once('drain', () => resolve(true))),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 30_000)),
    ]);
    if (!drained) {
      throw new Error('Client write timeout — closing stream');
    }
  }
}
```

30 seconds of no reads = dead client. Kill the stream, let the sandbox keep running (session is still active, client can reconnect).

### Step 3: Bridge-side flow control

The bridge's Unix socket also needs backpressure. In `handler.ts`:

```typescript
// When writing events back to the runner
const canWrite = socket.write(encodeBridgeMessage(event));
if (!canWrite) {
  await new Promise<void>((resolve) => socket.once('drain', resolve));
}
```

This ensures the SDK query loop pauses if the runner isn't consuming events fast enough.

## What About Buffering a Little?

A small buffer is fine. Node.js writable streams already have a `highWaterMark` (default 16KB). That's ~50-100 small SSE events. We don't need to eliminate buffering — we need to bound it.

The fix above bounds it to `highWaterMark` bytes in the kernel + `highWaterMark` bytes in Node.js userspace. Constant memory per connection regardless of agent speed or client speed.

## Testing

Write a test that:
1. Creates a sandbox with a mock agent that produces events rapidly
2. Connects a client that reads one event per second
3. Asserts that server memory stays constant (not growing)
4. Asserts that after 1000 events, memory is still < 10MB for the connection

This is hard to unit test. A load test with `k6` or a simple Node.js script is better.
