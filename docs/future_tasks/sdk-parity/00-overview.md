# SDK Parity: Overview

## Status: Done

## Context

Ash wraps the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). The SDK exposes ~40 options on `query()`. Ash currently passes through ~8 of them. This folder documents each gap and what it takes to close it.

Reference: https://platform.claude.com/docs/en/agent-sdk/typescript

## Current Passthrough (What Works Today)

These SDK options flow end-to-end from Ash client to Claude Agent SDK:

| SDK Option | Ash Layer | How |
|------------|-----------|-----|
| `model` | Session create + message send | `QueryCommand.model` → `options.model` |
| `systemPrompt` | Session create | Written to workspace CLAUDE.md |
| `permissionMode` | Session create | `ASH_PERMISSION_MODE` env → `options.permissionMode` |
| `mcpServers` | Session create | Merged into workspace `.mcp.json` |
| `resume` | Bridge | `options.resume` from session state |
| `persistSession` | Bridge | Hardcoded `true` |
| `settingSources` | Bridge | Hardcoded `['project']` |
| `includePartialMessages` | Message send | `QueryCommand.includePartialMessages` → `options.includePartialMessages` |
| `cwd` | Bridge | Set to workspace dir |
| `abortController` | Bridge | Bridge signal → AbortController |
| `pathToClaudeCodeExecutable` | Bridge | `CLAUDE_CODE_EXECUTABLE` env |

## Gaps (What's Missing)

Each gap has its own doc with problem, approach, files to touch, and effort estimate.

### Tier 1: Simple Passthrough (add field, wire it through)

| # | Gap | Effort | Doc |
|---|-----|--------|-----|
| 01 | `maxTurns` | S | [01-max-turns.md](./01-max-turns.md) |
| 02 | `maxBudgetUsd` | S | [02-max-budget.md](./02-max-budget.md) |
| 03 | `effort` | S | [03-effort.md](./03-effort.md) |
| 04 | `thinking` | S | [04-thinking.md](./04-thinking.md) |
| 05 | `allowedTools` / `disallowedTools` | S | [05-tool-restrictions.md](./05-tool-restrictions.md) |
| 06 | `betas` | S | [06-betas.md](./06-betas.md) |

### Tier 2: Moderate (new protocol commands or API changes)

| # | Gap | Effort | Doc |
|---|-----|--------|-----|
| 07 | `outputFormat` (structured outputs) | M | [07-structured-outputs.md](./07-structured-outputs.md) |
| 08 | `hooks` | M | [08-hooks.md](./08-hooks.md) |
| 09 | `agents` (programmatic subagents) | M | [09-subagents.md](./09-subagents.md) |
| 10 | Mid-session control (`setModel`, `setPermissionMode`) | M | [10-mid-session-control.md](./10-mid-session-control.md) |

### Tier 3: Larger or Ash-specific (needs design decisions)

| # | Gap | Effort | Doc |
|---|-----|--------|-----|
| 11 | `canUseTool` (custom permission callback) | L | [11-custom-permissions.md](./11-custom-permissions.md) |
| 12 | `plugins` | L | [12-plugins.md](./12-plugins.md) |
| 13 | `sandbox` (SDK sandbox settings) | N/A | [13-sdk-sandbox.md](./13-sdk-sandbox.md) |

## Effort Key

- **S** = Small. Add a field to types, wire through protocol, pass to SDK. <1 hour.
- **M** = Medium. New protocol commands, API schema changes, or non-trivial bridge logic. Half day.
- **L** = Large. Needs design, new infrastructure, or fundamentally different from passthrough. 1+ days.
- **N/A** = Not applicable or intentionally not supported.

## Implementation Pattern

All Tier 1 gaps follow the same pattern. An agent implementing these should:

1. Add field to `CreateSessionRequest` or `SendMessageRequest` in `packages/shared/src/types.ts`
2. Add field to `QueryCommand` in `packages/shared/src/protocol.ts`
3. Add field to `QueryOptions` in `packages/bridge/src/sdk.ts`
4. Pass field to SDK `options` in `runRealQuery()` in `packages/bridge/src/sdk.ts`
5. Add field to server route schema in `packages/server/src/routes/sessions.ts`
6. Wire field from request body → `QueryCommand` in the message send handler
7. Expose field in `SendMessageOptions` or `createSession` opts in `packages/sdk/src/client.ts`
8. Update mock in `runMockQuery()` if the option changes observable behavior
