---
sidebar_position: 1
title: System Overview
---

# System Overview

Ash is a thin orchestration layer around the [Claude Code SDK](https://github.com/anthropic-ai/claude-code-sdk-python). It manages agent deployment, session lifecycle, sandbox isolation, and streaming -- adding as little overhead as possible on top of the SDK itself.

## Standalone Mode

In standalone mode, a single server process manages everything: HTTP API, sandbox pool, and bridge processes.

```mermaid
graph LR
    Client["Client (SDK / CLI / curl)"]
    Server["Ash Server<br/>Fastify :4100"]
    Pool["SandboxPool"]
    B1["Bridge 1"]
    B2["Bridge 2"]
    SDK1["Claude Code SDK"]
    SDK2["Claude Code SDK"]
    DB["SQLite / Postgres"]

    Client -->|HTTP + SSE| Server
    Server --> Pool
    Server --> DB
    Pool --> B1
    Pool --> B2
    B1 -->|Unix Socket| SDK1
    B2 -->|Unix Socket| SDK2
```

## Coordinator Mode

In coordinator mode, the server acts as a pure control plane. Sandbox execution is offloaded to remote runner processes on separate machines.

```mermaid
graph LR
    Client["Client"]
    Server["Ash Server<br/>(coordinator)"]
    R1["Runner 1"]
    R2["Runner 2"]
    B1["Bridge"]
    B2["Bridge"]
    DB["Postgres / CRDB"]

    Client -->|HTTP + SSE| Server
    Server --> DB
    Server -->|HTTP| R1
    Server -->|HTTP| R2
    R1 --> B1
    R2 --> B2
```

Runners register with the server via heartbeat. The server routes sessions to the runner with the most available capacity.

## Components

| Package | Description |
|---------|-------------|
| `@ash-ai/shared` | Types, protocol definitions, constants. No runtime dependencies. |
| `@ash-ai/sandbox` | SandboxManager, SandboxPool, BridgeClient, resource limits, state persistence. Used by both server and runner. |
| `@ash-ai/bridge` | Runs inside each sandbox process. Receives commands over Unix socket, calls the Claude Code SDK, streams responses back. |
| `@ash-ai/server` | Fastify REST API. Agent registry, session routing, SSE streaming, database access. |
| `@ash-ai/runner` | Worker node for multi-machine deployments. Manages sandboxes on a remote host, registers with the server. |
| `@ash-ai/sdk` | TypeScript client library for the Ash API. |
| `@ash-ai/cli` | `ash` command-line tool. Server lifecycle, agent deployment, session management. |

## Message Hot Path

Every message traverses this path. Ash's goal is to add no more than 1-3ms of overhead on top of the SDK.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server (Fastify)
    participant P as Pool
    participant B as Bridge
    participant SDK as Claude Code SDK

    C->>S: POST /api/sessions/:id/messages
    S->>S: Session lookup (DB)
    S->>P: markRunning(sandboxId)
    S->>B: query command (Unix socket)
    B->>SDK: sdk.query(prompt)
    SDK-->>B: Message stream
    B-->>S: message events (Unix socket)
    S-->>C: SSE stream (event: message)
    S->>P: markWaiting(sandboxId)
    S-->>C: event: done
```

## Package Dependency Graph

```mermaid
graph TD
    shared["@ash-ai/shared"]
    sandbox["@ash-ai/sandbox"]
    bridge["@ash-ai/bridge"]
    server["@ash-ai/server"]
    runner["@ash-ai/runner"]
    sdk["@ash-ai/sdk"]
    cli["@ash-ai/cli"]

    sandbox --> shared
    bridge --> shared
    server --> shared
    server --> sandbox
    runner --> shared
    runner --> sandbox
    sdk --> shared
    cli --> shared
```

## Storage Layout

```
data/
  ash.db                      # SQLite database (agents, sessions, sandboxes, messages, events)
  sandboxes/
    <session-id>/
      workspace/              # Agent workspace (CLAUDE.md, files, etc.)
  sessions/
    <session-id>/
      workspace/              # Persisted workspace snapshot (for cold resume)
```

In Postgres/CRDB mode, `ash.db` is replaced by the remote database. The `sandboxes/` and `sessions/` directories remain on the local filesystem.
