---
"@ash-ai/shared": minor
"@ash-ai/sandbox": minor
"@ash-ai/server": minor
"@ash-ai/dashboard": minor
---

Add MCP connection visibility, tool call tracing, and session diagnostics.

- `@ash-ai/shared` — Add `mcp_status` session event type; add `mcpServers` to `SessionConfig` so MCP configuration is persisted on the session record
- `@ash-ai/server` — Store `mcpServers` in session config at creation (exposed via `GET /api/sessions/:id`); emit `mcp_status` events when MCP servers are configured; propagate bridge stderr MCP errors as `mcp_status` error events
- `@ash-ai/sandbox` — Add `onStderrError` callback to `CreateSandboxOpts` that fires on MCP-related stderr patterns (connection refused, DisallowedHost, etc.)
- `@ash-ai/dashboard` — Add MCP status badge to session detail header showing server count or error state; add `mcp_status` event color (cyan) to events timeline; improve event summaries for MCP events
