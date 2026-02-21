# Plan 02: Granular Stream Events

## Status: Done
## Priority: Critical
## Effort: Medium

## Problem

Ash's SSE stream emits 3 event types: `message`, `error`, `done`. The cloud UI expects 12+ granular event types:

```
session_start, text_delta, thinking_delta, message, tool_use, tool_result,
turn_complete, session_end, session_stopped, sandbox_log, mcp_status, error
```

The cloud uses these for:
- Real-time text streaming in the chat UI (`text_delta`)
- Tool call visualization (`tool_use` → spinner → `tool_result`)
- Thinking indicator (`thinking_delta`)
- Session lifecycle indicators (`session_start`, `session_end`)

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

Stream event types consumed by the cloud:
- `harness/packages/ash-ai/src/types/index.ts` — `StreamEvent` union, `StreamEventType` enum (`SESSION_START`, `TEXT_DELTA`, `THINKING_DELTA`, `TOOL_USE`, `TOOL_RESULT`, `TURN_COMPLETE`, `SESSION_END`, etc.)
- `packages/shared/src/index.ts` — re-exports `SessionStartEvent`, `TextDeltaEvent`, `ThinkingDeltaEvent`, `MessageEvent`, `ToolUseEvent`, `ToolResultEvent`, `SessionEndEvent`, `SessionStoppedEvent`, `ErrorEvent`

Cloud files that depend on granular events:
- `apps/web/src/lib/services/agent-execution.ts` — emits granular events during agent execution streaming
- `apps/web/src/app/api/v1/sessions/[sessionId]/events/route.ts` — queries events with `EventCategory`, `EventSource`, `ListSessionEventsOptions` filters
- `harness/packages/ash-ai/src/server/routes/sessions.ts` — SSE streaming route with event relay

## Current State

- Bridge emits raw SDK messages as `{ ev: 'message', data: <sdk-message> }`
- `@ash-ai/shared` already has `classifyBridgeMessage()` which maps SDK messages to `SessionEventType`: `text`, `tool_start`, `tool_result`, `reasoning`, `error`, `turn_complete`, `lifecycle`
- Server persists events to `session_events` table with type classification
- SSE endpoint re-emits as `event: message` with the raw data

## Approach

### Enrich SSE events at the server level

The bridge stays as-is (raw SDK passthrough). The server's SSE endpoint classifies and re-emits as granular events:

1. **Define known SSE event types** in `@ash-ai/shared`, but keep the type open:
   ```typescript
   // Known types we actively parse and structure
   type KnownSSEEventType =
     | 'session_start'
     | 'text_delta'
     | 'thinking_delta'
     | 'tool_use'
     | 'tool_result'
     | 'turn_complete'
     | 'message'       // full message (existing)
     | 'session_end'
     | 'error'
     | 'done'

   // The actual type — a known event or any string we don't recognize yet
   type AshSSEEventType = KnownSSEEventType | (string & {})
   ```

2. **Enhance `classifyBridgeMessage()`** to also extract deltas:
   ```typescript
   interface ClassifiedEvent {
     type: AshSSEEventType
     data: Record<string, any>
     // For text_delta: { delta: string }
     // For tool_use: { id, name, input }
     // For tool_result: { tool_use_id, content, is_error }
     // For message: { raw SDK message }
     // For unrecognized: { raw: <original data> }
   }
   ```
   When `classifyBridgeMessage()` encounters an SDK message shape it doesn't recognize, it emits a `ClassifiedEvent` with the SDK's own type string and the raw data preserved. Never drops, never errors.

3. **Update SSE endpoint** in server to emit classified events:
   ```
   event: text_delta
   data: {"delta": "Hello"}

   event: tool_use
   data: {"id": "tu_123", "name": "Read", "input": {"path": "/foo"}}

   event: message
   data: {<full SDK message>}
   ```

4. **Always emit the raw `message` event too** — every SDK message gets emitted as-is under `event: message`, regardless of whether we also emitted granular events for it. This gives clients two options: consume the structured granular events, or ignore them and just use raw messages like before.

5. **SDK client handles unknown event types gracefully** — `parseSSEStream()` yields all events, including ones with types it doesn't have specific handling for. Consumers can switch on known types and have a default case for the rest.

## Implementation Steps

1. Extend `AshSSEEventType` in `@ash-ai/shared`
2. Enhance `classifyBridgeMessage()` to return `ClassifiedEvent[]` (one SDK message can produce multiple events, e.g. text_delta + message)
3. Update server's `POST /api/sessions/:id/messages` handler to emit granular SSE events
4. Update `@ash-ai/sdk` `parseSSEStream()` to handle new event types
5. Add `session_start` event emission when session begins streaming
6. Add `turn_complete` detection (SDK signals this)
7. Add tests with captured SDK message sequences

## Design Principle: Assist, Don't Obstruct

Same philosophy as structured messages (plan 01). The granular event layer is additive — it helps clients that want structure, but never gets in the way of the raw data. If the SDK starts emitting new event shapes, they flow through as unrecognized events with raw data intact. Clients always get everything.

The event type is `string`, not a closed enum. Known types get autocomplete and type narrowing. Unknown types still parse and deliver.

## Backward Compatibility

- Existing `message` events continue to be emitted alongside granular events
- `done` event still signals end of stream
- SDK client's `sendMessageStream()` returns the new types but old code ignoring unknown events still works
- Unknown event types are yielded as-is, never dropped

## Open Questions

- Should we emit `text_delta` for each SDK content_block_delta, or accumulate per-turn?
- Do we need `sandbox_log` and `mcp_status` events? (These are ash-ai specific)
- Should granular events be opt-in via query param (e.g. `?granular=true`)?
