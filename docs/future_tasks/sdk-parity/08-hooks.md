# Gap 08: `hooks`

## Status: Done (Option A — works today via agent .claude/settings.json hooks)

## Problem

The Claude Agent SDK supports `hooks` — callbacks that fire on events like `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, etc. Hooks can modify tool inputs, block tool execution, inject context, and control flow. Ash does not expose this.

Hooks are the SDK's primary extensibility mechanism. Without them, Ash users cannot:
- Audit/log tool usage in real-time
- Block dangerous operations (e.g., deny `rm -rf /`)
- Inject additional context before tool execution
- Implement custom approval workflows

## SDK Reference

```typescript
// Claude Agent SDK Options
hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

type HookEvent =
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'Notification' | 'UserPromptSubmit' | 'SessionStart' | 'SessionEnd'
  | 'Stop' | 'SubagentStart' | 'SubagentStop' | 'PreCompact'
  | 'PermissionRequest' | 'Setup' | 'TeammateIdle' | 'TaskCompleted'
  | 'ConfigChange' | 'WorktreeCreate' | 'WorktreeRemove';
```

Hooks are JavaScript callbacks that run in-process with the SDK. They cannot be serialized over the wire.

## Current State

Not exposed at any layer. Hooks are fundamentally callbacks — they run in the same process as `query()`. Ash's architecture puts the SDK call inside a sandboxed bridge process, separated from the server by a Unix socket.

## Approach

This is the hardest gap to close because hooks are in-process callbacks, not serializable config. Three possible approaches:

### Option A: Agent-Defined Hook Scripts (Simplest)

Hooks defined as shell commands in the agent's `.claude/settings.json` (the SDK already supports this format for file-based hooks). No Ash changes needed — just document that agents can use the SDK's native settings-based hook system.

```json
// .claude/settings.json in agent dir
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": ["./hooks/audit-bash.sh"] }
    ]
  }
}
```

This works today since Ash loads `settingSources: ['project']`.

### Option B: Webhook-Based Hooks (Medium)

Ash defines a webhook protocol: hook events are POSTed to a user-provided URL, and the response controls the hook outcome. This is the natural fit for Ash's architecture (server ↔ bridge boundary).

New fields on `CreateSessionRequest`:
```typescript
hookWebhookUrl?: string;   // URL to POST hook events to
hookEvents?: HookEvent[];  // Which events to send (default: all)
```

The bridge would register SDK hooks that serialize the event, send it over the socket to the server, which POSTs to the webhook URL, waits for the response, and sends the result back to the bridge.

### Option C: Per-Session Hook Config via MCP (Creative)

Hook logic runs as an MCP tool. The agent's CLAUDE.md instructs the agent to call the hook tool at appropriate times. Not a true hook (agent can choose to skip it), but pragmatic for many use cases.

## Recommendation

Start with **Option A** (agent-defined hooks via settings.json) since it works today. Document it. Implement **Option B** (webhooks) later if there's demand for server-side hook control.

## Files to Change (Option A)

None. Just documentation.

## Files to Change (Option B)

1. **`packages/shared/src/types.ts`** — Add `hookWebhookUrl?` and `hookEvents?` to `CreateSessionRequest`
2. **`packages/shared/src/protocol.ts`** — New `HookRequestEvent` (bridge → server) and `HookResponseCommand` (server → bridge)
3. **`packages/bridge/src/sdk.ts`** — Register SDK hooks that send events over the socket and wait for responses
4. **`packages/bridge/src/handler.ts`** — Handle `HookResponseCommand` from server
5. **`packages/server/src/routes/sessions.ts`** — Accept hook config on session create, POST events to webhook URL
6. **`packages/sandbox/src/bridge-client.ts`** — Handle bidirectional hook communication

## Effort

Option A: Zero — documentation only.
Option B: L — Bidirectional bridge protocol extension, webhook infrastructure, timeout handling.
