# @ash-ai/dashboard

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
