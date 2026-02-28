# Gap 10: Mid-Session Control

## Status: Done (Level 1 + Level 2)

## Problem

The Claude Agent SDK's `Query` object exposes methods for changing settings mid-session:
- `setModel(model)` — change the model
- `setPermissionMode(mode)` — change permission mode
- `setMaxThinkingTokens(tokens)` — change thinking budget (deprecated in favor of `thinking`)
- `setMcpServers(servers)` — dynamically replace MCP servers
- `toggleMcpServer(name, enabled)` — enable/disable an MCP server
- `reconnectMcpServer(name)` — reconnect a failed MCP server

Ash does not expose any of these. Once a session is created, its configuration is fixed (except `model` which can be overridden per-message).

## Current State

The bridge creates a new `query()` call for each message send. This means SDK session-level mutations (like `setModel()`) would not persist between messages anyway — they'd only affect the current query.

However, some of these (especially `setMcpServers`) would be useful as session-level mutations that Ash persists and applies to subsequent queries.

## Approach

Two levels of implementation:

### Level 1: Per-Message Overrides (Simple)

Already partially done with `model`. Extend to other per-message options:
- `model` ✅ (already supported)
- `effort` (see gap 03)
- `thinking` (see gap 04)
- `maxTurns` (see gap 01)
- `maxBudgetUsd` (see gap 02)

These are covered by the Tier 1 gaps. No additional work needed here.

### Level 2: Session Mutation API (New Endpoints)

New REST endpoints for mutating session configuration:

```
PATCH /api/sessions/:id/config
{
  "model": "claude-opus-4-6-20250805",
  "mcpServers": { ... },
  "allowedTools": ["Read", "Grep"],
  ...
}
```

The server updates the session record, and subsequent queries use the new config.

For MCP servers specifically, this requires updating the `.mcp.json` in the workspace. For a paused/cold session, the workspace might need to be restored first.

## Files to Change (Level 2)

1. **`packages/shared/src/types.ts`** — New `UpdateSessionConfigRequest` type
2. **`packages/server/src/routes/sessions.ts`** — New `PATCH /api/sessions/:id/config` endpoint
3. **`packages/server/src/routes/sessions.ts`** — Update session record in DB, update workspace files if needed
4. **`packages/sdk/src/client.ts`** — New `updateSessionConfig(id, config)` method

## Effort

Level 1: Covered by Tier 1 gaps (S each).
Level 2: M — New endpoint, DB update, workspace file mutation.
