# Sandbox Overlays / Templates

## Status: Proposed

## Inspiration

ComputeSDK's overlay system (https://www.computesdk.com/docs/concepts/overlays/) lets you bootstrap sandboxes from pre-configured templates. Their "smart" strategy uses symlinks for immutable directories like `node_modules`, making sandbox creation near-instant even for large projects.

## Problem

Ash sandbox startup is slow when agents need dependencies:

1. **Cold-path resume** creates a new sandbox and restores workspace state. If the agent's workspace has a `package.json`, dependencies must be reinstalled.
2. **New sessions** for agents that need tools (MCP servers, npm packages) require setup time before the first message.
3. **No shared state** between sandboxes for the same agent. If 10 sessions use the same agent, each gets its own copy of `node_modules`.

This is the same problem ComputeSDK solves with overlays.

## Proposed Solution: Agent Templates

An agent template is a pre-built, read-only snapshot of an agent's base environment. When creating a new sandbox, Ash copies (or links) the template into the sandbox workspace instead of building from scratch.

### Template Lifecycle

```
ash deploy ./my-agent --name my-agent
  ↓
1. Copy agent files to registry
2. If agent has setup commands (package.json, .mcp.json), run them once
3. Snapshot the result as a template
  ↓
Template stored at: data/templates/my-agent/v1/
  ├── node_modules/     (immutable, shared via reflink/symlink)
  ├── .mcp/             (pre-configured MCP servers)
  └── ...
```

### Sandbox Creation with Template

```
POST /api/sessions (agent: "my-agent")
  ↓
1. Create sandbox workspace directory
2. Copy-on-write (or symlink) template into workspace
3. Start bridge immediately -- no npm install, no MCP setup
  ↓
First message latency: seconds → milliseconds
```

### Copy Strategies

| Strategy | Mechanism | Speed | Isolation | Use Case |
|----------|-----------|-------|-----------|----------|
| **Full copy** | `cp -r` | Slow (~seconds for large dirs) | Full | Fallback, always correct |
| **Reflink** | `cp --reflink=auto` (BTRFS, XFS, APFS) | Near-instant | Full (copy-on-write at filesystem level) | Linux with modern FS, macOS |
| **Symlink immutable** | Symlink `node_modules`, copy the rest | Fast | Shared read, isolated write | Default for known-immutable dirs |

The recommended default: **reflink** where supported (macOS APFS, Linux BTRFS/XFS), falling back to **symlink immutable** for `node_modules`, falling back to **full copy**.

### Agent Config Extension

```yaml
# In CLAUDE.md frontmatter or a new agent.yaml
setup:
  install: "npm install"
  # Directories that are safe to share read-only across sandboxes
  immutable:
    - node_modules
    - .mcp
```

Or auto-detect: if `package.json` exists, run `npm install` and mark `node_modules` as immutable.

## What Changes

| Component | Change |
|-----------|--------|
| `@ash-ai/sandbox` | Add `TemplateManager` -- build, store, apply templates |
| `@ash-ai/sandbox` | `SandboxManager.create()` accepts optional `templateId` |
| `@ash-ai/server` | On `deployAgent`, trigger template build if setup commands detected |
| `@ash-ai/server` | On `createSession`, apply template before starting bridge |
| `@ash-ai/cli` | `ash deploy` shows template build progress |

## What Does NOT Change

- Agent definition format (CLAUDE.md is still the only required file)
- REST API for sessions and messages
- Bridge protocol
- Sandbox isolation (template is copied into the sandbox, not mounted read-write)

## Open Questions

1. **Template invalidation.** When does a template become stale? On `ash deploy` (rebuild)? On dependency update? Manual `ash template rebuild my-agent`?
2. **Template storage size.** `node_modules` can be 500MB+. With reflinks this is free. With full copies, templates multiply disk usage. Need to track and expose storage metrics.
3. **MCP server pre-configuration.** Can MCP servers be started once in the template and shared? Probably not (they have process state). But their installation can be templated.
4. **Multi-machine.** How do templates distribute to runner nodes? Push on deploy? Pull on first use? Shared filesystem?

## Expected Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| New session (agent with node_modules) | 30-60s | 1-3s |
| Cold-path resume | 10-30s | 1-3s |
| Disk per sandbox (shared agent) | Full copy each | Shared base + delta |

## When to Build This

After sandbox startup time is measured and confirmed as a bottleneck in real usage. The instrumentation from step 06 (hot-path timing) provides the numbers. If sandbox creation is <5s without templates, this is premature optimization.

Per principle #4: measure before and after. Per principle #1: don't optimize what you haven't measured.
