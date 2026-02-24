---
sidebar_position: 7
title: Monitoring
---

# Monitoring

Ash exposes health checks, Prometheus metrics, debug timing, and structured logs for production monitoring.

## Health Endpoint

`GET /health` returns the server's current status. This endpoint does not require authentication.

```bash
curl $ASH_SERVER_URL/health
```

Response:

```json
{
  "status": "ok",
  "activeSessions": 3,
  "activeSandboxes": 5,
  "uptime": 86400,
  "pool": {
    "total": 10,
    "cold": 2,
    "warming": 1,
    "warm": 2,
    "waiting": 3,
    "running": 2,
    "maxCapacity": 1000,
    "resumeWarmHits": 42,
    "resumeColdHits": 7
  }
}
```

| Field | Description |
|-------|-------------|
| `status` | Always `"ok"` if the server is reachable. |
| `activeSessions` | Number of sessions with status `active`. |
| `activeSandboxes` | Number of live sandbox processes. |
| `uptime` | Seconds since server start. |
| `pool.total` | Total sandboxes in the pool (all states). |
| `pool.warm` | Sandboxes ready to accept work immediately. |
| `pool.running` | Sandboxes actively processing a message. |
| `pool.maxCapacity` | Maximum number of sandboxes the pool allows. |
| `pool.resumeWarmHits` | Times a session resumed with its sandbox still alive (fast path). |
| `pool.resumeColdHits` | Times a session resumed by creating a new sandbox (cold path). |

## Prometheus Metrics

`GET /metrics` returns metrics in Prometheus text exposition format. This endpoint does not require authentication.

```bash
curl $ASH_SERVER_URL/metrics
```

Response:

```
# HELP ash_up Whether the Ash server is up (always 1 if reachable).
# TYPE ash_up gauge
ash_up 1

# HELP ash_uptime_seconds Seconds since server start.
# TYPE ash_uptime_seconds gauge
ash_uptime_seconds 86400

# HELP ash_active_sessions Number of active sessions.
# TYPE ash_active_sessions gauge
ash_active_sessions 3

# HELP ash_active_sandboxes Number of live sandbox processes.
# TYPE ash_active_sandboxes gauge
ash_active_sandboxes 5

# HELP ash_pool_sandboxes Sandbox count by state.
# TYPE ash_pool_sandboxes gauge
ash_pool_sandboxes{state="cold"} 2
ash_pool_sandboxes{state="warming"} 1
ash_pool_sandboxes{state="warm"} 2
ash_pool_sandboxes{state="waiting"} 3
ash_pool_sandboxes{state="running"} 2

# HELP ash_pool_max_capacity Maximum sandbox capacity.
# TYPE ash_pool_max_capacity gauge
ash_pool_max_capacity 1000

# HELP ash_resume_total Total session resumes by path (warm=sandbox alive, cold=new sandbox).
# TYPE ash_resume_total counter
ash_resume_total{path="warm"} 42
ash_resume_total{path="cold"} 7
```

### Metric Reference

| Metric | Type | Description |
|--------|------|-------------|
| `ash_up` | gauge | Always 1 if the server is reachable. Use for up/down alerting. |
| `ash_uptime_seconds` | gauge | Seconds since server process started. |
| `ash_active_sessions` | gauge | Sessions currently in `active` state. |
| `ash_active_sandboxes` | gauge | Live sandbox processes (includes all states). |
| `ash_pool_sandboxes` | gauge | Sandbox count broken down by state label: `cold`, `warming`, `warm`, `waiting`, `running`. |
| `ash_pool_max_capacity` | gauge | Maximum sandboxes the pool will create. |
| `ash_resume_total` | counter | Cumulative session resumes by path: `warm` (sandbox alive) or `cold` (new sandbox). |

### Prometheus Configuration

Add Ash as a scrape target in `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ash'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:4100']
    metrics_path: /metrics
```

### Example PromQL Queries

Active sessions over time:

```promql
ash_active_sessions
```

Warm resume hit rate (percentage of resumes that were fast):

```promql
ash_resume_total{path="warm"} / (ash_resume_total{path="warm"} + ash_resume_total{path="cold"})
```

Pool utilization (fraction of capacity in use):

```promql
sum(ash_pool_sandboxes) / ash_pool_max_capacity
```

Running sandboxes (actively processing messages):

```promql
ash_pool_sandboxes{state="running"}
```

Alert when pool is over 80% capacity:

```promql
sum(ash_pool_sandboxes) / ash_pool_max_capacity > 0.8
```

## Debug Timing

Set `ASH_DEBUG_TIMING=1` to enable per-message timing instrumentation. When enabled, the server writes one JSON line to stderr for each message processed:

```bash
ASH_DEBUG_TIMING=1 ash start
```

Timing output:

```json
{
  "type": "timing",
  "source": "server",
  "sessionId": "a1b2c3d4-...",
  "sandboxId": "a1b2c3d4-...",
  "lookupMs": 0.42,
  "firstEventMs": 145.8,
  "totalMs": 2340.5,
  "eventCount": 12,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `lookupMs` | Time to look up the session and sandbox. |
| `firstEventMs` | Time from request to first SSE event (time-to-first-token). |
| `totalMs` | Total request duration. |
| `eventCount` | Number of SSE events sent. |

Timing is zero-overhead when `ASH_DEBUG_TIMING` is not set. The check is a single `process.env` read per message.

## Structured Logs

Ash writes structured JSON log lines to stderr. Each line is a self-contained JSON object.

### Resume Logging

Every session resume emits a log line (always on, not gated by `ASH_DEBUG_TIMING`):

```json
{
  "type": "resume_hit",
  "path": "warm",
  "sessionId": "a1b2c3d4-...",
  "agentName": "my-agent",
  "ts": "2025-01-15T10:30:00.000Z"
}
```

The `path` field is `warm` (sandbox still alive) or `cold` (new sandbox created).

### Log Analysis with jq

Filter resume events:

```bash
ash start 2>&1 | jq -c 'select(.type == "resume_hit")'
```

Count warm vs cold resumes:

```bash
ash start 2>&1 | jq -c 'select(.type == "resume_hit")' | \
  jq -s 'group_by(.path) | map({path: .[0].path, count: length})'
```

Filter timing data for a specific session:

```bash
ash start 2>&1 | jq -c 'select(.type == "timing" and .sessionId == "SESSION_ID")'
```

Find slow messages (time-to-first-token over 500ms):

```bash
ash start 2>&1 | jq -c 'select(.type == "timing" and .firstEventMs > 500)'
```

Average time-to-first-token:

```bash
ash start 2>&1 | jq -cs '[.[] | select(.type == "timing")] | (map(.firstEventMs) | add) / length'
```
