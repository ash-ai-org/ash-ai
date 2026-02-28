# Gap 11: `canUseTool` (Custom Permission Callback)

## Status: Done (Option B — covered by allowedTools/disallowedTools in task 05)

## Problem

The Claude Agent SDK supports `canUseTool` — a custom callback function that controls whether a tool can be used. It receives the tool name, input, and context, and returns allow/deny with optional input modifications. Ash does not expose this.

This is how SDK users implement:
- Fine-grained authorization (different users can use different tools)
- Input sanitization (rewrite dangerous bash commands)
- Audit logging (log every tool use to an external system)
- Approval workflows (pause and ask a human before destructive operations)

## SDK Reference

```typescript
canUseTool?: (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string; interrupt?: boolean };
```

## Current State

Not exposed. Ash's security model uses sandbox isolation as the permission boundary (default `permissionMode: 'bypassPermissions'`). For finer control, users can set `permissionMode: 'permissionsByAgent'` and configure allow/deny rules in `.claude/settings.json`.

## Approach

`canUseTool` is a callback function — it cannot be serialized. Like hooks (gap 08), this needs a webhook-based approach.

### Option A: Webhook-Based Permission Handler

New field on `CreateSessionRequest`:

```typescript
permissionWebhookUrl?: string;
```

When the SDK calls `canUseTool`:
1. Bridge serializes the tool name, input, and context
2. Sends to server via bridge protocol
3. Server POSTs to the webhook URL
4. Webhook responds with allow/deny
5. Server sends response back to bridge
6. Bridge returns the result to the SDK

### Option B: Static Rules Only

Don't implement `canUseTool` at all. Instead, enhance Ash's support for the SDK's static permission rules (`.claude/settings.json` allow/deny lists) with per-session overrides (see gap 05).

This covers the most common use case (tool restrictions per tenant) without the complexity of webhooks.

## Recommendation

Start with **Option B** — per-session `allowedTools`/`disallowedTools` (gap 05) covers 80% of use cases. Implement **Option A** (webhooks) later, ideally sharing infrastructure with hook webhooks (gap 08).

## Files to Change (Option A)

1. **`packages/shared/src/types.ts`** — Add `permissionWebhookUrl?` to `CreateSessionRequest`
2. **`packages/shared/src/protocol.ts`** — New `PermissionRequestEvent` (bridge → server) and `PermissionResponseCommand` (server → bridge)
3. **`packages/bridge/src/sdk.ts`** — Implement `canUseTool` callback that sends events over the socket
4. **`packages/server/src/routes/sessions.ts`** — Handle permission events, POST to webhook
5. **`packages/sandbox/src/bridge-client.ts`** — Bidirectional communication for permission requests

## Effort

Option A: L — Same complexity as hook webhooks. Should be implemented together.
Option B: S — Covered by gap 05.
