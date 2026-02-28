# Gap 05: `allowedTools` / `disallowedTools`

## Status: Done

## Problem

The Claude Agent SDK supports `allowedTools` and `disallowedTools` — lists of tool names the agent can or cannot use. Ash does not expose these. Users must define tool restrictions in the agent's `.claude/settings.json`, with no per-session override.

This matters for multi-tenant platforms where different users/tiers should have different tool access (e.g., free tier gets read-only tools, paid tier gets everything).

## SDK Reference

```typescript
// Claude Agent SDK Options
allowedTools?: string[];     // Whitelist of allowed tool names
disallowedTools?: string[];  // Blacklist of disallowed tool names
```

## Current State

Not exposed at any layer. The SDK loads tool config from `.claude/settings.json` via `settingSources: ['project']`.

## Approach

Passthrough. These should be settable **per-session** (at session creation) since tool restrictions are typically a property of the deployment context, not individual messages.

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `allowedTools?: string[]` and `disallowedTools?: string[]` to `CreateSessionRequest`
2. **`packages/shared/src/protocol.ts`** — Add both to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add both to `QueryOptions`, pass to SDK `options`
4. **`packages/server/src/routes/sessions.ts`** — Add to session-create body schema, store on session, wire to every `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add both to `createSession()` opts
6. **`packages/sandbox/src/manager.ts`** or session state — Persist tool restrictions so they apply to every message in the session

## Design Note

These are session-level, not message-level. The server needs to store them (in the session record or sandbox metadata) and inject them into every `QueryCommand` for that session. This is slightly different from the pure per-message passthroughs above.

## Effort

S — Passthrough with session-level persistence. Slightly more wiring than `maxTurns` since it's session-scoped.
