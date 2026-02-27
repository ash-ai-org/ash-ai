# Enterprise Integration

_2026-02-27 — How to integrate Ash with existing enterprise infrastructure: API gateways, authentication, observability, networking, and secrets management._

## Overview

Ash is designed to slot into existing infrastructure without requiring organizations to rearchitect. The integration surface is small: environment variables on runner pods, standard HTTP APIs, and well-known observability protocols.

This guide covers the five integration points that matter for production deployments inside an enterprise environment.

## Integration Points

### 1. API Gateway / LLM Proxy Routing

Most enterprises route LLM traffic through a central gateway for cost tracking, rate limiting, and model routing. Ash supports this via environment variables on runner pods (or the Ash server in single-node mode):

```yaml
# On runner pods / Ash server
env:
  - name: ANTHROPIC_BASE_URL
    value: "https://your-gateway.internal/v1"
  - name: ANTHROPIC_CUSTOM_HEADERS
    value: "x-api-key: ...,x-team-id: my-team"
```

The Claude Code SDK inside each sandbox reads `ANTHROPIC_BASE_URL` and routes all API calls through your gateway. No code changes needed — just set the environment.

**What this enables:**
- Central cost attribution and rate limiting
- Model routing (e.g., route to different providers based on headers)
- Request/response logging at the gateway layer
- Compliance with network egress policies (traffic stays internal)

### 2. Authentication

Ash has built-in API key authentication with multi-tenancy support (see [authentication.md](../features/authentication.md)). For enterprise deployments, you have two options:

| Approach | How | When |
|----------|-----|------|
| **Use Ash's built-in auth** | Set `ASH_API_KEY` via K8s secret. Issue per-team keys via the API. | Simple setup, works for most cases |
| **Integrate with existing identity** | Put an auth proxy (e.g., OAuth2 Proxy, your API gateway) in front of Ash. Strip auth headers and pass a tenant identifier. | When you need SSO, OIDC, or service-to-service auth that matches your existing patterns |

For service-to-service authentication, map your internal service identity to an Ash API key:

```yaml
# Example: inject Ash API key from your secrets manager
env:
  - name: ASH_API_KEY
    valueFrom:
      secretKeyRef:
        name: ash-credentials
        key: api-key
```

### 3. Observability (OpenTelemetry)

The Ash coordinator is a Fastify server — standard OpenTelemetry Node.js instrumentation works out of the box:

```bash
# Start Ash with OTEL auto-instrumentation
node --require @opentelemetry/auto-instrumentations-node/register \
  ./node_modules/.bin/ash start
```

Or configure programmatically before starting the server:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector.internal:4317',
  }),
});
sdk.start();
```

**What's instrumented today:**
- HTTP request/response spans (Fastify auto-instrumentation)
- Database queries (SQLite/Postgres)
- Prometheus metrics at `/metrics`

**What needs contribution for deeper tracing:**
- Bridge-level spans (per-message latency inside the sandbox)
- Claude SDK call spans (model API round-trip time)
- Tool execution spans (MCP tool call duration)

These are tracked as future work. If your team needs bridge-level tracing, see [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to contribute.

### 4. Network Policy

Ash has a simple network topology:

```
┌──────────────┐     HTTP      ┌──────────────┐    Unix socket    ┌──────────────┐
│   Clients    │ ────────────▶ │  Coordinator │ ────────────────▶ │   Sandboxes  │
│  (your apps) │    :4100     │   (Fastify)  │   (same host)    │   (bridge)   │
└──────────────┘              └──────────────┘                   └──────┬───────┘
                                     │                                  │
                                     │ SQL                              │ HTTPS
                                     ▼                                  ▼
                              ┌──────────────┐                   ┌──────────────┐
                              │   Database   │                   │ API Gateway  │
                              │  (SQLite or  │                   │ / LLM Proxy  │
                              │   Postgres)  │                   └──────────────┘
                              └──────────────┘
```

**Required network access:**

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Clients | Coordinator | HTTP :4100 | REST API + SSE streaming |
| Coordinator | Database | SQL (TCP or local) | Session state, agent registry |
| Sandboxes | API gateway | HTTPS | Claude API calls via your proxy |
| Sandboxes | MCP endpoints | HTTP | Tool calls to host app (sidecar MCP pattern) |

**Kubernetes NetworkPolicy example:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ash-coordinator
spec:
  podSelector:
    matchLabels:
      app: ash
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: ash-client
      ports:
        - port: 4100
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - port: 5432
    - to:  # Allow sandbox→gateway traffic
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app: llm-gateway
      ports:
        - port: 443
```

### 5. Secrets Management

Ash needs two categories of secrets:

| Secret | Purpose | Where it runs |
|--------|---------|---------------|
| `ASH_API_KEY` | Authenticates clients to the Ash API | Coordinator pod |
| `ANTHROPIC_API_KEY` | Authenticates to the model provider (or your gateway) | Runner/sandbox pods |
| Gateway credentials | Auth headers for your LLM proxy | Runner/sandbox pods |

**Recommended approach:** Use your existing secrets manager (Vault, AWS Secrets Manager, K8s external-secrets-operator) to inject these as environment variables:

```yaml
# Example: external-secrets-operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ash-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault
    kind: ClusterSecretStore
  target:
    name: ash-secrets
  data:
    - secretKey: ASH_API_KEY
      remoteRef:
        key: secret/ash/api-key
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: secret/ash/anthropic-key
```

Then reference in your Helm values:

```yaml
auth:
  existingSecret: ash-secrets
```

**Security note:** Ash uses an environment allowlist for sandboxes — only explicitly permitted variables are passed into sandbox processes. `process.env` is never spread. See [04b-sandbox-isolation.md](../jeff-dean-plan/04b-sandbox-isolation.md) for details.

## Deployment Topology

For enterprise deployments, the recommended topology depends on scale:

### Single-node (up to ~50 concurrent sessions)

```
[Your apps] → [Ash server (coordinator + sandboxes)] → [Your gateway] → [Model provider]
```

One Ash process handles everything. SQLite for state. Simplest to operate.

### Multi-node (50+ concurrent sessions)

```
[Your apps] → [Ash coordinator(s)] → [Ash runner nodes] → [Your gateway] → [Model provider]
                      ↕                      ↕
               [Postgres/CRDB]         [Sandboxes]
```

Coordinators handle API routing, runners handle sandbox execution. See [multi-runner.md](../features/multi-runner.md) and [kubernetes-deployment.md](./kubernetes-deployment.md).

## What Ash Replaces

If your team currently uses a custom wrapper around the Claude Code SDK for production hosting, Ash replaces the hosting and orchestration layer:

| Concern | Custom wrapper | Ash |
|---------|---------------|-----|
| Process management | In-process subprocess spawning | Isolated sandboxes with lifecycle management |
| Session state | In-memory or ad-hoc storage | SQLite/Postgres with pause/resume |
| Scaling | Manual process management, K8s issues | Multi-runner with session routing |
| Sandbox isolation | None or ad-hoc | bwrap, cgroups, env allowlists |
| API surface | Custom per-team | Standard REST + SSE, OpenAPI spec |
| Permission management | Hardcoded allow/deny lists | Per-agent configuration in agent definitions |

### What to keep from existing wrappers

- **Local development helpers** (e.g., default option factories) — still useful for scripts, CLI tooling, and local dev that doesn't need hosting
- **Memory/context modules** — can run as MCP servers within agent definitions, or contribute as Ash plugins
- **Client-side tracing helpers** — useful for tracing Ash API calls from your application

### What to retire

- **Production hosting logic** — Ash replaces subprocess management, connection pooling, and session storage
- **Hardcoded permission lists** — move into agent-level configuration (`.claude/settings.json` in agent definitions)
- **In-process subprocess management** — Ash sandboxes handle process isolation

## Quick Start for Enterprise Teams

1. **Deploy Ash** using the [Kubernetes guide](./kubernetes-deployment.md) or [EC2 guide](./ec2-deployment.md)
2. **Configure your gateway** by setting `ANTHROPIC_BASE_URL` and any required headers as environment variables
3. **Inject secrets** using your existing secrets manager
4. **Define agents** as folders with `CLAUDE.md` + config (see [getting-started.md](../getting-started.md))
5. **Integrate** by calling the Ash REST API from your existing services (see [api-reference.md](../api-reference.md))
6. **Observe** with Prometheus metrics at `/metrics` and optional OTEL instrumentation
