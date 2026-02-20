# 02 - Core Concepts (Deep Dive)

These concepts are introduced briefly in Getting Started > Key Concepts. The Architecture section covers them in full technical depth. This plan captures the conceptual layer between the two — for users who want to understand how Ash works without reading protocol specs.

Most of this content lives in the Architecture section pages. This file documents what each concept page should cover.

## Agents

**Page:** Architecture > System Overview (agent subsection) + Guides > Defining an Agent

**What to cover:**
- Agent = folder on disk. Minimum: `CLAUDE.md`.
- Optional config: `.claude/settings.json` (permissions, model), `.claude/skills/`, `.mcp.json`
- Deployment creates an entry in the server's database
- Agents are immutable after deploy — redeploy to update
- Multi-tenant: agents are scoped to a tenant

**Source:** `README.md` agent folder examples, `docs/getting-started.md`, `routes/agents.ts`

---

## Sessions

**Page:** Architecture > Session Lifecycle

**What to cover:**
- State machine: `starting -> active -> paused -> active (resume) -> ended`
- Error recovery: `active -> error -> paused (resumable)`
- Creating a session allocates a sandbox
- Pausing persists workspace state to disk (or cloud)
- Resuming: fast path (sandbox still alive) or cold path (restore from snapshot)
- Sessions are scoped to an agent and tenant
- Session data: id, agentName, status, sandboxId, runnerId, createdAt, updatedAt

**Source:** `docs/features/session-resume.md`, `docs/architecture.md`

---

## Sandboxes

**Page:** Architecture > Sandbox Isolation + Architecture > Sandbox Pool

**What to cover:**
- Sandbox = isolated child process running the bridge
- Environment allowlist (only PATH, HOME, LANG, TERM, ANTHROPIC_API_KEY, ASH_* vars)
- Resource limits on Linux: memory, CPU, process count, disk via cgroups v2
- Pool management: warm pool, LRU eviction, idle sweep, capacity limits
- States: cold -> warming -> warm -> waiting -> running

**Source:** `docs/features/sandbox-pool.md`, `docs/jeff-dean-plan/04b-sandbox-isolation.md`

---

## Bridge Protocol

**Page:** Architecture > Bridge Protocol

**What to cover:**
- Unix socket communication, newline-delimited JSON
- Commands: query, resume, interrupt, shutdown
- Events: ready, message (raw SDK Message), error, done
- Key design decision: SDK messages pass through unchanged (no translation layer)
- Backpressure: bridge respects socket write backpressure

**Source:** `packages/shared/src/protocol.ts`, `docs/features/sse-backpressure.md`, `docs/decisions/0001-sdk-passthrough-types.md`

---

## SSE Streaming

**Page:** Guides > Streaming Responses + API Reference > Messages

**What to cover:**
- Server-Sent Events format for real-time streaming
- Event types: `message` (SDK Message), `error`, `done`
- Backpressure: server respects TCP backpressure, 30s timeout for dead clients
- Partial messages: opt-in via `includePartialMessages` for typing indicators
- Client consumption patterns (EventSource, fetch + reader, SDK helper)

**Source:** `docs/features/sse-backpressure.md`, `docs/api-reference.md`, `packages/sdk/src/sse.ts`
