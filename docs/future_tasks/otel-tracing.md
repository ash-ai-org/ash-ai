# OpenTelemetry Distributed Tracing

## Status: Proposed

## Problem

Ash has basic observability (Prometheus metrics at `/metrics`, structured JSON logs, health endpoint) but no distributed tracing. Enterprise deployments need trace propagation from client applications through the coordinator, into sandboxes, and through to model API calls. Without this, debugging latency issues across the Ash stack requires correlating logs manually.

## Current Observability

| Layer | What exists | What's missing |
|-------|------------|----------------|
| Coordinator (Fastify) | `/health` JSON, `/metrics` Prometheus, structured Pino logs | No OTEL spans, no trace context propagation |
| Bridge (sandbox) | `ASH_DEBUG_TIMING` stderr timing lines | No OTEL spans, no tool-call-level tracing |
| Client → Coordinator | HTTP request/response | No trace context headers (traceparent) |
| Bridge → Model API | HTTPS via Claude Code SDK | No span instrumentation around SDK calls |

## Proposed Architecture

### Layer 1: Coordinator-Level Tracing (Low effort)

Standard Node.js OTEL auto-instrumentation on the Fastify server. This gives HTTP request spans for free.

```bash
# Start with auto-instrumentation
node --require @opentelemetry/auto-instrumentations-node/register \
  ./node_modules/.bin/ash start
```

Or configure programmatically:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'ash-coordinator',
});
sdk.start();
```

**What this covers automatically:**
- HTTP request/response spans (every API call)
- Database query spans (SQLite/Postgres via knex/drizzle instrumentation)
- Outbound HTTP spans (coordinator → runner communication)

**Manual spans to add:**
- `session.create` — wraps sandbox creation + DB insert
- `session.message` — wraps the full message flow (command → bridge → SSE)
- `session.resume` — wraps warm/cold path decision + sandbox restoration
- `session.pause` / `session.end` — lifecycle transitions
- `sandbox.create` — wraps agent copy + install + bridge spawn + connect

**Implementation**: Add `@opentelemetry/api` as a dependency of `@ash-ai/server`. Create spans in `routes/sessions.ts` around the key operations. ~100 lines of code.

### Layer 2: Bridge-Level Tracing (Medium effort)

Instrument the bridge's `runAndStream()` function to create spans for each SDK message as it streams. This gives tool-call-level tracing equivalent to what custom wrappers provide.

**Span hierarchy:**
```
ash.session.message (coordinator)
  └── ash.bridge.query (bridge)
       ├── ash.agent.turn (per SDK turn)
       │    ├── ash.agent.thinking (thinking block)
       │    ├── ash.tool.use (tool_use block)
       │    │    └── ash.tool.result (tool_result)
       │    └── ash.agent.text (text block)
       └── ash.agent.result (final result)
```

**Attributes on spans:**
- `ash.session.id`, `ash.agent.name`
- `ash.tool.name`, `ash.tool.id` (on tool spans)
- `ash.tokens.input`, `ash.tokens.output` (on result span)
- `ash.model` (on query span)

**Challenge**: The bridge runs inside the sandbox as a separate process. Trace context must propagate from the coordinator through the Unix socket protocol to the bridge. Options:

1. **Propagate via bridge command** — Add `traceContext` field to `QueryCommand` in the bridge protocol. Bridge extracts it and creates child spans. This is the cleanest approach.
2. **Propagate via env var** — Set `TRACEPARENT` env var on sandbox creation. Only works for the first request; subsequent messages in the same session wouldn't get new trace contexts.

Recommended: Option 1 (protocol-level propagation).

**Implementation**: Add `@opentelemetry/api` as a dependency of `@ash-ai/bridge`. Parse incoming `traceContext` from commands, create spans around `runQuery()`, classify SDK messages into spans. ~200 lines of code.

### Layer 3: Trace Context Propagation to Model API (Low effort, after Layer 2)

Once the bridge has OTEL context, the Claude Code SDK's outbound HTTP calls can automatically pick up trace context if the Node.js HTTP instrumentation is loaded. The `traceparent` header would flow through to the API gateway, enabling end-to-end traces from client app → Ash → model provider.

**Requirement**: The API gateway must support W3C Trace Context headers (`traceparent`, `tracestate`).

## Implementation Plan

| Phase | Scope | Effort | Prerequisite |
|-------|-------|--------|--------------|
| 1 | Coordinator auto-instrumentation + manual session spans | Low | None |
| 2 | Bridge protocol `traceContext` field | Low | Phase 1 |
| 3 | Bridge span instrumentation (tool-call level) | Medium | Phase 2 |
| 4 | Trace propagation to model API | Low | Phase 3 |

## Dependencies

```
@opentelemetry/api                            # Core API (both coordinator + bridge)
@opentelemetry/sdk-node                       # SDK setup (coordinator)
@opentelemetry/auto-instrumentations-node     # Auto HTTP/DB instrumentation (coordinator)
@opentelemetry/exporter-trace-otlp-grpc       # OTLP exporter (coordinator)
```

## Configuration

```bash
# Enable OTEL (coordinator)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=ash-coordinator

# Enable bridge tracing (future)
ASH_BRIDGE_TRACING=1
```

## Open Questions

1. **Sampling**: Should Ash configure a default sampler, or leave it to the deployment? Head-based sampling at the coordinator means bridge spans are also sampled. Tail-based requires the collector.
2. **Performance**: Adding spans to every streamed SDK message could add overhead. Need to benchmark before/after.
3. **SDK instrumentation**: Does the Claude Code SDK have its own OTEL support? If so, the bridge instrumentation might get spans for free.
