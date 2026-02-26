---
sidebar_position: 5
title: Configuration Reference
---

# Configuration Reference

All Ash configuration is done via environment variables. There are no config files. This page documents every variable the server and runner recognize.

## Server Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_PORT` | `4100` | Port the HTTP server listens on. |
| `ASH_HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` to restrict to localhost. |
| `ASH_DATA_DIR` | `./data` (native) or `/data` (Docker) | Root directory for all persistent state: SQLite database, agent definitions, session workspaces, sandbox working directories. |
| `ASH_MODE` | `standalone` | Server mode. `standalone` runs sandboxes locally. `coordinator` runs as a pure control plane with no local sandbox pool -- runners must register to provide capacity. See [Multi-Machine Setup](./multi-machine.md). |
| `ASH_DATABASE_URL` | (none) | PostgreSQL or CockroachDB connection string. When set, the server uses Postgres instead of SQLite. Format: `postgresql://user:password@host:port/dbname`. |
| `ASH_MAX_SANDBOXES` | `1000` | Maximum number of sandbox entries (live + cold) tracked in the database. When this limit is reached, the pool evicts the least-recently-used sandbox. |
| `ASH_IDLE_TIMEOUT_MS` | `1800000` (30 min) | How long a sandbox can sit idle (in the `waiting` state) before the idle sweep evicts it. Evicted sandboxes have their workspace persisted and are marked `cold`. |
| `ASH_API_KEY` | (auto-generated) | Single-tenant API key for authentication. All API requests (except `/health` and `/docs`) must include `Authorization: Bearer <key>`. If not set, the server auto-generates a key on first start and writes it to `{ASH_DATA_DIR}/initial-api-key`. |
| `ASH_SNAPSHOT_URL` | (none) | Cloud storage URL for session workspace snapshots. Enables cross-machine session resume. Format: `s3://bucket/prefix/` or `gs://bucket/prefix/`. Requires the appropriate SDK installed (`@aws-sdk/client-s3` for S3, `@google-cloud/storage` for GCS). |
| `ASH_BRIDGE_ENTRY` | (auto-detected) | Absolute path to the bridge process entry point (`packages/bridge/dist/index.js`). Normally auto-detected from the monorepo layout. Override only for custom installations. |
| `ASH_DEBUG_TIMING` | `0` | Set to `1` to enable timing instrumentation on the hot path. Logs latency for sandbox creation, bridge connect, message round-trip, and SSE delivery. |
| `ANTHROPIC_API_KEY` | (none) | **Required.** Passed into sandbox processes via the environment allowlist. The Claude Agent SDK uses this to authenticate with the Anthropic API. |

## Runner Variables

These variables configure runner processes in [multi-machine mode](./multi-machine.md).

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_RUNNER_ID` | `runner-<PID>` | Unique identifier for this runner. Must be stable across restarts for re-registration to work correctly. |
| `ASH_RUNNER_PORT` | `4200` | Port the runner's HTTP server listens on. |
| `ASH_RUNNER_HOST` | `0.0.0.0` | Bind address for the runner. |
| `ASH_SERVER_URL` | (none) | URL of the coordinator server (e.g., `http://coordinator:4100`). When set, the runner registers itself with the coordinator and begins sending heartbeats. |
| `ASH_RUNNER_ADVERTISE_HOST` | (same as `ASH_RUNNER_HOST`) | The hostname or IP the coordinator should use to reach this runner. Useful when the runner binds to `0.0.0.0` but needs to advertise a specific IP or hostname to the coordinator. |

Runner processes also read `ASH_DATA_DIR`, `ASH_MAX_SANDBOXES`, `ASH_IDLE_TIMEOUT_MS`, `ASH_BRIDGE_ENTRY`, and `ANTHROPIC_API_KEY` with the same semantics as the server.

## Database

### SQLite (Default)

SQLite is the default database. It requires zero configuration. The database file is created at `<ASH_DATA_DIR>/ash.db` on first startup.

SQLite is configured with:
- **WAL mode** for concurrent reads during writes.
- **Foreign keys enabled** for referential integrity.
- **Automatic migrations** on startup -- schema changes are applied idempotently.

SQLite is the right choice for single-machine deployments. It handles hundreds of concurrent sessions without issue.

### PostgreSQL / CockroachDB

Set `ASH_DATABASE_URL` to use Postgres or CockroachDB:

```bash
# PostgreSQL
export ASH_DATABASE_URL="postgresql://ash:password@localhost:5432/ash"

# CockroachDB
export ASH_DATABASE_URL="postgresql://ash:password@localhost:26257/ash?sslmode=disable"
```

The server auto-detects the database type from the connection string prefix (`postgresql://` or `postgres://`).

**Connection retry behavior:** On startup, the server attempts to connect to the database with exponential backoff. It retries up to 5 times with delays of 1s, 2s, 4s, 8s, and 16s (total ~31 seconds). If all attempts fail, the server exits with an error. This is designed for Docker Compose deployments where the database container may start slightly after the server.

**Schema migrations** are applied automatically on startup, just like SQLite. Tables and indexes are created with `IF NOT EXISTS` / `IF NOT EXISTS` semantics.

Use Postgres or CockroachDB when:
- You need the database to be on a separate machine from the server.
- You are running in coordinator mode with multiple runners and want a shared database.
- You want to use your existing database infrastructure for backups, monitoring, and replication.

## Authentication

Ash supports two authentication modes:

### Auto-Generated Key (Default)

When `ASH_API_KEY` is not set, the server auto-generates a secure API key on first start. The key is stored (hashed) in the database and the plaintext is written to `{ASH_DATA_DIR}/initial-api-key`. The CLI automatically picks up this key via `ash start`.

### Explicit API Key

Set `ASH_API_KEY` to use a specific key instead of auto-generating:

```bash
export ASH_API_KEY=my-secret-key
```

All API requests must then include:

```
Authorization: Bearer my-secret-key
```

For multi-tenant authentication, create API keys via the database. Each key is associated with a `tenant_id`, and requests authenticated with that key are scoped to that tenant's agents, sessions, and data.

### Public Endpoints

The following endpoints never require authentication:
- `GET /health`
- `/docs` (Swagger UI)
- `/api/internal/*` (runner registration and heartbeats)

## Environment Variable Summary

Here is every variable in one table for quick reference:

| Variable | Default | Component |
|----------|---------|-----------|
| `ANTHROPIC_API_KEY` | -- | Server, Runner |
| `ASH_PORT` | `4100` | Server |
| `ASH_HOST` | `0.0.0.0` | Server |
| `ASH_DATA_DIR` | `./data` | Server, Runner |
| `ASH_MODE` | `standalone` | Server |
| `ASH_DATABASE_URL` | (SQLite) | Server |
| `ASH_MAX_SANDBOXES` | `1000` | Server, Runner |
| `ASH_IDLE_TIMEOUT_MS` | `1800000` | Server, Runner |
| `ASH_API_KEY` | (auto-generated) | Server |
| `ASH_SNAPSHOT_URL` | (none) | Server, Runner |
| `ASH_BRIDGE_ENTRY` | (auto) | Server, Runner |
| `ASH_DEBUG_TIMING` | `0` | Server, Runner |
| `ASH_RUNNER_ID` | `runner-<PID>` | Runner |
| `ASH_RUNNER_PORT` | `4200` | Runner |
| `ASH_RUNNER_HOST` | `0.0.0.0` | Runner |
| `ASH_SERVER_URL` | (none) | Runner |
| `ASH_RUNNER_ADVERTISE_HOST` | (bind host) | Runner |
