# Gap 06: `betas`

## Status: Done

## Problem

The Claude Agent SDK supports `betas` — a list of beta feature flags to enable. Currently the only flag is `'context-1m-2025-08-07'` which enables 1M token context windows on supported models. Ash does not expose this, so users cannot opt into beta features.

## SDK Reference

```typescript
// Claude Agent SDK Options
betas?: SdkBeta[];

type SdkBeta = 'context-1m-2025-08-07';
```

## Current State

Not exposed at any layer.

## Approach

Passthrough. Settable **per-session** — beta flags are typically a property of the deployment, not individual messages.

Since the beta list is a simple string array, pass it through without validating the values. The SDK will reject invalid betas. This avoids Ash needing to update every time Anthropic adds a new beta flag.

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `betas?: string[]` to `CreateSessionRequest`
2. **`packages/shared/src/protocol.ts`** — Add `betas?: string[]` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `betas?: string[]` to `QueryOptions`, pass to SDK `options.betas`
4. **`packages/server/src/routes/sessions.ts`** — Add to session-create body schema, store on session, wire to every `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `betas?: string[]` to `createSession()` opts

## Effort

S — Same session-level passthrough pattern as tool restrictions.
