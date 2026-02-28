# Gap 02: `maxBudgetUsd`

## Status: Done

## Problem

The Claude Agent SDK supports `maxBudgetUsd` — a cost cap for a single `query()` call. Ash does not expose this. Users cannot enforce per-message spending limits, which is a common requirement for production deployments.

## SDK Reference

```typescript
// Claude Agent SDK Options
maxBudgetUsd?: number; // Maximum budget in USD for the query
```

When exceeded, the SDK yields a result message with `subtype: 'error_max_budget_usd'`.

## Current State

Not exposed at any layer.

## Approach

Pure passthrough. Add the field at every layer and pass it to the SDK.

Settable **per-message** — different prompts have different cost profiles.

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `maxBudgetUsd?: number` to `SendMessageRequest`
2. **`packages/shared/src/protocol.ts`** — Add `maxBudgetUsd?: number` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `maxBudgetUsd?: number` to `QueryOptions`, pass to SDK `options.maxBudgetUsd`
4. **`packages/server/src/routes/sessions.ts`** — Add to message-send body schema, wire to `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `maxBudgetUsd?: number` to `SendMessageOptions`

## Effort

S — Same pattern as `maxTurns`.
