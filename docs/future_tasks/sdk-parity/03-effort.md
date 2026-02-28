# Gap 03: `effort`

## Status: Done

## Problem

The Claude Agent SDK supports `effort` — a hint for how deeply Claude should think about its response. Maps to adaptive thinking depth. Ash does not expose this, so users cannot tune the quality/speed tradeoff.

## SDK Reference

```typescript
// Claude Agent SDK Options
effort?: 'low' | 'medium' | 'high' | 'max'; // Default: 'high'
```

## Current State

Not exposed at any layer. The SDK default (`'high'`) is always used.

## Approach

Pure passthrough. Settable **per-message** — a quick lookup needs `'low'`, a complex refactor needs `'max'`.

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `effort?: 'low' | 'medium' | 'high' | 'max'` to `SendMessageRequest`
2. **`packages/shared/src/protocol.ts`** — Add `effort?` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `effort?` to `QueryOptions`, pass to SDK `options.effort`
4. **`packages/server/src/routes/sessions.ts`** — Add to message-send body schema with enum validation, wire to `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `effort?` to `SendMessageOptions`

## Effort

S — Same pattern as `maxTurns`.
