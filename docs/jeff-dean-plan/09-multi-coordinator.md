# 09: Multi-Coordinator With CRDB

## Status: Implemented

The runner registry is DB-backed. Coordinators are stateless. All routing decisions come from the database. Deploying multiple coordinators behind a load balancer requires zero code changes — just ops.

## When To Deploy This

When:

1. You have measured (step 06) that the single coordinator is the bottleneck
2. That bottleneck is HTTP connection handling or SSE proxy fan-out, not runner capacity
3. You're already running CRDB in production (`ASH_DATABASE_URL`)

If a single coordinator is keeping up with your runner fleet, you don't need this yet.

## The Problem

Step 08 scales the data plane (runners) horizontally. But the control plane is still a single `ash-server` process. That process:

1. Accepts all client HTTP requests
2. Proxies all SSE streams (one long-lived connection per active session)
3. Manages runner registration and heartbeats
4. Reads/writes session state

For most deployments, a single coordinator handles thousands of concurrent SSE connections fine — Fastify + Node.js is good at holding open connections. But at sufficient scale, either:

- The SSE proxy fan-out saturates the coordinator's network/CPU
- You want redundancy (single coordinator is a SPOF)

## Architecture

### Single Coordinator (step 08)

```
Client → ash-server (single coordinator) → Runner 1..N
                    ↕
                   CRDB
```

### Multi-Coordinator (step 09)

```
         ┌─→ ash-server-1 ──→ Runner 1..N
LB ──────┼─→ ash-server-2 ──→ Runner 1..N
         └─→ ash-server-M ──→ Runner 1..N
                    ↕
                   CRDB
```

Every coordinator can talk to every runner. CRDB is the shared source of truth.

## What Was Built

### 1. Runner registry in the database

The `runners` table stores all registered runners:

```sql
CREATE TABLE runners (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  max_sandboxes INTEGER NOT NULL DEFAULT 100,
  active_count INTEGER NOT NULL DEFAULT 0,
  warming_count INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at TEXT NOT NULL,
  registered_at TEXT NOT NULL
);
CREATE INDEX idx_runners_heartbeat ON runners (last_heartbeat_at);
```

Runner registration (`POST /api/internal/runners/register`) upserts to this table. Heartbeats update `active_count`, `warming_count`, and `last_heartbeat_at`. Any coordinator reads the same table.

### 2. DB-backed coordinator selection

`RunnerCoordinator.selectBackend()` queries CRDB for the healthiest runner:

```sql
SELECT * FROM runners
WHERE last_heartbeat_at > :cutoff
ORDER BY (max_sandboxes - active_count - warming_count) DESC
LIMIT 1;
```

One query per session creation. Not a hot path.

### 3. Async backend discovery

`getBackendForRunnerAsync()` looks up runners from the DB when they're not in the local connection cache. This handles the case where coordinator B receives a request for a session created on coordinator A — B discovers the runner from the shared DB and creates a `RemoteRunnerBackend` on the fly.

The local `Map<string, RemoteRunnerBackend>` is a connection cache only — not the source of truth.

### 4. Idempotent liveness sweep

All coordinators run the same 30-second liveness sweep independently. The operations (mark sessions paused, delete dead runner) are idempotent. No leader election needed.

### 5. SSE reconnection handles coordinator failover

When a coordinator dies:
1. Client gets a connection error
2. Client reconnects (standard SSE reconnection)
3. Load balancer routes to a different coordinator
4. New coordinator reads session state from CRDB, finds the runner, re-establishes the proxy

No session migration needed. The runner is still running the sandbox. Only the SSE proxy hop changes.

## Key Files

| File | What |
|------|------|
| `packages/server/src/runner/coordinator.ts` | DB-backed `RunnerCoordinator` |
| `packages/server/src/db/schema.sqlite.ts` | `runners` table (SQLite) |
| `packages/server/src/db/schema.pg.ts` | `runners` table (Postgres/CRDB) |
| `packages/server/src/db/drizzle-db.ts` | Runner CRUD methods |
| `packages/server/src/routes/runners.ts` | Registration/heartbeat/list endpoints |
| `packages/server/src/routes/sessions.ts` | All routes use `getBackendForRunnerAsync()` |
| `packages/server/src/__tests__/coordinator.test.ts` | 11 tests including multi-coordinator consistency |

## Load Balancer Configuration

Any L4/L7 load balancer works.

```nginx
upstream ash_coordinators {
    server coordinator-1:4100;
    server coordinator-2:4100;
    server coordinator-3:4100;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://ash_coordinators;
        proxy_http_version 1.1;
        proxy_set_header Connection '';  # SSE needs this
        proxy_buffering off;            # SSE needs this
        proxy_read_timeout 86400s;      # Long-lived SSE
    }
}
```

Requirements:
- Health check: `GET /health` on each coordinator
- Sticky sessions: Not required
- Protocol: HTTP/1.1 is fine

## What Doesn't Change

- **Runner protocol** — runners don't know how many coordinators exist. They register with one URL (the LB) and send heartbeats there.
- **Client SDK** — clients connect to one URL (the LB). SSE reconnection handles failover.
- **Session routing** — `session.runner_id` in CRDB tells any coordinator where to route.
- **Runner backends** — `RemoteRunnerBackend` is stateless HTTP calls to runners.

## Capacity Estimate

Per coordinator (c5.xlarge, 4 vCPU, 8GB RAM):

| Concern | Limit | Notes |
|---------|-------|-------|
| Concurrent SSE connections | ~10,000 | Node.js event loop, mostly idle I/O |
| HTTP requests/sec | ~5,000 | Session CRUD, not on the hot path |
| CRDB queries/sec | ~1,000 | Mostly reads, well within single-node CRDB |

Three coordinators behind a load balancer handles ~30,000 concurrent SSE streams. You'll run out of runner capacity long before coordinator capacity.

## Non-Goals

- **Coordinator-to-coordinator communication.** They don't talk to each other. CRDB is the shared state.
- **Session migration between coordinators.** SSE reconnection handles this transparently.
- **Coordinator leader election.** Not needed. All operations are idempotent.
- **gRPC between coordinators and runners.** HTTP + SSE is enough (see `docs/decisions/0002-http-over-grpc-for-runner.md`).
