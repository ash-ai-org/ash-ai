# 0001: Use SDK Types as Passthrough, Not Custom Bridge/SSE Types

**Date**: 2025-01-15
**Status**: Accepted

## Context

The Claude Code SDK (`@anthropic-ai/claude-code`) defines a rich type system for conversation messages:

```typescript
// From the SDK
type Message = AssistantMessage | UserMessage | ResultMessage | SystemMessage;

interface AssistantMessage {
  type: 'assistant';
  message: { role: 'assistant'; content: ContentBlock[]; ... };
  session_id: string;
}

interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | ...;
  session_id: string;
  ...
}
```

Ash currently defines three parallel type systems that translate these into custom forms:

1. **`BridgeEvent`** in `protocol.ts` — `assistant_message`, `tool_use`, `tool_result`, `result`, `error`, `done`
2. **`SSEEventType`** in `types.ts` — `message_start`, `content_delta`, `tool_use`, `tool_result`, `message_end`, `error`
3. **Translation layer** in `sdk-wrapper.ts` — a `switch` statement converting SDK messages into `BridgeEvent` objects

This means every SDK message gets translated twice: SDK → BridgeEvent (in the bridge), then BridgeEvent → SSEEvent (in the server). Each translation loses information and introduces a maintenance burden.

## Decision

**Pass SDK `Message` objects through the entire pipeline untranslated.**

- The bridge process calls the SDK and yields `Message` objects over the Unix socket as newline-delimited JSON.
- The runner reads `Message` objects from the socket and forwards them.
- The server wraps `Message` objects in an SSE envelope (`event: message\ndata: <JSON>\n\n`) and streams them to the client.
- Ash adds only two envelope event types: `ready` (bridge handshake) and `error` (Ash-level errors, not SDK errors).

## What Changes

| File | Current | Target |
|------|---------|--------|
| `shared/protocol.ts` | Custom `BridgeEvent` union (7 variants) | `SDKMessage \| BridgeReady \| BridgeError` (SDK type + 2 envelope types) |
| `shared/types.ts` | Custom `SSEEventType` enum (6 values) | Remove entirely — SSE carries SDK messages |
| `bridge/sdk-wrapper.ts` | `switch(msg.type)` translation to BridgeEvent | Yield SDK messages directly |
| `runner/bridge.ts` | Parse `BridgeEvent` | Parse `SDKMessage \| BridgeReady \| BridgeError` |
| `server/sessions.ts` | Transform BridgeEvent → SSE with custom event names | Forward SDK messages as SSE `data:` payloads |
| `cli/client.ts` | Parse custom SSE event names | Parse SDK message types from SSE |
| `sdk/session.ts` | Parse custom SSE event names | Parse SDK message types from SSE |

## What Stays the Same

- `BridgeCommand` types (query, resume, interrupt, shutdown) — these are Ash-specific commands, not SDK types.
- `Session`, `Agent`, `SandboxInfo`, `PoolStatus` — Ash orchestration types.
- `ApiError` — Ash API error envelope.
- The newline-delimited JSON framing on the Unix socket.
- The SSE transport layer to the client.

## Consequences

**Good**:
- One type system instead of three
- SDK type changes automatically propagate (no manual translation updates)
- Clients (CLI, SDK) can use SDK types directly for type-safe message handling
- Less code to maintain

**Bad**:
- Tighter coupling to the SDK's type shape (if the SDK changes, the wire format changes)
- SDK must be a dependency of `shared` for the types (or we import types only)

**Mitigated by**: The SDK is our primary dependency. If it changes, we need to update anyway. Translation layers don't protect us from breaking changes — they just delay the discovery.

## Implementation

This refactoring should happen as part of step 01 (consolidation) or immediately after. It's a mechanical change: remove the translation switch statements, update the type imports, update the parsers.
