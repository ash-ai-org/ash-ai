# 06: Instrument the Hot Path

## What We Need To Know

Before optimizing anything, we need to answer:

1. **What's the overhead?** How much latency does Ash add on top of the SDK itself?
2. **Where is time spent?** Is it socket communication, JSON parsing, HTTP framing, or something else?
3. **What's the throughput?** How many concurrent sessions can one machine handle before degradation?

Without numbers, every optimization is a guess.

## The Hot Path

For a single message round-trip:

```
Client sends HTTP POST
  → [T1] Fastify request parsing
  → [T2] Session lookup
  → [T3] Bridge command write (Unix socket)
  → [T4] Bridge parses command
  → [T5] SDK query starts
  → [T6] First SDK event generated
  → [T7] Bridge writes event to socket
  → [T8] Runner reads event from socket
  → [T9] SSE frame written to HTTP response
  → [T10] Client receives first byte
```

**Ash overhead = T10 - T5 - (SDK processing time)**

Everything that isn't the SDK thinking is our tax. It should be < 5ms for the first token.

## Implementation

### Lightweight timing, not a metrics framework

No Prometheus. No OpenTelemetry. Just `process.hrtime.bigint()` at key points, logged as structured JSON to stderr.

```typescript
interface TimingEntry {
  sessionId: string;
  sandboxId: string;
  phase: string;
  durationMs: number;
  timestamp: string;
}

function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000;
}
```

### Instrumentation Points

#### In the Fastify handler (server)

```typescript
app.post('/api/sessions/:id/messages', async (request, reply) => {
  const timer = startTimer();

  // ... session lookup
  const lookupMs = timer();

  // ... bridge command send
  const sendMs = timer();

  let firstEventMs: number | null = null;
  for await (const event of events) {
    if (!firstEventMs) firstEventMs = timer();
    // ... write SSE
  }
  const totalMs = timer();

  logTiming({
    sessionId, sandboxId,
    lookupMs, sendMs, firstEventMs, totalMs,
    eventCount,
  });
});
```

#### In the bridge (bridge)

```typescript
// Time from command received to first SDK event
const cmdReceived = process.hrtime.bigint();
// ... parse command
const parseMs = elapsed(cmdReceived);

for await (const msg of sdkQuery) {
  if (!firstSdkEvent) {
    firstSdkEventMs = elapsed(cmdReceived);
  }
  // ... write to socket
}
```

#### In the bridge client (runner)

```typescript
// Time from command sent to first event received
send(command);
const sentAt = process.hrtime.bigint();

for await (const event of streamEvents()) {
  if (!firstEvent) {
    firstEventLatencyMs = elapsed(sentAt);
  }
  yield event;
}
```

### Output Format

One JSON line per completed message to stderr:

```json
{
  "type": "timing",
  "sessionId": "abc-123",
  "messageId": 1,
  "overheadMs": 2.3,
  "firstTokenMs": 847.2,
  "totalMs": 12340.5,
  "eventCount": 47,
  "breakdown": {
    "sessionLookup": 0.1,
    "bridgeSend": 0.3,
    "bridgeParse": 0.2,
    "sdkFirstToken": 844.8,
    "sseWrite": 1.7
  }
}
```

`overheadMs` = `firstTokenMs` - `sdkFirstToken`. This is our number.

### What To Do With The Numbers

#### If overhead > 5ms
Something is wrong. Profile with `--prof` or `perf`. Likely candidates:
- JSON.stringify on large events
- Fastify request parsing overhead
- Socket write contention

#### If overhead is 1-3ms
Good. This is the expected range for in-process Unix socket + JSON + SSE.

#### If throughput < 100 concurrent sessions
Profile memory and CPU. Likely candidates:
- Too many event listeners (one per connection)
- Garbage collection pressure from JSON parsing
- Bridge process spawn overhead

### Load Test Script

```typescript
// scripts/load-test.ts
// Spawn N concurrent sessions, each sending M messages
// Report: p50, p95, p99 latency; throughput; memory usage

const CONCURRENCY = [1, 10, 50, 100, 500];
const MESSAGES_PER_SESSION = 5;

for (const n of CONCURRENCY) {
  const results = await runLoadTest(n, MESSAGES_PER_SESSION);
  console.log(`${n} concurrent: p50=${results.p50}ms p99=${results.p99}ms mem=${results.memMb}MB`);
}
```

## What This Is Not

This is not production monitoring. This is a development tool to find out where we are before deciding what to optimize. Once we have numbers, most of the instrumentation can be removed or gated behind a `ASH_DEBUG_TIMING=1` flag.
