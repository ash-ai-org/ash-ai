---
sidebar_position: 8
title: Design Decisions
---

# Design Decisions

Architecture Decision Records (ADRs) for significant technical choices in Ash.

## ADR 0001: SDK Passthrough Types

**Date**: 2025-01-15 | **Status**: Accepted

**Decision**: Pass Claude Code SDK `Message` objects through the entire pipeline untranslated. The bridge yields raw SDK messages over the Unix socket. The server wraps them in SSE envelopes and streams them to the client. No custom `BridgeEvent` or `SSEEventType` translation layers.

**Context**: Ash originally defined three parallel type systems: `BridgeEvent` (7 variants in the bridge), `SSEEventType` (6 values in the server), and a translation layer converting SDK messages to bridge events. Every SDK message was translated twice.

**Why**:

- One type system instead of three -- less code to maintain
- SDK type changes propagate automatically through the pipeline (no manual translation updates)
- Clients (CLI, SDK) can use SDK types directly for type-safe message handling
- Translation layers do not protect against SDK breaking changes -- they just delay discovery

**What Ash owns**: Bridge commands (`query`, `resume`, `interrupt`, `shutdown`), orchestration types (`Session`, `Agent`, `SandboxInfo`, `PoolStats`), and two envelope events (`ready`, `error`). Everything else is SDK passthrough.

**Trade-off**: Tighter coupling to the SDK's type shape. If the SDK changes its `Message` type, the wire format changes. This is acceptable because the SDK is the primary dependency -- if it changes, Ash must update regardless.

---

## ADR 0002: HTTP over gRPC for Runner Communication

**Date**: 2026-02-18 | **Status**: Accepted

**Decision**: Use HTTP + SSE for communication between the server and runner processes instead of gRPC.

**Context**: Step 08 of the implementation plan adds runner processes that manage sandboxes on remote hosts. The server needs to communicate with runners for sandbox lifecycle operations and command streaming.

**Why**:

- **Simplicity**: gRPC adds protobuf schemas, code generation, the `@grpc/grpc-js` dependency, and binary debugging difficulty. HTTP uses the same Fastify framework, same patterns, same tools (curl, Swagger, browser).
- **No performance bottleneck**: LLM inference takes 2-10 seconds. The HTTP hop from server to runner adds single-digit milliseconds. gRPC would save 1-2ms per request -- irrelevant at this scale.
- **Ecosystem alignment**: Runners use the same Fastify framework as the server. Tests use the same patterns. One less technology in the stack.

**Alternatives considered**:

- **gRPC with bidirectional streaming**: More complex than needed. The command/event flow is naturally request-response with server-push, which SSE handles well.
- **WebSocket**: More complex lifecycle management and message framing for the same use case. SSE already handles server-push-only flows.

**Trade-off**: If true bidirectional streaming to runners becomes necessary, this decision would need revisiting. This is unlikely because the bridge protocol is inherently request/response.
