---
sidebar_position: 6
title: Health and Metrics
---

# Health and Metrics

Ash exposes health and metrics endpoints for monitoring, alerting, and integration with orchestration systems. Neither endpoint requires authentication.

---

## Health Check

```
GET /health
```

Returns the server's current status, active session and sandbox counts, uptime, and detailed sandbox pool statistics.

### Request

No request body. No authentication required.

### Response

**200 OK**

```json
{
  "status": "ok",
  "activeSessions": 3,
  "activeSandboxes": 5,
  "uptime": 86400,
  "pool": {
    "total": 5,
    "cold": 0,
    "warming": 1,
    "warm": 1,
    "waiting": 2,
    "running": 1,
    "maxCapacity": 1000,
    "resumeWarmHits": 42,
    "resumeColdHits": 7
  }
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | Always `"ok"` if the server is reachable |
| `activeSessions` | integer | Number of sessions in `active` status |
| `activeSandboxes` | integer | Number of live sandbox processes |
| `uptime` | integer | Seconds since server start |
| `pool` | PoolStats | Sandbox pool breakdown |

### Pool Stats

The `pool` object provides a detailed view of sandbox states:

| Field | Type | Description |
|---|---|---|
| `total` | integer | Total sandboxes in the pool |
| `cold` | integer | Sandboxes not yet started |
| `warming` | integer | Sandboxes currently starting up |
| `warm` | integer | Sandboxes ready but not assigned to a session |
| `waiting` | integer | Sandboxes assigned to a session, idle between messages |
| `running` | integer | Sandboxes actively processing a message |
| `maxCapacity` | integer | Maximum number of sandboxes allowed (configured via `ASH_MAX_SANDBOXES`) |
| `resumeWarmHits` | integer | Total warm resumes (sandbox was still alive) |
| `resumeColdHits` | integer | Total cold resumes (new sandbox created, state restored) |

---

## Prometheus Metrics

```
GET /metrics
```

Returns metrics in Prometheus text exposition format. No authentication required.

### Request

No request body.

### Response

**200 OK** with `Content-Type: text/plain; version=0.0.4; charset=utf-8`

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
ash_pool_sandboxes{state="cold"} 0
ash_pool_sandboxes{state="warming"} 1
ash_pool_sandboxes{state="warm"} 1
ash_pool_sandboxes{state="waiting"} 2
ash_pool_sandboxes{state="running"} 1

# HELP ash_pool_max_capacity Maximum sandbox capacity.
# TYPE ash_pool_max_capacity gauge
ash_pool_max_capacity 1000

# HELP ash_resume_total Total session resumes by path (warm=sandbox alive, cold=new sandbox).
# TYPE ash_resume_total counter
ash_resume_total{path="warm"} 42
ash_resume_total{path="cold"} 7
```

### Metric Reference

| Metric | Type | Labels | Description |
|---|---|---|---|
| `ash_up` | gauge | -- | Always `1` if the server is reachable |
| `ash_uptime_seconds` | gauge | -- | Seconds since server process started |
| `ash_active_sessions` | gauge | -- | Number of sessions in `active` status |
| `ash_active_sandboxes` | gauge | -- | Number of live sandbox processes |
| `ash_pool_sandboxes` | gauge | `state` | Sandbox count broken down by state: `cold`, `warming`, `warm`, `waiting`, `running` |
| `ash_pool_max_capacity` | gauge | -- | Configured maximum sandbox capacity |
| `ash_resume_total` | counter | `path` | Cumulative session resume count by path: `warm` (sandbox still alive) or `cold` (new sandbox created) |

---

## Prometheus Configuration

Add the following scrape config to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ash'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:4100']
    metrics_path: '/metrics'
```

---

## Kubernetes Probes

The `/health` endpoint is suitable for both liveness and readiness probes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ash-server
spec:
  template:
    spec:
      containers:
        - name: ash
          livenessProbe:
            httpGet:
              path: /health
              port: 4100
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 4100
            initialDelaySeconds: 5
            periodSeconds: 5
```

The liveness probe verifies the server process is responsive. The readiness probe can be used to gate traffic until the server has completed initialization. Both return `200` with `{"status": "ok", ...}` when the server is healthy.
