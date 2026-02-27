# Memory System as MCP Server

## Status: Proposed

## Problem

Some teams have memory/context systems that persist state across agent sessions — structured note-taking, conversation summaries, knowledge bases. These are currently implemented as in-process modules within custom SDK wrappers. Moving to Ash means these modules need a new home.

## Approach: MCP Server in Agent Definition

The Claude Code SDK natively supports MCP servers declared in `.mcp.json`. A memory system can run as a stdio MCP server inside the sandbox, with files persisted to the workspace directory. Ash's existing state persistence handles durability.

### Agent Definition

```
my-agent/
├── CLAUDE.md
├── .mcp.json          ← declares memory MCP server
├── .claude/
│   └── settings.json
└── tools/
    └── memory-server.js   ← stdio MCP server
```

### .mcp.json

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["tools/memory-server.js"]
    }
  }
}
```

### How It Works

1. Agent definition includes the memory MCP server code and declares it in `.mcp.json`
2. On sandbox creation, Ash copies the agent dir to the workspace (including the server code)
3. The Claude Code CLI reads `.mcp.json` and spawns the memory server as a stdio subprocess
4. Memory files are written to the workspace directory (e.g., `workspace/.memory/`)
5. On session pause, Ash persists the workspace to the snapshot directory
6. On session resume, the workspace (including memory files) is restored

### Memory Tools (Example)

The MCP server exposes tools like:

| Tool | Description |
|------|-------------|
| `memory_view` | View current memory contents |
| `memory_create` | Create a new memory entry |
| `memory_update` | Update an existing entry |
| `memory_delete` | Delete an entry |
| `memory_search` | Search memories by keyword |

### Storage Backend

**Option A: Filesystem (simplest)**
Memory stored as files in the workspace. Persisted automatically by Ash's snapshot system. Works today with zero Ash changes.

**Option B: Database-backed**
Memory stored in Postgres/SQLite via an HTTP MCP server running outside the sandbox. More durable but requires:
- An external MCP server deployment
- Per-session MCP URL passed via `mcpServers` in session creation
- The sidecar MCP pattern (see `ash-sidecar-mcp-integration.md`)

## What Changes in Ash

Nothing. This uses existing features:
- `.mcp.json` support (already works)
- `settingSources: ['project']` in bridge (already configured)
- Workspace persistence (already implemented)
- Per-session MCP overrides via `mcpServers` in session creation (already supported)

## Effort

**Option A**: Zero Ash code changes. Teams package their memory server code in the agent definition.
**Option B**: Zero Ash code changes. Teams deploy an external MCP server and pass URLs per-session.
