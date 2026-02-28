# Gap 01: `maxTurns`

## Status: Done

## Problem

The Claude Agent SDK supports `maxTurns` — a limit on how many agentic turns (API round-trips) a single `query()` call can make before stopping. Ash does not expose this option. Users cannot prevent runaway sessions that loop indefinitely.

## SDK Reference

```typescript
// Claude Agent SDK Options
maxTurns?: number; // Maximum conversation turns
```

When exceeded, the SDK yields a result message with `subtype: 'error_max_turns'`.

## Current State

- `CreateSessionRequest`: no `maxTurns` field
- `SendMessageRequest`: no `maxTurns` field
- `QueryCommand`: no `maxTurns` field
- `QueryOptions`: no `maxTurns` field
- Bridge `runRealQuery()`: does not pass `maxTurns`

## Approach

Pure passthrough. Add the field at every layer and pass it to the SDK.

This should be settable **per-message** (not just per-session) because different prompts may need different limits. A complex "refactor the codebase" prompt needs more turns than "what's in this file?".

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `maxTurns?: number` to `SendMessageRequest`
2. **`packages/shared/src/protocol.ts`** — Add `maxTurns?: number` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `maxTurns?: number` to `QueryOptions`, pass to SDK `options.maxTurns`
4. **`packages/server/src/routes/sessions.ts`** — Add `maxTurns` to message-send body schema, wire to `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `maxTurns?: number` to `SendMessageOptions`

## Effort

S — Add one field at each layer, ~30 minutes.
