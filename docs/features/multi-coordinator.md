# Multi-Coordinator (Horizontal Control Plane)

*Added: 2026-02-20 (Step 09)*

## What

Multiple `ash-server` coordinator processes can run behind a load balancer, sharing state through a database (Postgres or CockroachDB). Any coordinator can route to any runner. There is no leader election, no coordinator-to-coordinator communication, and no session migration logic.

## When You Need This

- Your single coordinator is saturating its SSE connection capacity (~10,000 concurrent)
- You need redundancy (single coordinator is a SPOF)
- You're already running Postgres/CRDB in production

If a single coordinator handles your load, you don't need this yet.

## Architecture

### Before (Single Coordinator)

```
Client -> ash-server (single coordinator) -> Runner 1..N
                    |
                   DB
```

### After (Multi-Coordinator)

```
         +-> ash-server-1 --> Runner 1..N
LB ------+-> ash-server-2 --> Runner 1..N
         +-> ash-server-M --> Runner 1..N
                    |
                   DB (Postgres/CRDB)
```

## How It Works

### Runner Registry in the Database

Runners are stored in a `runners` table:

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
```

When a runner registers (via `POST /api/internal/runners/register`), the coordinator writes to this table using an upsert. Any coordinator can read the same table to discover all healthy runners.

### Session Routing

Sessions track their assigned runner:

```sql
-- sessions table includes:
runner_id TEXT  -- NULL for local, runner ID for remote
-- Indexed for efficient lookups
CREATE INDEX idx_sessions_runner ON sessions (runner_id);
```

Any coordinator can route messages to the correct runner by looking up the session's `runner_id` in the DB, then creating a `RemoteRunnerBackend` HTTP client to that runner.

### Runner Selection

When creating a new session, the coordinator selects the runner with the most available capacity:

```sql
SELECT id, host, port, max_sandboxes, active_count, warming_count
FROM runners
WHERE last_heartbeat_at > NOW() - INTERVAL '30 seconds'
ORDER BY (max_sandboxes - active_count - warming_count) DESC
LIMIT 1;
```

This is one query per session creation — not a hot path.

### Liveness Sweep

All coordinators run the same liveness sweep on a 30-second interval. It's idempotent:
1. Query all runners from DB
2. For any runner with `last_heartbeat_at` older than the liveness timeout (30s)
3. Mark all its active sessions as `paused`
4. Delete the runner from the DB

Multiple coordinators running the same sweep is harmless — the operations are idempotent. No leader election needed.

### SSE Reconnection

When a client's SSE connection drops (because its coordinator died), standard SSE reconnection kicks in:
1. Client reconnects through the load balancer
2. Load balancer routes to a different (healthy) coordinator
3. New coordinator looks up the session in DB, finds the runner
4. Creates a new `RemoteRunnerBackend` connection to that runner
5. SSE stream resumes

No session migration needed. The runner is still running the sandbox. Only the SSE proxy hop changes.

## What Doesn't Change

- **Runner protocol**: Runners don't know how many coordinators exist. They register with one URL (the LB) and send heartbeats there.
- **Client SDK**: Clients connect to one URL (the LB). SSE reconnection handles failover.
- **Session routing**: `session.runner_id` in DB tells any coordinator where to route.
- **Local backend cache**: Each coordinator maintains a local `Map<string, RemoteRunnerBackend>` as a connection cache. These are lazily created from DB records.

## Load Balancer Configuration

Any L4/L7 load balancer works:

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
        proxy_set_header Connection '';    # SSE needs this
        proxy_buffering off;              # SSE needs this
        proxy_read_timeout 86400s;        # Long-lived SSE
    }
}
```

Requirements:
- Health check: `GET /health` on each coordinator
- Sticky sessions: Not required
- Protocol: HTTP/1.1 is fine

## Capacity Estimates

Per coordinator (4 vCPU, 8GB RAM):

| Concern | Limit | Notes |
|---------|-------|-------|
| Concurrent SSE connections | ~10,000 | Node.js event loop, mostly idle I/O |
| HTTP requests/sec | ~5,000 | Session CRUD, not on hot path |
| DB queries/sec | ~1,000 | Mostly reads, well within CRDB limits |

Three coordinators handle ~30,000 concurrent SSE streams. You'll run out of runner capacity long before coordinator capacity.

## Deployment

### Prerequisites

1. Postgres or CockroachDB running and accessible
2. `ASH_DATABASE_URL` set on all coordinators pointing to the same database

### Starting Multiple Coordinators

```bash
# Coordinator 1
ASH_MODE=coordinator \
ASH_DATABASE_URL=postgres://user:pass@db:5432/ash \
ASH_PORT=4100 \
node packages/server/dist/index.js

# Coordinator 2
ASH_MODE=coordinator \
ASH_DATABASE_URL=postgres://user:pass@db:5432/ash \
ASH_PORT=4100 \
node packages/server/dist/index.js
```

### Runners

Runners register with the load balancer URL:

```bash
ASH_RUNNER_ID=runner-1 \
ASH_SERVER_URL=http://load-balancer:4100 \
node packages/runner/dist/index.js
```

## Non-Goals

- Coordinator-to-coordinator communication (CRDB is the shared state)
- Session migration between coordinators (SSE reconnection handles this)
- Leader election (all operations are idempotent)
- gRPC between coordinators and runners (HTTP + SSE is sufficient)

## Related

- [Multi-Runner Architecture](./multi-runner.md) — how runners work
- [Decision: HTTP over gRPC](../decisions/0002-http-over-grpc-for-runner.md) — why HTTP
- [Database](./database.md) — SQLite vs Postgres/CRDB configuration
