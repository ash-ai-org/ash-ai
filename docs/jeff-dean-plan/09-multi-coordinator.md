# 09: Multi-Coordinator With CRDB

## When To Do This

Not now. Do this when:

1. You have measured (step 06) that the single coordinator is the bottleneck
2. That bottleneck is HTTP connection handling or SSE proxy fan-out, not runner capacity
3. You're already running CRDB in production (step 02 + `ASH_DATABASE_URL`)

If a single coordinator is keeping up with your runner fleet, stop. You don't need this yet.

## Still here? OK.

## The Problem

Step 08 scales the data plane (runners) horizontally. But the control plane is still a single `ash-server` process. That process:

1. Accepts all client HTTP requests
2. Proxies all SSE streams (one long-lived connection per active session)
3. Manages runner registration and heartbeats
4. Reads/writes session state

For most deployments, a single coordinator handles thousands of concurrent SSE connections fine — Fastify + Node.js is good at holding open connections. But at sufficient scale, either:

- The SSE proxy fan-out saturates the coordinator's network/CPU
- You want redundancy (single coordinator is a SPOF)

## What Changes

### Before (step 08)

```
Client → ash-server (single coordinator) → Runner 1..N
                    ↕
                   CRDB
```

### After

```
         ┌─→ ash-server-1 ──→ Runner 1..N
LB ──────┼─→ ash-server-2 ──→ Runner 1..N
         └─→ ash-server-M ──→ Runner 1..N
                    ↕
                   CRDB
```

Every coordinator can talk to every runner. CRDB is the shared source of truth.

## Prerequisites

1. **CRDB is the database.** SQLite is single-process. Multi-coordinator requires shared state. You must be running with `ASH_DATABASE_URL` pointing at CRDB (or Postgres).

2. **Runner registry is in the database.** Currently runners register in-memory on the coordinator. Move the runner registry table to CRDB so all coordinators see the same runners.

3. **Coordinators are stateless.** The coordinator must hold no session or runner state in memory that isn't derivable from the database. All routing decisions come from CRDB.

## What Needs To Change

### 1. Move runner registry to CRDB

Add a `runners` table:

```sql
CREATE TABLE runners (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  max_sandboxes INTEGER NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  warming_count INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Runner registration (`POST /api/internal/runners/register`) writes to this table. Heartbeats update `active_count`, `warming_count`, and `last_heartbeat_at`. Any coordinator can read the table to discover all healthy runners.

### 2. Make coordinator selection read from DB

`RunnerCoordinator.selectBackend()` currently iterates an in-memory map. Change it to query CRDB:

```sql
SELECT id, host, port, max_sandboxes, active_count
FROM runners
WHERE last_heartbeat_at > NOW() - INTERVAL '30 seconds'
ORDER BY (max_sandboxes - active_count - warming_count) DESC
LIMIT 1;
```

This is one query per session creation. Not a hot path — session creation is rare relative to message streaming.

### 3. SSE connections are coordinator-local (and that's fine)

When a client opens an SSE stream, it's pinned to whichever coordinator the load balancer routed it to. That coordinator proxies events from the runner. If the coordinator dies:

1. Client gets a connection error
2. Client reconnects (standard SSE reconnection)
3. Load balancer routes to a different coordinator
4. New coordinator reads session state from CRDB, finds the runner, re-establishes the proxy

No session migration needed. The runner is still running the sandbox. Only the SSE proxy hop is re-established.

### 4. Liveness sweep distributes across coordinators

Currently one coordinator runs the liveness sweep (check for dead runners every 30s). With N coordinators, either:

- **All of them sweep** — idempotent, just marks sessions as paused. Redundant work but simple. CRDB handles concurrent writes fine.
- **Leader election** — one coordinator wins a lease and sweeps. More complex, less redundant.

Use the simple approach. The sweep is cheap (one query every 30s) and idempotent.

## Load Balancer Configuration

Any L4/L7 load balancer works. Requirements:

- **Health check**: `GET /health` on each coordinator
- **Sticky sessions**: Not required. Any coordinator can handle any request. SSE reconnection handles coordinator failover.
- **Protocol**: HTTP/1.1 is fine. SSE doesn't benefit from HTTP/2 multiplexing since each stream is a separate client connection anyway.

```
# Example: nginx
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

## What Doesn't Change

- **Runner protocol** — runners don't know or care how many coordinators exist. They register with one URL (the LB) and send heartbeats there.
- **Client SDK** — clients connect to one URL (the LB). SSE reconnection is already built in.
- **Session routing** — `session.runner_id` in CRDB already tells any coordinator where to route.
- **Runner backends** — `RemoteRunnerBackend` is stateless HTTP calls to runners. Any coordinator can instantiate one.

## Estimated Effort

This is small. The actual code changes:

1. Add `runners` table to the Drizzle schema (~20 lines)
2. Change `RunnerCoordinator` to read/write DB instead of in-memory map (~50 lines)
3. Change runner registration endpoint to persist to DB (~10 lines)
4. Change heartbeat handler to update DB (~10 lines)
5. Deploy behind a load balancer (ops, not code)

Total: ~100 lines of code changes. The architecture is already set up for this — CRDB is already supported, session routing already uses DB lookups, and the `RunnerBackend` interface is already stateless.

## Capacity Estimate

Per coordinator (c5.xlarge, 4 vCPU, 8GB RAM):

| Concern | Limit | Notes |
|---------|-------|-------|
| Concurrent SSE connections | ~10,000 | Node.js event loop, mostly idle I/O |
| HTTP requests/sec | ~5,000 | Session CRUD, not on the hot path |
| CRDB queries/sec | ~1,000 | Mostly reads, well within single-node CRDB |

Three coordinators behind a load balancer handles ~30,000 concurrent SSE streams. Each stream corresponds to an active agent session. You'll run out of runner capacity long before coordinator capacity.

## Non-Goals

- **Coordinator-to-coordinator communication.** They don't talk to each other. CRDB is the shared state.
- **Session migration between coordinators.** SSE reconnection handles this transparently.
- **Coordinator leader election.** Not needed. All operations are idempotent or use CRDB for coordination.
- **gRPC between coordinators and runners.** HTTP + SSE is enough (see `docs/decisions/0002-http-over-grpc-for-runner.md`).
