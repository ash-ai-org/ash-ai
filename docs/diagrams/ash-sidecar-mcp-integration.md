# Ash + Sidecar MCP Integration Architecture

_2026-02-27 — How a host application with its own tools and infrastructure integrates with Ash via the sidecar MCP pattern._

## Overview

The host app keeps its tools as HTTP MCP endpoints inside its own process. Ash sessions connect to them as remote MCP servers. Two systems, clean boundary.

This pattern applies when you have an existing application (Python, Go, Java, etc.) that:
- Already has business logic, service clients, and infrastructure connections
- Wants agent capabilities (Claude, sandboxing, session management) without moving tools out of process
- Needs per-request context (tenant ID, auth, scoped clients) available to tools

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        HOST MACHINE                                             │
│                                                                                                 │
│  ┌───────────────────────────────────────────────┐   ┌────────────────────────────────────────┐  │
│  │          HOST APP (any language/framework)     │   │         ASH SERVER (Fastify, TS)       │  │
│  │          e.g. FastAPI, Express, Spring         │   │              :4100                     │  │
│  │                                                │   │                                        │  │
│  │  ┌──────────────────────────────────────────┐  │   │  ┌─────────┐  ┌──────────┐  ┌───────┐ │  │
│  │  │         Request Handler                  │  │   │  │ REST API│  │ Sessions │  │SQLite │ │  │
│  │  │                                          │  │   │  │  Routes │  │  (CRUD)  │  │  (DB) │ │  │
│  │  │  POST /api/run-agent                     │──┼──▶│  └────┬────┘  └──────────┘  └───────┘ │  │
│  │  │                                          │  │   │       │                                │  │
│  │  │  1. Receives request with tenant context  │  │   │       ▼                                │  │
│  │  │  2. Calls Ash REST API to create session │  │   │  ┌─────────────────────────────────┐   │  │
│  │  │  3. Streams SSE response back to caller  │  │   │  │     SandboxPool / Manager       │   │  │
│  │  └──────────────────────────────────────────┘  │   │  │     (@ash-ai/sandbox)            │   │  │
│  │                                                │   │  │                                 │   │  │
│  │  ┌──────────────────────────────────────────┐  │   │  │  - Creates isolated sandboxes   │   │  │
│  │  │      MCP Server Endpoint (HTTP)          │  │   │  │  - Manages lifecycle            │   │  │
│  │  │      /mcp/my-tools                       │  │   │  │  - Resource limits (cgroups)     │   │  │
│  │  │                                          │  │   │  │  - Env allowlist (security)     │   │  │
│  │  │  Speaks MCP protocol over HTTP/SSE       │  │   │  └──────────────┬──────────────────┘   │  │
│  │  │  Has full access to:                     │  │   │                 │                      │  │
│  │  │   • Service clients (gRPC, REST, etc.)   │  │   │                 │ spawns                │  │
│  │  │   • Database / cache connections         │  │   │                 ▼                      │  │
│  │  │   • Auth context, tenant state           │  │   │  ┌──────────────────────────────────┐  │  │
│  │  │   • In-memory state (browser instances,  │  │   │  │         SANDBOX (isolated)       │  │  │
│  │  │     connection pools, caches)            │  │   │  │  ┌────────────────────────────┐  │  │  │
│  │  │                                          │  │   │  │  │    Bridge Process          │  │  │  │
│  │  │  Exposes tools like:                     │  │   │  │  │    (@ash-ai/bridge)        │  │  │  │
│  │  │   • query_database                       │  │   │  │  │                            │  │  │  │
│  │  │   • call_internal_service                │  │   │  │  │  - Reads CLAUDE.md         │  │  │  │
│  │  │   • update_resource                      │  │   │  │  │  - Reads .mcp.json         │  │  │  │
│  │  │   • (stateful tools — keeps handles      │  │   │  │  │  - Calls Claude Agent SDK  │  │  │  │
│  │  │     alive across calls)                  │  │   │  │  │  - Yields SDK messages      │  │  │  │
│  │  └──────────────▲───────────────────────────┘  │   │  │  └─────┬──────────┬───────────┘  │  │  │
│  │                 │                              │   │  │        │          │              │  │  │
│  │                 │ MCP protocol                 │   │  │        │          │ spawns       │  │  │
│  │                 │ (JSON-RPC over HTTP)         │   │  │        │          ▼              │  │  │
│  │                 │                              │   │  │        │  ┌─────────────────┐   │  │  │
│  │                 │                              │   │  │        │  │  Claude CLI      │   │  │  │
│  │                 └──────────────────────────────┼───┼──┼────────┼──│  subprocess      │   │  │  │
│  │                                                │   │  │        │  │                  │   │  │  │
│  │                                                │   │  │        │  │  Env:            │   │  │  │
│  │                                                │   │  │        │  │  ANTHROPIC_BASE_ │   │  │  │
│  │                                                │   │  │        │  │   URL=gateway    │   │  │  │
│  │                                                │   │  │        │  │  ANTHROPIC_CUST_ │   │  │  │
│  │                                                │   │  │        │  │   HEADERS=...    │   │  │  │
│  │                                                │   │  │        │  └────────┬─────────┘   │  │  │
│  │                                                │   │  │        │           │             │  │  │
│  │                                                │   │  └────────┼───────────┼─────────────┘  │  │
│  │                                                │   │           │           │                │  │
│  └────────────────────────────────────────────────┘   └───────────┼───────────┼────────────────┘  │
│                                                                   │           │                   │
└───────────────────────────────────────────────────────────────────┼───────────┼───────────────────┘
                                                                    │           │
                                        Unix socket (ndjson)────────┘           │
                                                                                │ HTTPS
                                                                                ▼
                                                              ┌──────────────────────────────┐
                                                              │   API Gateway / LLM Proxy     │
                                                              │   (LiteLLM, custom proxy,     │
                                                              │    or direct)                 │
                                                              │                              │
                                                              │   Routes to model provider   │
                                                              └──────────────┬───────────────┘
                                                                             │
                                                                             ▼
                                                              ┌──────────────────────────────┐
                                                              │     Model Provider            │
                                                              │  (Anthropic, Bedrock, etc.)   │
                                                              └──────────────────────────────┘
```

## Communication Protocols

```
┌──────────────────┐     HTTP/SSE      ┌──────────────────┐    Unix Socket     ┌──────────────┐
│   Client / CLI   │ ◀───(streaming)──▶│   Ash Server     │ ◀───(ndjson)──────▶│    Bridge     │
│   or Host App    │    REST + SSE     │   :4100          │  BridgeCommand /   │  (in sandbox) │
└──────────────────┘                   └──────────────────┘  BridgeEvent       └──────┬───────┘
                                                                                      │
                                                                              SDK spawns CLI
                                                                                      │
                                                                                      ▼
┌──────────────────┐   MCP (JSON-RPC   ┌──────────────────────────────────────────────────────┐
│  Host App MCP    │ ◀──over HTTP)────▶│   Claude CLI subprocess                              │
│  /mcp/my-tools   │                   │   (reads .mcp.json, connects to declared servers)    │
└──────────────────┘                   └──────────────────────────────────────────────────────┘
```

### Protocol Summary

| Hop | From → To | Protocol | Format |
|-----|-----------|----------|--------|
| 1 | Client → Ash Server | HTTP REST + SSE | JSON (SDK Message types) |
| 2 | Ash Server → Bridge | Unix socket | Newline-delimited JSON (`BridgeCommand` / `BridgeEvent`) |
| 3 | Bridge → Claude CLI | In-process (SDK `query()`) | SDK `Message` objects (async generator) |
| 4 | Claude CLI → API Gateway | HTTPS | Anthropic Messages API |
| 5 | API Gateway → Model Provider | HTTPS | Provider API (Anthropic, Bedrock, etc.) |
| 6 | Claude CLI → Host App MCP | HTTP (JSON-RPC) | MCP protocol (tool calls / results) |

## Session Creation Flow (with sidecar MCP)

```
Host App                          Ash Server                    Sandbox
   │                                  │                            │
   │  POST /api/sessions              │                            │
   │  {                               │                            │
   │    agent: "my-agent",            │                            │
   │    extraEnv: {                   │                            │
   │      ANTHROPIC_BASE_URL: "...",  │                            │
   │      ANTHROPIC_CUSTOM_HEADERS:   │                            │
   │        "x-api-key: ..."         │                            │
   │    },                            │                            │
   │    model: "claude-sonnet-4-6"    │                            │
   │  }                               │                            │
   │ ────────────────────────────────▶│                            │
   │                                  │                            │
   │                                  │  1. Resolve agent folder   │
   │                                  │  2. Decrypt credentials    │
   │                                  │  3. Merge extraEnv         │
   │                                  │  4. createSandbox()        │
   │                                  │ ──────────────────────────▶│
   │                                  │                            │
   │                                  │        Copy agent dir ────▶│ workspace/
   │                                  │                            │ ├── CLAUDE.md
   │                                  │        Apply env ─────────▶│ ├── .mcp.json ◀── declares
   │                                  │        allowlist           │ │     remote MCP endpoints
   │                                  │                            │ ├── .claude/
   │                                  │        Spawn bridge ──────▶│ │   └── settings.json
   │                                  │                            │ └── (agent files)
   │                                  │                            │
   │                                  │◀── ready ─────────────────│
   │                                  │                            │
   │◀── 201 { session: {...} } ───────│                            │
   │                                  │                            │
```

## Message Flow (with sidecar MCP tool call)

```
Host App          Ash Server          Bridge           Claude CLI        Host App MCP
   │                  │                  │                  │                │
   │ POST /sessions/  │                  │                  │                │
   │   :id/messages   │                  │                  │                │
   │ {content:"..."}  │                  │                  │                │
   │ ────────────────▶│                  │                  │                │
   │                  │                  │                  │                │
   │  SSE stream ◀────│  query cmd ────▶│                  │                │
   │  (text/event-    │  (unix socket)  │  SDK query() ──▶│                │
   │   stream)        │                  │                  │                │
   │                  │                  │                  │  HTTPS ──────▶ Gateway ──▶ Model
   │                  │                  │                  │ ◀──── response │
   │                  │                  │                  │                │
   │                  │                  │                  │ ── tool_use: ─▶│
   │                  │                  │                  │  update_       │ (MCP JSON-RPC
   │                  │                  │                  │  resource      │  over HTTP)
   │                  │                  │                  │                │
   │                  │                  │                  │                │──▶ internal service
   │                  │                  │                  │                │    call (gRPC, DB,
   │                  │                  │                  │                │    cache, etc.)
   │                  │                  │                  │                │◀── result
   │                  │                  │                  │                │
   │                  │                  │                  │ ◀── tool_result│
   │                  │                  │                  │                │
   │                  │                  │                  │  HTTPS ──────▶ Gateway (continue)
   │                  │                  │                  │ ◀──── final   │
   │                  │                  │                  │                │
   │                  │  SDK messages ◀─│ ◀── messages ───│                │
   │                  │  (passthrough)  │                  │                │
   │                  │                  │                  │                │
   │ ◀── SSE events ──│ ◀── done ───────│                  │                │
   │  event: message  │                  │                  │                │
   │  event: done     │                  │                  │                │
   │                  │                  │                  │                │
```

## What Lives Where

```
┌─────────────────────────────────────────────────────────────────────┐
│                       HOST APP PROCESS                              │
│                    (your existing application)                       │
│                                                                     │
│  Owns:                                                              │
│   • Application routes (business logic, user-facing API)            │
│   • Service client connections (gRPC, REST, GraphQL, etc.)          │
│   • Database / cache connections (Postgres, Redis, etc.)            │
│   • MCP endpoint (exposes app tools over MCP protocol)              │
│   • Stateful tool resources (browser instances, connection pools)   │
│   • Observability (tracing, metrics, logging)                       │
│   • Request-scoped state (tenant ID, auth context, feature flags)   │
│                                                                     │
│  Calls Ash for:                                                     │
│   • Creating sessions (POST /api/sessions)                          │
│   • Sending messages (POST /api/sessions/:id/messages)              │
│   • Session lifecycle (pause, resume, end)                          │
│                                                                     │
│  Does NOT use Ash for:                                              │
│   • Non-agentic LLM calls (single-turn completions, embeddings)    │
│   • Workflows that don't need sandboxing or tool use               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      ASH SERVER (TypeScript)                        │
│                                                                     │
│  Owns:                                                              │
│   • REST API + SSE streaming (Fastify :4100)                        │
│   • Agent registry (deployed agent folders)                         │
│   • Session lifecycle (create, pause, resume, end)                  │
│   • SQLite database (sessions, messages, credentials, events)       │
│   • SandboxPool (warm pool, LRU eviction)                           │
│   • SandboxManager (process isolation, resource limits)             │
│   • Credential encryption/decryption                                │
│   • Multi-runner coordination (horizontal scaling)                  │
│   • Telemetry (usage tracking, token costs)                         │
│                                                                     │
│  Does NOT own:                                                      │
│   • Business logic (that's the host app)                            │
│   • Tool implementations (that's the MCP servers)                   │
│   • Model routing (that's the API gateway, via env vars)            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      SANDBOX (isolated process)                     │
│                                                                     │
│  Contains:                                                          │
│   • Bridge process (@ash-ai/bridge)                                 │
│   • Agent workspace (copied from agent dir)                         │
│     - CLAUDE.md (system prompt)                                     │
│     - .mcp.json (MCP server declarations)                           │
│     - .claude/settings.json (permissions, model defaults)           │
│   • Claude CLI subprocess (spawned by SDK)                          │
│   • Stdio MCP servers (spawned by CLI from .mcp.json)               │
│                                                                     │
│  Isolation boundary:                                                │
│   • Allowlisted env vars only (no process.env spread)               │
│   • Resource limits (memory, CPU, disk, process count)              │
│   • Filesystem isolation (bwrap on Linux)                           │
│   • Network: can reach API gateway + MCP endpoints                  │
│                                                                     │
│  Communicates outward:                                              │
│   • Unix socket → Ash Server (bridge protocol, ndjson)              │
│   • HTTPS → API gateway (Claude API calls)                          │
│   • HTTP → Host App MCP endpoint (tool calls)                       │
└─────────────────────────────────────────────────────────────────────┘
```

## The .mcp.json for Sidecar Pattern

The agent's `.mcp.json` declares the host app's MCP server as a remote HTTP endpoint:

```json
{
  "mcpServers": {
    "my-tools": {
      "url": "http://host-app:8000/mcp/my-tools"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-fetch"]
    }
  }
}
```

- `my-tools` — remote HTTP MCP server running inside the host app (sidecar pattern)
- `fetch` — standard stdio MCP server spawned locally inside the sandbox

Both appear identically to the Claude CLI. It doesn't know or care where the MCP server lives.

## What Changes for Per-Session Dynamic MCP

Today, `.mcp.json` is copied from the agent dir at sandbox creation. To support per-session MCP endpoints (different tenant, different tools), Ash needs:

```
POST /api/sessions
{
  "agent": "my-agent",
  "mcpServers": {                                              ◀── NEW
    "my-tools": {
      "url": "http://host-app:8000/mcp/my-tools?tenant=t_123"
    }
  },
  "extraEnv": {
    "ANTHROPIC_BASE_URL": "http://gateway:8080/v1",
    "ANTHROPIC_CUSTOM_HEADERS": "x-api-key: ..."
  }
}
```

Implementation: merge `mcpServers` from the request into the agent's `.mcp.json` before writing it to the sandbox workspace. Three lines of code in `SandboxManager.createSandbox()`.

## Why Sidecar MCP (Not In-Process)

Some SDKs offer "in-process MCP" — registering functions as tool callbacks within the same process. This works for simple cases but breaks down when you need:

| Concern | In-Process | Sidecar MCP |
|---------|-----------|-------------|
| Language coupling | Tools must be same language as SDK | Tools can be any language |
| Shared infrastructure | Need to import SDK into your app | HTTP boundary, no import needed |
| Stateful tools | Works (same process memory) | Works (MCP server is long-lived per session) |
| Per-tenant scoping | Closure variables | Query params or headers on MCP URL |
| Scaling | Tools scale with SDK process | Tools scale independently |
| Isolation | Tools run with SDK privileges | Tools run with app privileges, sandbox is separate |

The sidecar pattern uses MCP the way it was designed — as a network protocol between services. The host app's tools stay in the host app's process with full access to its infrastructure. Ash handles the agent lifecycle, sandboxing, and streaming. Clean separation.
