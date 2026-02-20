---
sidebar_position: 6
title: SSE Backpressure
---

# SSE Backpressure

## Problem

When a fast agent produces messages faster than a slow client can consume them, the server-side write buffer grows without bound. With many concurrent sessions, this leads to unbounded memory usage and eventual out-of-memory crashes.

```
Agent (fast)  -->  Bridge  -->  Server  -->  SSE  -->  Client (slow)
                                          ^^^^^^^^^^
                                          Buffer grows here
```

## Solution

Ash respects backpressure at every boundary in the pipeline. When the downstream consumer cannot accept data, the upstream producer pauses.

### Bridge Side

The bridge's `send()` function checks the return value of `socket.write()`. If the kernel buffer is full, it waits for the `drain` event before sending more data. This prevents the bridge from flooding the Unix socket.

### Server Side

The `writeSSE()` function in the session routes checks if `response.write()` returns `false` (indicating the TCP send buffer is full). If so, it waits for the `drain` event with a 30-second timeout.

```typescript
async function writeSSE(raw: ServerResponse, frame: string): Promise<void> {
  const canWrite = raw.write(frame);
  if (!canWrite) {
    const drained = await Promise.race([
      new Promise<true>((resolve) => {
        raw.once('drain', () => resolve(true));
      }),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), SSE_WRITE_TIMEOUT_MS);
      }),
    ]);

    if (!drained) {
      throw new Error('Client write timeout -- closing stream');
    }
  }
}
```

If the client does not drain within the timeout, the stream is closed. This prevents a single slow client from holding a sandbox in the `running` state indefinitely.

## Full Pipeline

```mermaid
graph LR
    SDK["Claude SDK"] -->|Messages| Bridge
    Bridge -->|Unix Socket<br/>await drain| Server
    Server -->|SSE<br/>await drain| Client

    style Bridge fill:#f0f0f0
    style Server fill:#f0f0f0
```

At each arrow, the sender checks backpressure before writing. If the receiver is slow, the sender pauses. The pause propagates upstream through the entire pipeline.

## Memory Bound

Memory per connection is bounded by the kernel's TCP send buffer size (typically 128 KB - 1 MB depending on OS configuration) plus one pending SSE frame. There is no application-level buffering.

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `SSE_WRITE_TIMEOUT_MS` | 30,000 ms | Maximum time to wait for a slow client to drain before closing the connection |

This value is defined in `@ash-ai/shared` and used by the server's SSE writer.
