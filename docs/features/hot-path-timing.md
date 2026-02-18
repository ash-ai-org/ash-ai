# Hot-Path Timing Instrumentation

**Date:** 2026-02-18
**Step:** 06 of the implementation plan

## What

Lightweight timing instrumentation that measures Ash's overhead on top of the Claude SDK. Produces structured JSON lines to stderr, gated behind `ASH_DEBUG_TIMING=1`.

## Why

To answer the question: "How much latency does Ash add on top of the SDK itself?" Without instrumentation we can't measure, and without measurement we can't optimize (Principle 1). This is the lightest-weight approach possible — no metrics framework, no aggregation, just hrtime + JSON stderr.

## How

### Enabling

Set the environment variable before starting the server:

```bash
ASH_DEBUG_TIMING=1 pnpm dev
```

The flag is included in `SANDBOX_ENV_ALLOWLIST`, so it propagates into sandbox processes automatically.

### Output Format

Two JSON lines per completed message — one from the server, one from the bridge:

**Server-side:**
```json
{"type":"timing","source":"server","sessionId":"abc-123","sandboxId":"sbx-456","lookupMs":0.1,"firstEventMs":847.2,"totalMs":12340.5,"eventCount":47,"timestamp":"2025-01-15T12:00:00.000Z"}
```

**Bridge-side:**
```json
{"type":"timing","source":"bridge","sessionId":"abc-123","cmdParseMs":0.2,"sdkFirstTokenMs":844.8,"totalMs":12338.1,"eventCount":47,"timestamp":"2025-01-15T12:00:01.000Z"}
```

### Calculating Ash Overhead

Ash overhead per message ≈ `server.firstEventMs − bridge.sdkFirstTokenMs`

Correlate records by `sessionId`. The difference captures:
- Unix socket serialization/deserialization
- Server-side session/sandbox lookup
- SSE frame encoding

### Utility API

```typescript
import { startTimer, logTiming, timingEnabled, type TimingEntry } from '@ash-ai/shared';

// Check if instrumentation is active
if (timingEnabled()) {
  const elapsed = startTimer();
  // ... do work ...
  logTiming({
    type: 'timing',
    source: 'server',
    sessionId: 'abc',
    workMs: elapsed(),
    timestamp: new Date().toISOString(),
  });
}
```

### Instrumentation Points

| Location | What's measured |
|---|---|
| Server: message handler entry | Request arrival time |
| Server: after session+sandbox lookup | `lookupMs` — DB + map access |
| Server: first bridge event received | `firstEventMs` — time to first token from user's perspective |
| Server: stream complete | `totalMs`, `eventCount` |
| Bridge: command received | Command arrival time |
| Bridge: SDK query starts | Parse overhead |
| Bridge: first SDK message yielded | `sdkFirstTokenMs` — pure SDK latency |
| Bridge: stream complete | `totalMs`, `eventCount` |

## Known Limitations

- Cross-process timing comparison is approximate (no clock sync, but both use wall clock)
- No aggregation — raw lines only. Pipe through `jq` for analysis
- Adds ~1 `process.hrtime.bigint()` call per event when enabled (~microseconds)
- Zero overhead when `ASH_DEBUG_TIMING` is unset or not `"1"`

## Benchmark Script

An automated benchmark collects timing data end-to-end:

```bash
pnpm build && pnpm bench                 # 5 rounds (default)
pnpm bench -- --rounds 20                # more samples
pnpm bench > results.json                # structured JSON to stdout
```

The script (`test/bench/message-overhead.ts`):
1. Launches a server with `ASH_DEBUG_TIMING=1`
2. Deploys a test agent, creates a session
3. Runs a warm-up round (not counted)
4. Sends N messages, measuring client-side E2E and first-event latency
5. Collects server/bridge timing lines from stderr
6. Computes Ash overhead = `server.firstEventMs − bridge.sdkFirstTokenMs`
7. Prints JSON summary (stdout) and human-readable table (stderr)

## Analysis Examples

```bash
# Extract server timings
ASH_DEBUG_TIMING=1 pnpm dev 2>timing.jsonl
cat timing.jsonl | jq 'select(.source == "server")'

# Compute average overhead
cat timing.jsonl | jq -s '
  [group_by(.sessionId)[] |
    (map(select(.source == "server")) | .[0]) as $s |
    (map(select(.source == "bridge")) | .[0]) as $b |
    if $s and $b then ($s.firstEventMs - $b.sdkFirstTokenMs) else empty end
  ] | add / length
'
```
