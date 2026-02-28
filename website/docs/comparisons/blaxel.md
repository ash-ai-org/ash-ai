---
sidebar_position: 2
title: Ash vs Blaxel
---

# Ash vs Blaxel

[Blaxel](https://blaxel.ai) and Ash both provide infrastructure for AI agents, but they make different tradeoffs. This page breaks down where they overlap, where they diverge, and when to use each.

## TL;DR

- **Ash** is a self-hostable agent platform -- deploy Claude agents as folders, get production APIs with sessions, streaming, sandboxing, and persistence on your own infrastructure. Sub-millisecond per-message overhead, 44ms cold start, 1.7ms warm resume.
- **Blaxel** is a managed cloud platform -- serverless agent hosting, perpetual sandboxes, model gateway, and observability as a service.

The core difference: Ash runs on your machines; Blaxel runs on theirs.

## Different Tradeoffs

| | Ash | Blaxel |
|---|---|---|
| **What it is** | Self-hostable agent orchestration | Managed cloud agent platform |
| **Infrastructure model** | Your servers (Docker, EC2, GCE, bare metal) | Their cloud (serverless) |
| **Agent definition** | Folder with `CLAUDE.md` | HTTP server (any framework) |
| **AI model** | Claude (via Claude Code SDK) | Any model (model gateway) |
| **Sandbox model** | OS-level (bubblewrap, cgroups) | MicroVMs |
| **Session persistence** | SQLite/Postgres, survives restarts | Snapshot-based |
| **Pricing** | Self-hosted (pay for compute + Claude API) | Usage-based SaaS |

## Feature Comparison

| Feature | Ash | Blaxel |
|---|---|---|
| **Agent hosting** | Yes -- deploy folders, get REST API | Yes -- serverless endpoints |
| **Sandbox isolation** | Bubblewrap, cgroups v2, env allowlist | MicroVMs (EROFS + tmpfs) |
| **Session creation (cold start)** | 44ms p50 (process spawn + bridge connect) | ~25ms (MicroVM resume) |
| **Session resume (warm)** | 1.7ms p50 (DB lookup + status flip) | ~25ms (MicroVM resume) |
| **Per-message overhead** | 0.41ms p50 (sub-millisecond) | Not published |
| **Session persistence** | SQLite/Postgres, pause/resume | Snapshot-based, scale-to-zero |
| **Streaming** | Native SSE with typed events, backpressure | Framework-dependent |
| **Model support** | Claude (deep SDK integration) | Multi-model (gateway routing) |
| **Observability** | Prometheus metrics, structured logs, `/health` | Built-in logs, traces, metrics |
| **MCP servers** | Per-agent and per-session MCP config | Hosted MCP servers |
| **Batch jobs** | Not built-in | Yes -- async compute |
| **Multi-machine** | Built-in coordinator + runner | Managed by platform |
| **SDKs** | TypeScript + Python | TypeScript + Python |
| **CLI** | Full lifecycle management | Yes |
| **Self-hostable** | Yes | No |
| **Open source** | Yes | No |
| **Data residency** | Full control (your machines) | Their cloud |

## Architecture Differences

### Ash

```
CLI/SDK  ──HTTP──>  Ash Server  ──in-process──>  SandboxPool  ──unix socket──>  Bridge  ──>  Claude Code SDK
                    (your infra)                  (bubblewrap)                   (in sandbox)
```

Ash owns the full stack. Your server, your sandboxes, your data. The server manages sandbox lifecycle directly using OS-level isolation.

### Blaxel

```
Your App  ──HTTP──>  Blaxel Cloud  ──>  Agent Endpoint (serverless)  ──>  Model Gateway  ──>  LLM Provider
                     (their infra)      (MicroVM sandbox)
```

Blaxel is a managed platform. You deploy agents to their cloud, which handles scaling, sandboxing, routing, and observability.

## When to Use Each

### Use Ash when:

- **You need infrastructure control** -- data must stay on your machines, compliance requirements, air-gapped environments
- **You're building with Claude** -- Ash's deep Claude Code SDK integration gives you the full power of the SDK (sessions, tools, MCP, skills) with zero translation layer
- **Sessions must persist across restarts** -- Ash's SQLite/Postgres persistence survives crashes, supports pause/resume, and enables multi-day sessions
- **You want self-hosted, open source** -- inspect the code, modify the behavior, no vendor lock-in

### Use Blaxel when:

- **You want managed infrastructure** -- don't want to run your own servers, prefer pay-per-use
- **You use multiple LLM providers** -- Blaxel's model gateway routes between providers with fallback and telemetry
- **You want built-in observability** -- logs, traces, and metrics without setting up Prometheus or Grafana
- **Framework flexibility matters** -- Blaxel hosts any HTTP server, not just Claude agents

### Use Ash if you're unsure:

Self-hosted means you can migrate away at any time. You're not locked into a platform. Start with Ash, and if you later need managed infrastructure, the migration path is straightforward since your agents are just folders.

## Onboarding Comparison

### Ash -- 4 commands

```bash
ash start
ash deploy ./my-agent --name my-agent
ash chat my-agent "Hello"
```

### Blaxel -- framework setup + deploy

```bash
bl login
bl init my-agent
# ... write HTTP server code ...
bl deploy
bl run my-agent --data '{"inputs": "Hello"}'
```

Ash's agent definition is simpler (a folder with `CLAUDE.md`) because it targets a specific SDK. Blaxel requires writing an HTTP server because it supports any framework.

## Performance

Ash publishes [real benchmarks](/guides/monitoring). Here's how the numbers compare:

| Metric | Ash (measured) | Blaxel (claimed) |
|---|---|---|
| **Session creation** | 44ms p50 | ~25ms (MicroVM resume) |
| **Warm resume** | 1.7ms p50 | ~25ms (MicroVM resume) |
| **Cold resume** | 32ms p50 | Not published |
| **Per-message overhead** | 0.41ms p50 | Not published |
| **Pool operations** | 0.03ms p50 | Not published |

Blaxel's 25ms number is for MicroVM resume from a snapshot. Ash's 1.7ms warm resume is actually faster because it's just a DB lookup + status flip -- the sandbox process is still alive. For cold starts (new session creation), Ash's 44ms and Blaxel's ~25ms are in the same ballpark. In both cases, the real latency users feel is dominated by the LLM API response time (~1-3 seconds), not the platform overhead.

## Summary

| Dimension | Ash | Blaxel |
|---|---|---|
| **Control** | Full (self-hosted, open source) | Managed (their cloud) |
| **Simplicity** | Agent = folder with `CLAUDE.md` | Agent = HTTP server |
| **AI model** | Claude (deep integration) | Any model (gateway) |
| **Session creation** | 44ms p50 | ~25ms (claimed) |
| **Warm resume** | 1.7ms p50 | ~25ms (claimed) |
| **Per-message overhead** | 0.41ms p50 | Not published |
| **Best for** | Teams who want control + Claude | Teams who want managed + multi-model |

Both are solid choices. The decision comes down to whether you want to own the infrastructure or outsource it.
