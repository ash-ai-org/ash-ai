# OpenTelemetry Distributed Tracing

## Status: Implemented

All 4 phases are implemented and shipping. Tracing is opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Quick Start

```bash
# Start a local Jaeger instance
docker run -d --name jaeger -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one

# Start Ash with tracing enabled
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 ash start

# Open Jaeger UI
open http://localhost:16686
# Search for service: ash-coordinator
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | gRPC endpoint for OTLP trace export. Tracing is disabled when not set. |
| `OTEL_SERVICE_NAME` | `ash-coordinator` (server) / `ash-bridge` (bridge) | Service name in traces |

**Zero impact when not configured** — no OTEL SDK is initialized, no spans created, no dependencies loaded.

## Architecture

### Trace Flow

```
Client App
  └── HTTP POST /api/sessions/:id/messages
       └── ash.session.message (coordinator span)
            │  attributes: ash.session.id, ash.agent.name, ash.model, ash.sandbox.id
            │
            └── [traceparent propagated via bridge protocol]
                 └── ash.bridge.query (bridge span, linked to coordinator trace)
                      │  attributes: ash.session.id, ash.model
                      │
                      ├── ash.agent.turn
                      │    ├── ash.agent.thinking
                      │    ├── ash.tool.use (ash.tool.name, ash.tool.id)
                      │    └── ash.agent.text
                      │
                      └── result attributes: ash.cost_usd, ash.num_turns,
                          ash.tokens.input, ash.tokens.output
```

### Layer 1: Coordinator (packages/server)

**Auto-instrumentation** gives free spans for:
- Every Fastify HTTP request/response
- Outbound HTTP (coordinator → runner)
- Database queries

**Manual spans** in `routes/sessions.ts`:
- `ash.session.create` — sandbox creation + DB insert
- `ash.session.message` — full message flow (command → bridge → SSE response)
- `ash.session.pause` — session pause lifecycle
- `ash.session.stop` — session stop + sandbox destroy
- `ash.session.resume` — warm/cold path with `ash.resume.path` and `ash.resume.source` attributes

Span events on `ash.session.create`:
- `selectBackend.start` / `selectBackend.end`
- `createSandbox.start` / `createSandbox.end`

### Layer 2: Bridge Protocol

The `traceContext` field (W3C `traceparent` string) is added to `QueryCommand`, `ResumeCommand`, and `ExecCommand` in `packages/shared/src/protocol.ts`. The coordinator injects the current trace context when sending commands; the bridge extracts it to create child spans.

`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` are in the sandbox env allowlist, so the bridge process can export its own spans.

### Layer 3: Bridge Span Instrumentation (packages/bridge)

The bridge's `runAndStream()` uses a span state machine to classify SDK streaming messages into a hierarchical span tree:

- `stream_event` + `message_start` → open `ash.agent.turn`
- `stream_event` + `content_block_start` → open `ash.agent.thinking` / `ash.tool.use` / `ash.agent.text` (parented to current turn)
- `stream_event` + `content_block_stop` → close block span
- `stream_event` + `message_stop` → close turn span
- `type: 'result'` → record `ash.cost_usd`, `ash.num_turns`, `ash.tokens.input`, `ash.tokens.output`

When `includePartialMessages` is false, only complete messages (`assistant`, `user`, `result`) are received — the span hierarchy is flatter but still captures the query-level span with usage attributes.

### Layer 4: Model API Trace Propagation

The bridge includes `@opentelemetry/instrumentation-http` which automatically instruments outbound HTTP/HTTPS calls. When the Claude Agent SDK makes API calls, the `traceparent` header is injected automatically — no application code changes needed.

## Files

| File | Role |
|------|------|
| `packages/server/src/telemetry/tracing.ts` | Coordinator OTEL SDK init (NodeSDK + auto-instrumentations + OTLP exporter) |
| `packages/server/src/index.ts` | Calls `initTracing()` at startup, `shutdownTracing()` on SIGTERM |
| `packages/server/src/routes/sessions.ts` | Manual spans + trace context injection into bridge commands |
| `packages/shared/src/protocol.ts` | `traceContext?: string` on QueryCommand, ResumeCommand, ExecCommand |
| `packages/shared/src/constants.ts` | OTEL env vars in SANDBOX_ENV_ALLOWLIST |
| `packages/bridge/src/tracing.ts` | Bridge OTEL SDK init (lightweight — OTLP exporter + HTTP instrumentation) |
| `packages/bridge/src/index.ts` | Span state machine in `runAndStream()` |

## Testing

```bash
# All tests pass with tracing disabled (default)
pnpm test

# Smoke test with Jaeger
docker run -d --name jaeger -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 ash start
# Create session, send message, check Jaeger UI
```

## Open Questions (Resolved)

1. **Sampling**: Left to deployment. No default sampler configured — the collector or OTEL SDK env vars (`OTEL_TRACES_SAMPLER`) control this.
2. **Performance**: Spans are only created when the SDK is initialized (requires `OTEL_EXPORTER_OTLP_ENDPOINT`). When disabled, `@opentelemetry/api` returns no-op implementations with negligible overhead.
3. **SDK instrumentation**: The Claude Agent SDK does not have built-in OTEL support, so bridge-level instrumentation provides the tool-call visibility.
