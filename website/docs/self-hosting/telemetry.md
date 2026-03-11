---
sidebar_position: 4
title: Streaming Telemetry
---

# Streaming Telemetry

Ash has two built-in telemetry systems for self-hosted deployments. Both are opt-in and zero-overhead when disabled.

| System | Purpose | Export format | Enable with |
|--------|---------|---------------|-------------|
| **OpenTelemetry tracing** | Distributed traces across coordinator, bridge, and model API | OTLP gRPC | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| **Event telemetry** | Session lifecycle events, messages, tool calls, errors | HTTP JSON batches | `ASH_TELEMETRY_URL` |

For Prometheus metrics and structured logging, see the [Monitoring guide](../guides/monitoring.md).

---

## Ash Cloud Integration

If you have an [Ash Cloud](https://ash-cloud.ai) account, your self-hosted instance can send telemetry directly to the Ash Cloud dashboard. No extra configuration is needed -- when you log in with `ash login` and start the server, event telemetry is automatically configured.

### How It Works

1. Run `ash login` to authenticate with Ash Cloud. This stores your API key and Cloud URL in `~/.ash/credentials.json`.
2. Run `ash start`. The CLI passes `ASH_CLOUD_URL` and `ASH_API_KEY` to the server container.
3. The server detects `ASH_CLOUD_URL` and auto-configures the event telemetry exporter to send events to `<ASH_CLOUD_URL>/api/telemetry/ingest`, authenticated with your API key.

```bash
# 1. Log in to Ash Cloud
ash login

# 2. Start the server — telemetry flows automatically
ash start
```

You can verify telemetry is active by checking the server logs:

```bash
ash logs | grep telemetry
# [telemetry] auto-configured for Ash Cloud → https://ash-cloud.ai/api/telemetry/ingest
```

Session events, tool calls, and lifecycle data will appear in your Ash Cloud dashboard.

### Overriding the Default

If you set `ASH_TELEMETRY_URL` explicitly, it takes precedence over the Ash Cloud auto-configuration. This lets you send telemetry to your own backend even when logged into Ash Cloud:

```bash
ash start -e ASH_TELEMETRY_URL=https://my-backend/events
```

---

## OpenTelemetry Tracing

Ash instruments the full request path from HTTP request through sandbox bridge to the Claude API. When enabled, traces are exported via OTLP gRPC to any compatible collector (Jaeger, Grafana Tempo, Datadog, Honeycomb, etc.).

### Quick Start with Jaeger

```bash
# 1. Start Jaeger (receives traces on :4317, UI on :16686)
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  jaegertracing/all-in-one

# 2. Start Ash with tracing enabled
ash start -e OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4317

# 3. Create a session and send a message, then open Jaeger
open http://localhost:16686
# Search for service: ash-coordinator
```

### Docker Compose with Jaeger

```yaml
version: "3.8"

services:
  ash:
    image: ghcr.io/ash-ai/ash:latest
    init: true
    privileged: true
    ports:
      - "4100:4100"
    volumes:
      - ash-data:/data
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ASH_API_KEY=${ASH_API_KEY}
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

  jaeger:
    image: jaegertracing/all-in-one
    ports:
      - "16686:16686"   # Jaeger UI
      - "4317:4317"     # OTLP gRPC

volumes:
  ash-data:
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | gRPC endpoint for OTLP trace export. Tracing is completely disabled when not set. |
| `OTEL_SERVICE_NAME` | `ash-coordinator` / `ash-bridge` | Service name in traces. The coordinator and bridge use different defaults. |
| `OTEL_TRACES_SAMPLER` | _(none)_ | Optional sampling strategy (e.g. `parentbased_traceidratio`). Left to deployment. |

### What Gets Traced

**Coordinator spans** (auto-instrumented + manual):

| Span | Description |
|------|-------------|
| HTTP request spans | Every Fastify request/response (auto) |
| Database query spans | SQLite/Postgres queries (auto) |
| `ash.session.create` | Sandbox creation + DB insert |
| `ash.session.message` | Full message flow: command to bridge, bridge response, SSE delivery |
| `ash.session.pause` | Session pause lifecycle |
| `ash.session.stop` | Session stop + sandbox teardown |
| `ash.session.resume` | Warm/cold resume with `ash.resume.path` and `ash.resume.source` attributes |

**Bridge spans** (streaming message state machine):

| Span | Description |
|------|-------------|
| `ash.bridge.query` | Top-level query, linked to coordinator trace via W3C `traceparent` |
| `ash.agent.turn` | One model turn (message start to message stop) |
| `ash.agent.thinking` | Extended thinking block |
| `ash.tool.use` | Tool call with `ash.tool.name` and `ash.tool.id` attributes |
| `ash.agent.text` | Text content block |

Usage attributes are recorded on the query span: `ash.cost_usd`, `ash.num_turns`, `ash.tokens.input`, `ash.tokens.output`.

**Model API propagation**: The bridge includes HTTP auto-instrumentation, so outbound API calls to Claude automatically carry the `traceparent` header. No application code needed.

### Trace Flow

```
Client HTTP request
  └── Fastify HTTP span (auto)
       └── ash.session.message (coordinator)
            │  ash.session.id, ash.agent.name, ash.model
            │
            └── [traceparent via bridge protocol]
                 └── ash.bridge.query (bridge)
                      ├── ash.agent.turn
                      │    ├── ash.agent.thinking
                      │    ├── ash.tool.use
                      │    └── ash.agent.text
                      └── Claude API call (auto, with traceparent header)
```

---

## Event Telemetry

The event telemetry system collects session lifecycle events and streams them to an HTTP endpoint. This is useful for building dashboards, audit logs, or feeding events into your own analytics pipeline.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_TELEMETRY_URL` | _(unset)_ | HTTP endpoint to receive telemetry event batches. Disabled when not set. |
| `ASH_TELEMETRY_KEY` | _(unset)_ | Optional bearer token sent in the `Authorization` header. |

### How It Works

Events are buffered in memory and flushed every 5 seconds (or when the buffer reaches 100 events). Each flush sends a `POST` request with a JSON array of events.

```
POST <ASH_TELEMETRY_URL>
Authorization: Bearer <ASH_TELEMETRY_KEY>
Content-Type: application/json

[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "agentName": "my-agent",
    "type": "lifecycle",
    "data": { "status": "active", "action": "created" },
    "timestamp": "2026-03-10T12:00:00.000Z",
    "sequence": 1
  }
]
```

### Event Types

| Type | When | Data fields |
|------|------|-------------|
| `lifecycle` | Session created, paused, resumed, stopped, forked, ended | `status`, `action`, `path` (warm/cold), `source` (local/cloud/fresh) |
| `message` | User or assistant message | `role`, `content` or `messageType` |
| `tool_use` | Agent calls a tool | Tool name and ID |
| `thinking` | Extended thinking block | Thinking content |
| `error` | Error during processing | `error` message |
| `turn_complete` | Agent turn finishes | — |

### Example: Receiving Events

A minimal receiver (Node.js):

```javascript
import http from 'node:http';

http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => body += chunk);
  req.on('end', () => {
    const events = JSON.parse(body);
    for (const event of events) {
      console.log(`[${event.type}] session=${event.sessionId} agent=${event.agentName}`);
    }
    res.writeHead(200);
    res.end();
  });
}).listen(9090);
```

Then start Ash with:

```bash
ash start -e ASH_TELEMETRY_URL=http://host.docker.internal:9090
```

---

## Combining Both Systems

For full observability, enable both. OpenTelemetry gives you distributed trace visualization (latency flamecharts, dependency graphs). Event telemetry gives you a stream of business-level events (who used which agent, what tools were called, session lifecycle).

```bash
ash start \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317 \
  -e ASH_TELEMETRY_URL=https://your-backend/events \
  -e ASH_TELEMETRY_KEY=secret
```
