# Gap 04: `thinking`

## Status: Done

## Problem

The Claude Agent SDK supports `thinking` — fine-grained control over Claude's extended thinking/reasoning behavior. Options include adaptive thinking (model decides), fixed budget, or disabled. Ash does not expose this.

## SDK Reference

```typescript
// Claude Agent SDK Options
thinking?: ThinkingConfig;

type ThinkingConfig =
  | { type: 'adaptive' }              // Model determines when and how much to reason
  | { type: 'enabled'; budgetTokens?: number }  // Fixed thinking token budget
  | { type: 'disabled' };             // No extended thinking
```

Default is `{ type: 'adaptive' }` for supported models.

## Current State

Not exposed at any layer. SDK default (`adaptive`) is always used.

## Approach

Pure passthrough. Settable **per-message** — some prompts benefit from deep reasoning, others don't need it.

The `ThinkingConfig` type is a discriminated union, so the JSON schema needs to support the three variants. The simplest approach is to accept it as a JSON object and pass it through without additional validation (the SDK validates it).

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `thinking?` to `SendMessageRequest` (use a simple object type or import from SDK)
2. **`packages/shared/src/protocol.ts`** — Add `thinking?` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `thinking?` to `QueryOptions`, pass to SDK `options.thinking`
4. **`packages/server/src/routes/sessions.ts`** — Add to message-send body schema (accept as object), wire to `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `thinking?` to `SendMessageOptions`

## Design Note

Don't re-export or redefine the SDK's `ThinkingConfig` type in `@ash-ai/shared`. Use a loose type like `{ type: string; budgetTokens?: number }` or just `Record<string, unknown>` and let the SDK validate. This follows Principle 8 — don't translate SDK types.

## Effort

S — Passthrough with a slightly more complex JSON schema.
