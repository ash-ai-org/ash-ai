# @ash-ai/server

## 0.0.23

### Patch Changes

- 92d113c: Return 422 instead of 500 when agent directory is missing from disk during session creation.

  - `@ash-ai/server` — Validate agent directory exists before attempting sandbox creation in POST /api/sessions, POST /api/sessions/:id/resume, and POST /api/sessions/:id/fork. Returns a clear 422 error with re-deploy instructions instead of an opaque 500 ENOENT.

## 0.0.22 - 2026-03-02

### Changed

- Updated dependencies: @ash-ai/sandbox@0.0.20

## 0.0.21 - 2026-03-02

### Added

- Auto-restore agent files from S3 when agent directory is missing (survives ECS redeploys). Applied to session create, resume, and fork handlers.
- Sync agent files to S3 on deploy (fire-and-forget).

### Changed

- Updated dependencies: @ash-ai/sandbox@0.0.19

## 0.0.18 - 2026-03-01

### Added

- `POST /api/internal/api-keys` endpoint for per-tenant API key provisioning (#48)
  - Enables the platform to lazily provision isolated API keys per tenant
  - Uses `ASH_INTERNAL_SECRET` bearer token auth (same pattern as runner routes)
  - Returns `{id, key, tenantId}` with a freshly generated key

## 0.0.17

### Patch Changes

- 6bedbc0: Regenerate OpenAPI spec with all SDK parity fields and add SSE streaming + high-level client to Python SDK.

  - `@ash-ai/server` — Regenerated `openapi.json` to include session creation fields (`model`, `systemPrompt`, `mcpServers`, `permissionMode`, `allowedTools`, `disallowedTools`, `betas`, `subagents`, `initialAgent`) and per-message options (`maxTurns`, `maxBudgetUsd`, `effort`, `thinking`, `outputFormat`)
  - `ash-ai-sdk` (Python) — Regenerated models from updated spec, added `AshClient` with `send_message_stream()` / `asend_message_stream()` for SSE streaming, added typed event classes (`MessageEvent`, `TextDeltaEvent`, `ToolUseEvent`, `ErrorEvent`, `DoneEvent`, etc.), updated `generate.sh` to preserve hand-written modules

## 0.0.16 - 2026-02-28

### Added

- Per-message SDK options on `POST /api/sessions/:id/messages`: `maxTurns`, `maxBudgetUsd`, `effort`, `thinking`, `outputFormat` (#41)
- Session-level SDK options on `POST /api/sessions`: `allowedTools`, `disallowedTools`, `betas`, `subagents`, `initialAgent` (#41)
- `PATCH /api/sessions/:id/config` endpoint for mid-session config updates (#41)
- Session config persisted as JSON column in DB, copied on fork (#41)
- DB migration for `config` column on sessions table (#41)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.16, @ash-ai/sandbox@0.0.15

## 0.0.15 - 2026-02-28

### Added

- `version` field in health endpoint response (#39)
- Server version included in `session_start` SSE event (#39)
- `version.ts` module that reads version from package.json (#39)

### Changed

- OpenAPI spec version now matches package version (#39)
- Startup log shows `Ash vX.Y.Z` instead of `Ash server` (#39)
- Updated dependencies: @ash-ai/shared@0.0.15, @ash-ai/sandbox@0.0.14

## 0.0.14 - 2026-02-27

### Added

- `permissionMode` parameter on session creation API for configurable SDK permission mode (#34)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.14, @ash-ai/sandbox@0.0.13

## 0.0.13 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.13, @ash-ai/sandbox@0.0.12

## 0.0.12 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.12, @ash-ai/sandbox@0.0.11

## 0.0.11 - 2026-02-26

### Added

- Forward `mcpServers` and `systemPrompt` from session creation to sandbox (#27)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.11, @ash-ai/sandbox@0.0.10

## 0.0.10 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.10, @ash-ai/sandbox@0.0.9

## 0.0.9 - 2026-02-25

### Added

- Auto-generate `ash_`-prefixed API key on first server start when no keys exist (#23)
- `generateApiKey()` helper in auth module (#23)
- Bootstrap file (`{dataDir}/initial-api-key`) for CLI key pickup (#23)

### Changed

- Auth is now required when DB has keys, even without `ASH_API_KEY` env — removes dev-mode fallback (#23)
- `registerAuth()` accepts `hasDbKeys` param to control auth enforcement (#23)
- Updated dependencies: @ash-ai/shared@0.0.9

## 0.0.8 - 2026-02-25

### Added

- `POST /api/sessions/:id/files` — batch write files to session workspace with base64 content, path traversal protection, and size limits (#19)
- `DELETE /api/sessions/:id/files/*` — delete a file from session workspace (#19)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.8

## 0.0.7 - 2026-02-24

### Added

- `includeHidden` query param on `GET /sessions/:id/files` — hidden dirs like `.claude` are now visible by default (#18)

### Changed

- Split file skip lists into ALWAYS_SKIP (node_modules, .git) and HIDDEN_SKIP (.cache, .npm, etc.)
- Updated dependencies: @ash-ai/shared@0.0.7, @ash-ai/sandbox@0.0.7

## 0.0.6 - 2026-02-24

### Added

- Agent CRUD routes: POST/GET/DELETE `/api/agents` with recursive file listing
- DB migration 0008: `credentials.salt` column for encryption KDF, `sessions.model` for per-session model override
- OpenAPI spec regenerated with all 39 endpoints

### Changed

- Updated dependencies: @ash-ai/shared@0.0.6, @ash-ai/sandbox@0.0.6

## 0.0.5 - 2026-02-23

### Added

- File operations API: list, read, and upload files for sessions
- Expanded file route with directory listing and content retrieval

### Changed

- Updated dependencies: @ash-ai/shared@0.0.5, @ash-ai/sandbox@0.0.5

## 0.0.4 - 2026-02-21

### Added

- Credential management: encrypted agent secrets with CRUD API
- Queue system: task queue with atomic claim, retry with exponential backoff
- Attachment system: file upload/download with sanitized filenames and RFC 5987 headers
- Usage tracking: per-session token and cost tracking with time-range filters
- Workspace bundles: snapshot and restore agent workspaces
- Structured message support for rich content types
- Multi-coordinator support for distributed server coordination
- Drizzle ORM migration from raw SQL (#10)
- Multi-runner integration tests and benchmarks

### Fixed

- Queue item claim race condition (atomic UPDATE WHERE)
- Usage extractor content path resolution
- Usage message double-counting (only record on `result` type)
- Coordinator hot path optimization for multi-runner

### Changed

- Database layer migrated to Drizzle ORM with generated migrations
- Updated dependencies: @ash-ai/shared@0.0.4, @ash-ai/sandbox@0.0.4

## 0.0.3 - 2026-02-20

### Added

- Message persistence: store and retrieve session messages via `GET /sessions/:id/messages` (#5)
- Session events timeline: track session lifecycle events (created, message sent/received, ended) (#5)
- `GET /sessions/:id/events` endpoint for session event history (#5)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.3, @ash-ai/sandbox@0.0.3

## 0.0.2 - 2026-02-19

### Added

- Multi-tenant API key authentication with hashed key lookup from database
- Tenant isolation on all routes: agents, sessions, sandboxes, and files scoped by `tenantId`
- `api_keys` table in SQLite and Postgres for storing tenant API keys
- `tenant_id` columns on agents, sessions, and sandboxes tables
- `dump-schema` script for exporting database schema
- Database schema reference file (`schema.sql`)

### Changed

- Auth hook resolves tenant identity from Bearer tokens, with backward compatibility for `ASH_API_KEY`
- Session and file access checks verify tenant ownership (returns 404 for cross-tenant access)
- Updated dependencies: @ash-ai/shared@0.0.2, @ash-ai/sandbox@0.0.2

## 0.0.1

### Patch Changes

- [#1](https://github.com/ash-ai-org/ash-ai/pull/1) [`f3c8524`](https://github.com/ash-ai-org/ash-ai/commit/f3c8524cc83d8dae27595fe62555fcb4891242a5) Thanks [@nicholaslocascio](https://github.com/nicholaslocascio)! - Initial public release of Ash — a self-hostable platform for deploying and orchestrating hosted AI agents.

  - `@ash-ai/server` — Fastify REST API + SSE streaming server for session routing, agent registry, and sandbox orchestration
  - `@ash-ai/cli` — CLI for deploying agents, managing sessions, and controlling Ash servers
  - `@ash-ai/sdk` — TypeScript client SDK for programmatic interaction with Ash servers
  - `@ash-ai/sandbox` — Sandbox management: process isolation, pooling, bridge client, resource limits, and state persistence
  - `@ash-ai/bridge` — Bridge process that runs inside each sandbox and connects to the Claude Agent SDK
  - `@ash-ai/runner` — Worker node for multi-machine deployments, manages sandboxes on remote hosts
  - `@ash-ai/shared` — Shared types, protocol definitions, and constants

- Updated dependencies [[`f3c8524`](https://github.com/ash-ai-org/ash-ai/commit/f3c8524cc83d8dae27595fe62555fcb4891242a5)]:
  - @ash-ai/shared@0.0.1
  - @ash-ai/sandbox@0.0.1
