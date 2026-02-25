# Sandbox Pool

Date: 2026-02-18

## What

DB-backed pool wrapping `SandboxManager` that tracks sandbox lifecycle state, enforces configurable capacity limits, performs LRU eviction, and runs periodic idle sweeps. Survives server restarts via the `sandboxes` database table.

## Why

Without a pool, sandboxes exist only in memory. Server restarts lose all tracking. There's no capacity enforcement — the server can spawn unlimited sandboxes until the machine runs out of resources. There's no idle timeout — paused sessions hold process resources forever.

The pool solves these problems with a single abstraction: an in-memory `Map` for hot-path O(1) access to live sandboxes, backed by a database table that is the source of truth for total capacity and cold sandbox tracking.

## State Machine

```
                    +----------------------------------+
                    |                                  |
CREATE --> warming --> warm --> running --> waiting --> running --> ...
                                             |
                                evict / idle timeout / crash
                                             |
                                             v
                                   cold (disk only, DB record)
                                             |
                                   resume / cold eviction
                                     |              |
                                     v              v
                                   warming        deleted
```

| State | Process | Description |
|-------|---------|-------------|
| `cold` | No | Persisted state on disk. DB record exists. Counts against capacity. |
| `warming` | Starting | Spawning process, connecting bridge. Transitional within `create()`. |
| `warm` | Yes | Process alive, bridge connected, assigned to session. |
| `waiting` | Yes | Between messages or session paused. Eligible for eviction. |
| `running` | Yes | Processing a message. Never evicted. |

## Eviction Tiers

When capacity is reached, the pool evicts in priority order:

1. **Cold eviction**: Delete oldest cold sandbox's persisted state + DB row. No process to kill.
2. **Warm eviction**: Kill warm sandbox process, delete DB row.
3. **Waiting eviction**: Call `onBeforeEvict` (persists state, pauses session), kill process, mark DB row cold.
4. **Running**: Never evicted. If all sandboxes are running, returns 503.

## Cold Cleanup

*Added: 2026-02-25*

A separate periodic timer (every 5 minutes) removes cold sandbox entries that haven't been used in 2 hours. This prevents unbounded disk growth from accumulated cold entries after idle sweep eviction or server restarts.

Cold cleanup deletes:
- The live workspace directory (`data/sandboxes/<id>/`)
- The local snapshot directory (`data/sessions/<sessionId>/workspace/`)
- The database record

**Cloud snapshots are preserved** — sessions can still be resumed from cloud storage after local cleanup.

```
pool.startColdCleanup();  // Start periodic timer
pool.stopColdCleanup();   // Stop timer (graceful shutdown)
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `ASH_MAX_SANDBOXES` | 1000 | Maximum total sandboxes (live + cold) |
| `ASH_IDLE_TIMEOUT_MS` | 1800000 (30 min) | Waiting sandboxes idle longer than this are swept to cold |
| `COLD_CLEANUP_TTL_MS` | 7200000 (2 hr) | How long a cold sandbox sits before local files are cleaned up |

## Database Schema

```sql
CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  agent_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'warming',
  workspace_dir TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
```

Indexes on `state`, `session_id`, and `last_used_at` for efficient eviction queries.

## Race Condition Safety

`markRunning()` synchronously updates the in-memory `live` map before any `await` in the message handler. The idle sweep and eviction only target `waiting`/`warm`/`cold` entries. Single-threaded JS guarantees that once `markRunning()` executes, the sandbox cannot be evicted until `markWaiting()` is called.

DB writes for state transitions are fire-and-forget from the hot path. The in-memory map is the authority for live sandbox state. The DB is the authority for total capacity and cold sandbox tracking.

## Server Restart Behavior

On startup, `pool.init()` calls `markAllSandboxesCold()` — any sandbox that was warming/warm/waiting/running when the server died is now cold. All sandbox processes are dead after a restart; the pool doesn't attempt to reconnect to them.

## How It Fits

```
sessions.ts  -->  SandboxPool  -->  SandboxManager  -->  bridge process
                  (lifecycle)       (process mgmt)       (Claude SDK)
                  + DB tracking
```

The pool is the only consumer of `SandboxManager` in production. Routes interact with the pool, not the manager directly.

## Pool Stats

The pool exposes statistics for the health endpoint and Prometheus metrics:

```typescript
const stats = pool.stats;
// {
//   total, cold, warming, warm, waiting, running,
//   maxCapacity,
//   resumeWarmHits,        // Warm resume (sandbox alive)
//   resumeColdHits,        // Cold resume total
//   resumeColdLocalHits,   // Cold resume from local disk
//   resumeColdCloudHits,   // Cold resume from cloud (S3/GCS)
//   resumeColdFreshHits,   // Cold resume with no state
//   preWarmHits,           // Sessions that claimed a pre-warmed sandbox
// }
```

The cold resume source counters break down where the workspace came from during a cold resume. See [metrics.md](./metrics.md) for the full Prometheus metrics and log line format.

## Known Limitations

- No pre-warming (warm state exists but unused proactively)
- No per-agent capacity limits
- No workspace size tracking per sandbox
- Cold sandbox resume requires re-spawning the full process (no process hibernation)
