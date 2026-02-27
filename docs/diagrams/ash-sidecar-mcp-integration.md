# Ash + Sidecar MCP Integration Architecture

_2026-02-27 — How a host application (e.g. backbone) integrates with Ash when it has Python tools that need access to in-process infrastructure._

## Overview

The host app keeps its tools as HTTP MCP endpoints inside its own process. Ash sessions connect to them as remote MCP servers. Two systems, clean boundary.

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        HOST MACHINE                                             │
│                                                                                                 │
│  ┌───────────────────────────────────────────────┐   ┌────────────────────────────────────────┐  │
│  │          BACKBONE (FastAPI, Python)            │   │         ASH SERVER (Fastify, TS)       │  │
│  │                                                │   │              :4100                     │  │
│  │  ┌──────────────────────────────────────────┐  │   │                                        │  │
│  │  │         Request Handler                  │  │   │  ┌─────────┐  ┌──────────┐  ┌───────┐ │  │
│  │  │                                          │  │   │  │ REST API│  │ Sessions │  │SQLite │ │  │
│  │  │  POST /api/ai/storefront-theme           │──┼──▶│  │  Routes │  │  (CRUD)  │  │  (DB) │ │  │
│  │  │                                          │  │   │  └────┬────┘  └──────────┘  └───────┘ │  │
│  │  │  1. Receives request with business_id    │  │   │       │                                │  │
│  │  │  2. Calls Ash REST API to create session │  │   │       ▼                                │  │
│  │  │  3. Streams SSE response back to caller  │  │   │  ┌─────────────────────────────────┐   │  │
│  │  └──────────────────────────────────────────┘  │   │  │     SandboxPool / Manager       │   │  │
│  │                                                │   │  │     (@ash-ai/sandbox)            │   │  │
│  │  ┌──────────────────────────────────────────┐  │   │  │                                 │   │  │
│  │  │      MCP Server Endpoint (HTTP)          │  │   │  │  - Creates isolated sandboxes   │   │  │
│  │  │      /mcp/storefront                     │  │   │  │  - Manages lifecycle            │   │  │
│  │  │                                          │  │   │  │  - Resource limits (cgroups)     │   │  │
│  │  │  Speaks MCP protocol over HTTP/SSE       │  │   │  │  - Env allowlist (security)     │   │  │
│  │  │  Has full access to:                     │  │   │  └──────────────┬──────────────────┘   │  │
│  │  │   • gRPC clients (storefront service)    │  │   │                 │                      │  │
│  │  │   • Redis connections                    │  │   │                 │ spawns                │  │
│  │  │   • Database models                      │  │   │                 ▼                      │  │
│  │  │   • Request-scoped state (business_id)   │  │   │  ┌──────────────────────────────────┐  │  │
│  │  │                                          │  │   │  │         SANDBOX (isolated)       │  │  │
│  │  │  Tools exposed:                          │  │   │  │  ┌────────────────────────────┐  │  │  │
│  │  │   • save_preview_theme                   │  │   │  │  │    Bridge Process          │  │  │  │
│  │  │   • get_existing_theme                   │  │   │  │  │    (@ash-ai/bridge)        │  │  │  │
│  │  │   • generate_theme_preview               │  │   │  │  │                            │  │  │  │
│  │  │   • (Playwright tools — keeps browser    │  │   │  │  │  - Reads CLAUDE.md         │  │  │  │
│  │  │     instance alive across calls)         │  │   │  │  │  - Reads .mcp.json         │  │  │  │
│  │  └──────────────▲───────────────────────────┘  │   │  │  │  - Calls Claude Agent SDK  │  │  │  │
│  │                 │                              │   │  │  │  - Yields SDK messages      │  │  │  │
│  │                 │ MCP protocol                 │   │  │  └─────┬──────────┬───────────┘  │  │  │
│  │                 │ (JSON-RPC over HTTP)         │   │  │        │          │              │  │  │
│  │                 │                              │   │  │        │          │ spawns       │  │  │
│  │                 │                              │   │  │        │          ▼              │  │  │
│  │                 │                              │   │  │        │  ┌─────────────────┐   │  │  │
│  │                 │                              │   │  │        │  │  Claude CLI      │   │  │  │
│  │                 └──────────────────────────────┼───┼──┼────────┼──│  subprocess      │   │  │  │
│  │                                                │   │  │        │  │                  │   │  │  │
│  │                                                │   │  │        │  │  Env:            │   │  │  │
│  │                                                │   │  │        │  │  ANTHROPIC_BASE_ │   │  │  │
│  │                                                │   │  │        │  │   URL=portkey    │   │  │  │
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
                                                              │   Portkey Gateway             │
                                                              │   (cybertron-service-gateway) │
                                                              │                              │
                                                              │   Routes via virtual key     │
                                                              │   to AWS Bedrock             │
                                                              └──────────────┬───────────────┘
                                                                             │
                                                                             ▼
                                                              ┌──────────────────────────────┐
                                                              │     AWS Bedrock              │
                                                              │     Claude model             │
                                                              └──────────────────────────────┘
```

## Communication Protocols

```
┌──────────────────┐     HTTP/SSE      ┌──────────────────┐    Unix Socket     ┌──────────────┐
│   Client / CLI   │ ◀───(streaming)──▶│   Ash Server     │ ◀───(ndjson)──────▶│    Bridge     │
│   or Backbone    │    REST + SSE     │   :4100          │  BridgeCommand /   │  (in sandbox) │
└──────────────────┘                   └──────────────────┘  BridgeEvent       └──────┬───────┘
                                                                                      │
                                                                              SDK spawns CLI
                                                                                      │
                                                                                      ▼
┌──────────────────┐   MCP (JSON-RPC   ┌──────────────────────────────────────────────────────┐
│  Backbone MCP    │ ◀──over HTTP)────▶│   Claude CLI subprocess                              │
│  /mcp/storefront │                   │   (reads .mcp.json, connects to declared servers)    │
└──────────────────┘                   └──────────────────────────────────────────────────────┘
```

### Protocol Summary

| Hop | From → To | Protocol | Format |
|-----|-----------|----------|--------|
| 1 | Client → Ash Server | HTTP REST + SSE | JSON (SDK Message types) |
| 2 | Ash Server → Bridge | Unix socket | Newline-delimited JSON (`BridgeCommand` / `BridgeEvent`) |
| 3 | Bridge → Claude CLI | In-process (SDK `query()`) | SDK `Message` objects (async generator) |
| 4 | Claude CLI → Portkey | HTTPS | Anthropic Messages API |
| 5 | Portkey → Bedrock | HTTPS | AWS Bedrock API |
| 6 | Claude CLI → MCP Server | HTTP (JSON-RPC) | MCP protocol (tool calls / results) |

## Session Creation Flow (with sidecar MCP)

```
Backbone                          Ash Server                    Sandbox
   │                                  │                            │
   │  POST /api/sessions              │                            │
   │  {                               │                            │
   │    agent: "storefront-theme",    │                            │
   │    extraEnv: {                   │                            │
   │      ANTHROPIC_BASE_URL: "...",  │                            │
   │      ANTHROPIC_CUSTOM_HEADERS:   │                            │
   │        "x-portkey-api-key: ..."  │                            │
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
Backbone          Ash Server          Bridge           Claude CLI        Backbone MCP
   │                  │                  │                  │                │
   │ POST /sessions/  │                  │                  │                │
   │   :id/messages   │                  │                  │                │
   │ {content:"..."}  │                  │                  │                │
   │ ────────────────▶│                  │                  │                │
   │                  │                  │                  │                │
   │  SSE stream ◀────│  query cmd ────▶│                  │                │
   │  (text/event-    │  (unix socket)  │  SDK query() ──▶│                │
   │   stream)        │                  │                  │                │
   │                  │                  │                  │  HTTPS ──────▶ Portkey ──▶ Bedrock
   │                  │                  │                  │ ◀──── response │
   │                  │                  │                  │                │
   │                  │                  │                  │ ── tool_use: ─▶│
   │                  │                  │                  │  save_preview  │ (MCP JSON-RPC
   │                  │                  │                  │  _theme        │  over HTTP)
   │                  │                  │                  │                │
   │                  │                  │                  │                │──▶ gRPC call to
   │                  │                  │                  │                │    storefront
   │                  │                  │                  │                │    service
   │                  │                  │                  │                │◀── result
   │                  │                  │                  │                │
   │                  │                  │                  │ ◀── tool_result│
   │                  │                  │                  │                │
   │                  │                  │                  │  HTTPS ──────▶ Portkey (continue)
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
│                      BACKBONE PROCESS (Python)                      │
│                                                                     │
│  Owns:                                                              │
│   • FastAPI routes (business logic, user-facing API)                │
│   • gRPC client connections (storefront, payments, etc.)            │
│   • Redis connections, DB models                                    │
│   • MCP endpoint /mcp/storefront (exposes Python tools as MCP)     │
│   • Playwright browser instances (long-lived, stateful)             │
│   • OpenTelemetry tracing (AgentTracer)                             │
│   • Memory system (filesystem + remote storage)                     │
│   • Request-scoped state (business_id, auth context)                │
│                                                                     │
│  Calls Ash for:                                                     │
│   • Creating sessions (POST /api/sessions)                          │
│   • Sending messages (POST /api/sessions/:id/messages)              │
│   • Session lifecycle (pause, resume, end)                          │
│                                                                     │
│  Does NOT use Ash for:                                              │
│   • Direct Portkey calls (large single-turn HTML gen, no SDK)       │
│   • Chat HTML patching (direct API, not agentic)                    │
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
│   • Business logic (that's backbone)                                │
│   • Tool implementations (that's MCP servers)                       │
│   • Model routing (that's Portkey, via env vars)                    │
│   • Memory/tracing (not implemented)                                │
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
│   • Network: can reach Portkey gateway + MCP endpoints              │
│                                                                     │
│  Communicates outward:                                              │
│   • Unix socket → Ash Server (bridge protocol, ndjson)              │
│   • HTTPS → Portkey gateway (Claude API calls)                      │
│   • HTTP → Backbone MCP endpoint (tool calls)                       │
└─────────────────────────────────────────────────────────────────────┘
```

## The .mcp.json for Sidecar Pattern

The agent's `.mcp.json` declares the backbone MCP server as a remote HTTP endpoint:

```json
{
  "mcpServers": {
    "storefront": {
      "url": "http://backbone:8000/mcp/storefront"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-fetch"]
    }
  }
}
```

- `storefront` — remote HTTP MCP server running inside backbone (sidecar pattern)
- `fetch` — standard stdio MCP server spawned locally inside the sandbox

Both appear identically to the Claude CLI. It doesn't know or care where the MCP server lives.

## What Changes for Per-Session Dynamic MCP

Today, `.mcp.json` is copied from the agent dir at sandbox creation. To support per-session MCP endpoints (different `business_id` per session), Ash needs:

```
POST /api/sessions
{
  "agent": "storefront-theme",
  "mcpServers": {                                          ◀── NEW
    "storefront": {
      "url": "http://backbone:8000/mcp/storefront?biz=123"
    }
  },
  "extraEnv": {
    "ANTHROPIC_BASE_URL": "http://cybertron:8080/v1",
    "ANTHROPIC_CUSTOM_HEADERS": "x-portkey-api-key: ..."
  }
}
```

Implementation: merge `mcpServers` from the request into the agent's `.mcp.json` before writing it to the sandbox workspace. Three lines of code in `SandboxManager.createSandbox()`.
