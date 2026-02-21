---
sidebar_position: 1
title: Ash vs ComputeSDK
---

# Ash vs ComputeSDK

[ComputeSDK](https://www.computesdk.com/) and Ash solve different but adjacent problems. This page breaks down where they overlap, where they diverge, and when to use each.

## TL;DR

- **Ash** is an AI agent platform -- deploy a Claude agent as a folder, get a production REST API with sessions, streaming, sandboxing, and persistence.
- **ComputeSDK** is a sandbox abstraction layer -- one API to create isolated compute environments across 8+ cloud providers (E2B, Modal, Railway, etc.).

They're complementary, not competitive. ComputeSDK could be a sandbox *provider* that Ash delegates to.

## Different Problems

| | Ash | ComputeSDK |
|---|---|---|
| **What it is** | Self-hostable system for deploying AI agents | Unified API for generic sandbox compute |
| **Core abstraction** | Agent sessions (deploy a CLAUDE.md, chat via REST/SSE) | Sandboxes (create environments, run code/commands) |
| **Primary use case** | Host AI agents that persist, resume, and stream | Execute untrusted code, spin up dev environments |
| **AI-specific?** | Yes -- thin wrapper around Claude Code SDK | No -- provider-agnostic compute for any workload |
| **Infra model** | Self-hosted (your Docker, your machine) | SaaS gateway routing to cloud providers |

## Feature Comparison

| Feature | Ash | ComputeSDK |
|---|---|---|
| **Sandbox isolation** | Bubblewrap, cgroups v2, env allowlist | Provider-dependent |
| **Session persistence** | SQLite/Postgres, survives restarts | Stateless by default; named sandboxes for reuse |
| **Session resume** | Full context preservation, pause/resume, cross-machine | Not conversation-oriented |
| **Streaming** | Native SSE with typed events, backpressure | Request/response for commands |
| **Agent definition** | Folder with `CLAUDE.md` -- minimal | N/A -- not agent-oriented |
| **Multi-provider** | N/A -- runs your own sandboxes | 8+ providers, swap via env var |
| **Overlays/templates** | N/A | Smart overlays with symlinks for fast bootstrap |
| **Managed servers** | N/A | Supervised long-lived processes with health checks |
| **Filesystem API** | Agent has full workspace inside sandbox | `writeFile`, `readFile`, `mkdir`, etc. |
| **Shell execution** | Agent runs commands via Claude Code SDK | `runCommand()` API |
| **Observability** | Prometheus metrics, structured logs, `/health` | Not documented |
| **Multi-machine** | Built-in coordinator + runner architecture | Handled by underlying providers |
| **SDKs** | TypeScript + Python | TypeScript |
| **CLI** | Full lifecycle (`ash start/deploy/session/health`) | Not documented |
| **Self-hostable** | Yes -- Docker, bare metal, or cloud VMs | No -- SaaS gateway required |
| **Open source** | Yes | Partially (client SDK open, gateway is SaaS) |

## Architecture Differences

### Ash

```
CLI/SDK  ──HTTP──>  ash-server  ──in-process──>  SandboxPool  ──unix socket──>  Bridge  ──>  Claude Code SDK
                    (your infra)                  (bubblewrap)                   (in sandbox)
```

Ash owns the full stack. Your server, your sandboxes, your data. The server manages sandbox lifecycle directly using OS-level isolation (bubblewrap on Linux, ulimit on macOS).

### ComputeSDK

```
Your code  ──HTTP──>  ComputeSDK Gateway  ──HTTP──>  Cloud Provider (E2B / Modal / Railway / ...)
                      (their SaaS)                    (their infra)
```

ComputeSDK is a routing layer. Your code talks to their gateway, which translates to provider-specific APIs. You don't manage sandboxes -- the provider does.

## When to Use Each

### Use Ash when you need:

- **AI agents that persist** -- sessions that survive restarts, resume days later, hand off between machines
- **Full control over infrastructure** -- self-hosted, no external dependencies, data stays on your machines
- **Deep sandbox isolation** -- cgroups, bubblewrap, environment allowlists you configure
- **Streaming conversations** -- SSE with typed events, backpressure, real-time token streaming
- **An agent platform** -- deploy agents as folders, manage via CLI/SDK, monitor with Prometheus

### Use ComputeSDK when you need:

- **Generic sandbox compute** -- run arbitrary code, not specifically AI conversations
- **Provider flexibility** -- switch between E2B, Modal, Railway without code changes
- **Managed infrastructure** -- don't want to run your own servers
- **Quick ephemeral environments** -- spin up a sandbox, run a script, tear it down
- **Pre-configured templates** -- overlays for fast environment bootstrap

### Use both when:

You want Ash's agent orchestration with cloud-hosted sandboxes instead of local ones. A future `SandboxProvider` interface in Ash could delegate sandbox creation to ComputeSDK-supported providers, giving you Ash's session management and streaming with E2B's or Modal's compute.

## Onboarding Comparison

### ComputeSDK -- 3 lines

```typescript
const sandbox = await compute.sandbox.create();
const result = await sandbox.runCode('print("Hello World!")');
await sandbox.destroy();
```

### Ash -- 4 commands

```bash
ash start
ash deploy ./my-agent --name my-agent
ash session create my-agent
ash session send <SESSION_ID> "Hello"
```

ComputeSDK's onboarding is simpler because it solves a simpler problem -- create a sandbox and run code. Ash's extra steps (start server, deploy agent, create session) exist because Ash manages persistent, stateful agent sessions rather than ephemeral compute.

## Summary

Ash and ComputeSDK are in different categories:

- **Ash** = AI agent orchestration platform (sessions, streaming, persistence, isolation)
- **ComputeSDK** = sandbox compute abstraction (multi-provider, ephemeral, code execution)

If you're deploying Claude agents that need production infrastructure, use Ash. If you need generic sandboxed code execution across cloud providers, use ComputeSDK. If you want both, they can complement each other.
