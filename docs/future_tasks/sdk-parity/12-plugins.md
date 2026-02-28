# Gap 12: `plugins`

## Status: Done (Option A — works today via agent .claude/settings.json plugins config)

## Problem

The Claude Agent SDK supports `plugins` — local plugin directories that extend the SDK with custom tools, hooks, and behaviors. Ash does not expose this.

## SDK Reference

```typescript
// Claude Agent SDK Options
plugins?: SdkPluginConfig[];

type SdkPluginConfig = {
  type: 'local';
  path: string;  // Absolute or relative path to plugin directory
};
```

## Current State

Not exposed at any layer.

## Approach

Plugins are local filesystem paths. In Ash's architecture, "local" means inside the sandbox workspace. This maps naturally to agent definitions — plugin code can be included in the agent directory and referenced by relative path.

### Option A: Agent-Bundled Plugins (No Ash Changes)

Users include plugin directories in their agent definition:

```
my-agent/
├── CLAUDE.md
├── .claude/settings.json
└── plugins/
    └── my-plugin/
        └── index.js
```

The agent's `.claude/settings.json` (or a session-level override) references the plugin:

```json
{
  "plugins": [
    { "type": "local", "path": "./plugins/my-plugin" }
  ]
}
```

Since Ash copies the agent dir to the workspace and loads `settingSources: ['project']`, the SDK should pick up the plugin config automatically.

### Option B: Per-Session Plugin Config

Add `plugins` to `CreateSessionRequest` for session-level plugin configuration. The server writes the plugin config to `.claude/settings.json` in the workspace.

## Recommendation

Try **Option A** first. If the SDK loads plugins from `.claude/settings.json` when `settingSources: ['project']` is set, this works today with zero Ash changes.

## Files to Change (Option A)

None. Documentation only.

## Files to Change (Option B)

1. **`packages/shared/src/types.ts`** — Add `plugins?` to `CreateSessionRequest`
2. **`packages/sandbox/src/manager.ts`** — Write plugin config to workspace `.claude/settings.json`
3. **`packages/sdk/src/client.ts`** — Add `plugins?` to `createSession()` opts

## Open Question

Does the SDK load `plugins` from `.claude/settings.json`, or only from programmatic `options.plugins`? If only programmatic, Option A won't work and we need to pass it through the bridge (which means adding it to `QueryCommand` and `QueryOptions`).

## Effort

Option A: Zero — if settings-based plugin loading works.
Option B: S — Standard passthrough.
