# @ash-ai/server

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
