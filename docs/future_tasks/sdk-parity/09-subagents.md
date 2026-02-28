# Gap 09: `agents` (Programmatic Subagents)

## Status: Done

## Problem

The Claude Agent SDK supports `agents` — programmatic subagent definitions that the main agent can delegate to. Each subagent has its own system prompt, tool restrictions, model, and MCP servers. Ash does not expose this.

Without this, users who want subagent behavior must define it entirely in the agent's CLAUDE.md or settings, with no per-session customization.

## SDK Reference

```typescript
// Claude Agent SDK Options
agents?: Record<string, AgentDefinition>;
agent?: string; // Which agent to use for the main thread

type AgentDefinition = {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  maxTurns?: number;
};
```

## Current State

Not exposed at any layer.

## Approach

Passthrough. Settable **per-session** — subagent definitions are a property of the deployment context.

The `agents` option is a JSON object with string keys and `AgentDefinition` values. Pass it through as-is to the SDK. Use a loose type in Ash (the SDK validates the structure).

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `agents?: Record<string, unknown>` and `agent?: string` to `CreateSessionRequest`
2. **`packages/shared/src/protocol.ts`** — Add both to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add both to `QueryOptions`, pass to SDK `options.agents` and `options.agent`
4. **`packages/server/src/routes/sessions.ts`** — Add to session-create body schema, store on session, wire to every `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add both to `createSession()` opts

## Design Note

Agent definitions can reference MCP servers by name (from the parent's `mcpServers` config). Since Ash already supports `mcpServers` on session creation, this should compose naturally — the user passes both `mcpServers` and `agents`, and the SDK resolves the references.

## Effort

M — Session-level passthrough with a complex nested object. The main complexity is ensuring the subagent definitions are persisted on the session and injected into every query.
