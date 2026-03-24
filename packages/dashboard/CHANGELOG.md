# @ash-ai/dashboard

## 0.1.0

### Minor Changes

- daae6a1: Add MCP connection visibility, tool call tracing, and session diagnostics.

  - `@ash-ai/shared` — Add `mcp_status` session event type; add `mcpServers` to `SessionConfig` so MCP configuration is persisted on the session record
  - `@ash-ai/server` — Store `mcpServers` in session config at creation (exposed via `GET /api/sessions/:id`); emit `mcp_status` events when MCP servers are configured; propagate bridge stderr MCP errors as `mcp_status` error events
  - `@ash-ai/sandbox` — Add `onStderrError` callback to `CreateSandboxOpts` that fires on MCP-related stderr patterns (connection refused, DisallowedHost, etc.)
  - `@ash-ai/dashboard` — Add MCP status badge to session detail header showing server count or error state; add `mcp_status` event color (cyan) to events timeline; improve event summaries for MCP events

### Patch Changes

- Updated dependencies [daae6a1]
  - @ash-ai/shared@0.2.0
  - @ash-ai/sdk@0.1.2
  - @ash-ai/ui@1.0.2

## 0.0.8

### Patch Changes

- Updated dependencies [21c56d0]
  - @ash-ai/sdk@0.1.1
  - @ash-ai/ui@1.0.1

## 0.0.7

### Patch Changes

- Updated dependencies [d5093df]
  - @ash-ai/shared@0.1.0
  - @ash-ai/sdk@0.1.0
  - @ash-ai/ui@1.0.0

## 0.0.6

### Patch Changes

- 7f7eb05: Fix dashboard polling tight loop when viewing completed/paused sessions.

  - Remove `setLoadingData(true)` from subsequent fetches — only show loading shimmer on initial load, preventing re-render cascades
  - Add fetch-in-flight guard (`fetchingRef`) to prevent concurrent duplicate requests
  - Extract `sessionId`/`sessionStatus` as stable primitive values for `useCallback`/`useEffect` dependencies
  - Add `key={session.id}` to `SessionDetail` for clean state reset when switching sessions

## 0.0.5

### Patch Changes

- 66d5d6b: Show ASH_API_KEY environment variable in dashboard API Keys page.

  - `@ash-ai/server` — Include the `ASH_API_KEY` env var as a synthetic entry in `GET /api/api-keys` so the dashboard shows it exists
  - `@ash-ai/dashboard` — Display env var keys with an `env` badge, hide the delete button for them

## 0.0.4

### Patch Changes

- df89205: Fix empty user messages and add expandable raw JSON view in session detail.

  - Fix user messages appearing empty — user message content stored as `{type: "user", content: "..."}` was not being extracted
  - Add "Raw JSON" toggle to every message for debugging — shows the full JSON payload, system prompt, and metadata

## 0.0.3

### Patch Changes

- c5d1176: Fix dashboard UX issues: flickering, message rendering, favicon auth, telemetry warnings.

  - `@ash-ai/dashboard` — Cache last-known health, agents, and sessions in sessionStorage so the UI doesn't flash OFFLINE/"-" between navigations
  - `@ash-ai/dashboard` — Fix assistant message rendering: extract text from SDK result objects instead of showing raw JSON
  - `@ash-ai/server` — Exclude `/favicon.ico` from auth middleware (was returning 401)
  - `@ash-ai/server` — Suppress repeated telemetry POST warnings for the same HTTP status (e.g. 404 when Cloud endpoint isn't live yet)

## 0.0.2 - 2026-03-10

### Changed

- Package is now public (removed `private: true`) (#74)
- Added `files` field for npm publishing (#74)

## 0.0.1 - 2026-03-10

### Added

- Initial release: Next.js static-export admin dashboard (#72)
- Pages: sessions, agents, queue, logs, analytics, playground
- Settings: API key management, credential management (including Bedrock)
- Served by Ash server at `/dashboard/` via `@fastify/static`
