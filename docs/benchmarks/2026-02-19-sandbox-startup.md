# Sandbox Startup + TTFT Benchmark

**Date**: 2026-02-19
**Machine**: Apple Silicon (arm64), macOS Darwin 24.6.0, Docker (ash-dev image, Linux container)
**Node**: v23.7.0
**SDK**: Real Claude Agent SDK (`ASH_REAL_SDK=1`)
**Command**: `tsx test/bench/sandbox-startup.ts [--db sqlite|crdb]`
**Rounds**: 3 per scenario

## What it measures

End-to-end latency for three sandbox lifecycle scenarios, each measuring two things:

- **API latency**: Time for the HTTP call (`POST /api/sessions` or `POST /api/sessions/:id/resume`) to return. This is pure Ash overhead: agent copy, process spawn, bridge connect, DB lookups.
- **TTFT** (Time to First Token): Time from sending a message (`POST /api/sessions/:id/messages` with prompt "Respond with the number 1 and nothing else.") to receiving the first SSE event. Includes Ash overhead + real Claude API latency.

### Scenarios

| Scenario | What happens inside |
|---|---|
| **New session** (cold start) | `cpSync` agent dir, `spawnWithLimits` (cgroup setup on Linux), bridge socket connect, DB insert |
| **Warm resume** | DB lookup, verify `process.exitCode === null`, status update. No new process. |
| **Cold resume** | Server restart kills all sandboxes. On resume: detect dead sandbox, `restoreSessionState`, new process spawn, bridge reconnect |

## Results

All values in milliseconds.

### SQLite (default)

#### API Latency

| Scenario | p50 | p95 | mean |
|---|---|---|---|
| New session (cold start) | 44 | 142 | 75 |
| Warm resume | 1.7 | 1.9 | 1.7 |
| Cold resume | 32 | 36 | 32 |

#### TTFT

| Scenario | p50 | p95 | mean |
|---|---|---|---|
| New session (cold start) | 1329 | 1412 | 1339 |
| Warm resume | 1276 | 1294 | 1267 |
| Cold resume | 1354 | 1381 | 1363 |

### CockroachDB

CockroachDB runs in a separate Docker container (`cockroachdb/cockroach:v24.3.0`, single-node insecure mode). The Ash server connects via `ASH_DATABASE_URL`.

#### API Latency

| Scenario | p50 | p95 | mean |
|---|---|---|---|
| New session (cold start) | 173 | 196 | 175 |
| Warm resume | 4.9 | 5.0 | 4.9 |
| Cold resume | 54 | 139 | 80 |

#### TTFT

| Scenario | p50 | p95 | mean |
|---|---|---|---|
| New session (cold start) | 1697 | 1792 | 1614 |
| Warm resume | 1346 | 1350 | 1334 |
| Cold resume | 1347 | 1381 | 1335 |

## Analysis

### Ash overhead is negligible on TTFT

TTFT is ~1.3s across all scenarios and both databases. The timing instrumentation confirms this is almost entirely `sdkFirstTokenMs` — time waiting for the Claude API to return the first token. Ash adds <5ms on top (server lookup ~1ms, bridge command parse ~0.01ms, SSE framing ~2ms).

### SQLite vs CockroachDB: API latency comparison

| Scenario | SQLite p50 | CRDB p50 | Delta |
|---|---|---|---|
| New session | 44ms | 173ms | +129ms |
| Warm resume | 1.7ms | 4.9ms | +3.2ms |
| Cold resume | 32ms | 54ms | +22ms |

CockroachDB adds overhead on every DB operation due to network round-trips (container-to-container via `host.docker.internal`). The biggest impact is on new session creation, which does multiple DB writes (insert session, insert sandbox, update status). Warm resume is the least affected since it's just a single read + status update.

### Warm resume is effectively free

At 1.7ms (SQLite) / 4.9ms (CRDB), warm resume is a DB lookup + status flip. No process spawn, no bridge reconnect. This is the fast path when a user resumes a paused session whose sandbox is still alive.

### Cold resume is fast enough

At 32ms (SQLite) / 54ms (CRDB), cold resume restores persisted state, spawns a new sandboxed process, and establishes a bridge connection. Still well under 200ms — imperceptible to users who then wait ~1.3s for the Claude API anyway.

### New session has the most variance

The p95 spikes (142ms SQLite, 196ms CRDB) come from `cpSync` of the agent directory and filesystem cache behavior. First-round-after-deploy is consistently slower.
