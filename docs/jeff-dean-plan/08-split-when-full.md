# 08: Re-Split Server/Runner When One Machine Isn't Enough

## Status: Implemented

The multi-runner architecture is built and tested. The runner package is a standalone Fastify process that registers with the coordinator over HTTP. The coordinator routes sessions to the least-loaded healthy runner. All the primitives for multi-machine deployment are in place.

## When To Deploy This

When:

1. You have measured (step 06) that a single machine hits a resource ceiling
2. That ceiling is CPU/memory/process count, not a software bug
3. You actually need more than ~200-500 concurrent agent sessions

If you're not there, you're paying distributed systems tax for nothing. The code exists but you don't need to run it.

## What Changes

The consolidation in step 01 made the runner an in-process library. Now we split it back out — but this time with the correct primitives.

### Before (current, after step 01)

```
Client → ash-server (has runner in-process) → bridge
```

### After

```
Client → ash-server → HTTP → ash-runner-1 → bridge
                           → ash-runner-2 → bridge
                           → ash-runner-N → bridge
```

## Why HTTP, Not gRPC

See [Decision 0002: HTTP over gRPC for Runner Communication](../decisions/0002-http-over-grpc-for-runner.md).

The original plan proposed gRPC but we chose HTTP + SSE because:

1. **Simplicity**: No protobuf, no code generation, no native modules. Same Fastify framework everywhere.
2. **LLM latency dominates**: Server→runner latency is single-digit ms. LLM inference is seconds. The wire protocol doesn't matter.
3. **Debuggability**: `curl` works. Logs are readable. No binary wire format.
4. **SSE streaming**: Server→client and runner→server both use SSE. One pattern, not two.

## Runner Registration

When a runner starts, it registers with the control plane via HTTP:

```
POST /api/internal/runners/register
{
  "runnerId": "runner-1",
  "host": "runner-1.internal",
  "port": 4200,
  "maxSandboxes": 100
}
```

Heartbeats are sent every 10 seconds via `POST /api/internal/runners/heartbeat` with pool stats (running, warming counts). The coordinator detects dead runners after 30 seconds of missed heartbeats.

## Session Routing

Sessions track their assigned runner in the database:

```sql
-- sessions table includes:
runner_id TEXT  -- NULL for local, runner ID for remote
CREATE INDEX idx_sessions_runner ON sessions (runner_id);
```

The `RunnerCoordinator` picks the runner with the most available capacity:

```sql
SELECT id, host, port, max_sandboxes, active_count, warming_count
FROM runners
WHERE last_heartbeat_at > NOW() - INTERVAL '30 seconds'
ORDER BY (max_sandboxes - active_count - warming_count) DESC
LIMIT 1;
```

This is one query per session creation — not a hot path.

## Runner Selection Strategy

Simple least-loaded by available capacity (max - active - warming). That's it. Don't build anything fancier until you measure a problem with this.

Advanced strategies for later (not now):
- Agent affinity (prefer runners that already have warm sandboxes for this agent)
- Region awareness (route to closest runner)
- Resource-weighted selection (account for memory/CPU, not just count)

## Session Migration

When a runner goes down, its sessions need to move. Two strategies:

### Strategy A: Let it fail, client retries with resume

The simplest approach. If a runner dies:
1. Server marks all its sessions as `paused`
2. Client gets a connection error
3. Client calls `POST /api/sessions/:id/resume`
4. Server picks a different runner, cold-restores from saved state

This works because step 07 (session resume) already handles cold restoration. No new code needed.

### Strategy B: Proactive migration (later, much later)

Server detects runner going down (missed heartbeat), proactively migrates sessions to healthy runners. This is a lot of complexity for marginal benefit over Strategy A.

**Use Strategy A.**

## What This Reuses

The runner package already has:
- `routes/sandboxes.ts` — HTTP API for sandbox CRUD + streaming
- `routes/health.ts` — Health endpoint with pool stats
- `registration.ts` — Auto-registration and heartbeat loop

The server already has:
- `RunnerCoordinator` — Runner discovery, selection, and liveness sweep
- `RemoteRunnerBackend` — HTTP client wrapping `RunnerClient`
- `LocalRunnerBackend` — In-process wrapper for standalone mode

Both implement the `RunnerBackend` interface. The split boundary is exactly where it was in the original architecture. The work in steps 01-07 didn't delete the boundary — it just stopped crossing it over HTTP for no reason.

## Estimated Capacity Per Runner

From measuring (step 06), expect per runner (c5.2xlarge, 8 vCPU, 16GB RAM):

| Sandbox limit | Bottleneck | Concurrent sessions |
|---------------|------------|-------------------|
| 512MB each | Memory | ~30 |
| 256MB each | Memory | ~60 |
| 128MB each | Memory | ~120 |
| No memory limit | CPU (8 cores) | ~50-200 (depends on agent activity) |

The "1000 sandboxes per runner" number from the original plan is aspirational. Real number depends on what agents actually do. Measure it.

## What Was Built

### Runner Registration & Lifecycle

- **Registration with retry**: Runners register with the coordinator via `POST /api/internal/runners/register`. If registration fails, retries with exponential backoff (1s, 2s, 4s, 8s, 16s) until successful.
- **Graceful deregistration**: On shutdown, the runner calls `POST /api/internal/runners/deregister`. The coordinator immediately pauses all active sessions on that runner (single bulk UPDATE, not per-session) and removes it from the registry. No more waiting 30s for the liveness sweep.
- **Heartbeat loop**: Every 10 seconds, sends pool stats to the coordinator.
- **Internal endpoint auth**: When `ASH_INTERNAL_SECRET` is set, all internal endpoints require `Authorization: Bearer <secret>`. Required for multi-machine deployments. No-op in dev/single-machine mode.

### Coordinator Improvements

- **Bulk session pause**: `handleDeadRunner` uses a single `UPDATE sessions SET status='paused' WHERE runner_id=? AND status IN ('active','starting')` instead of N+1 queries.
- **Liveness sweep jitter**: Random 0-5s jitter on each sweep interval prevents thundering herd when multiple coordinators run independently.
- **Single-query dead runner detection**: `checkLiveness` queries directly for runners past the heartbeat cutoff instead of listing all runners then filtering in JS.
- **Stale cache cleanup**: After processing dead runners, purges local backend cache entries for runners that another coordinator removed from the DB.
- **Coordinator ID**: Each coordinator logs its ID (`hostname-PID`) on startup and includes it in the health endpoint for debugging multi-coordinator deployments.

### Key Files

| File | What |
|------|------|
| `packages/runner/src/index.ts` | Runner entry point (Fastify + sandbox pool) |
| `packages/runner/src/registration.ts` | Registration with retry + graceful deregister |
| `packages/runner/src/routes/sandboxes.ts` | Sandbox CRUD + SSE streaming for commands |
| `packages/runner/src/routes/health.ts` | Health endpoint with pool stats |
| `packages/server/src/runner/coordinator.ts` | DB-backed coordinator with bulk operations |
| `packages/server/src/runner/remote-backend.ts` | HTTP client wrapper for runner backends |
| `packages/server/src/runner/runner-client.ts` | Raw HTTP/SSE client to runner processes |
| `packages/server/src/routes/runners.ts` | Registration/heartbeat/deregister endpoints |
| `packages/server/src/__tests__/coordinator.test.ts` | 13 tests including deregistration and bulk pause |

## What's Next

Step 08 scales the data plane (runners). If the single coordinator becomes the bottleneck — either for SSE fan-out or for redundancy — see [Step 09: Multi-Coordinator](./09-multi-coordinator.md). It requires CRDB and is ~100 lines of code changes.
