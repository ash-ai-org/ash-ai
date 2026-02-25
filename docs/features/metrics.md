# Metrics and Observability

**Date:** 2026-02-18

## What

Three layers of observability, all zero-dependency:

1. **`/health`** — JSON snapshot of current server state (existing)
2. **`/metrics`** — Prometheus text format endpoint for scraping
3. **Structured log lines** — JSON to stderr on every resume event, queryable with `jq`

## Why

In-memory counters (`resumeWarmHits`, `resumeColdHits`) answer "is resume working right now?" but not "what's the warm/cold ratio over the last hour?" or "when did cold resumes spike?"

Two options were considered:

- **Metrics framework** (Prometheus client lib, OpenTelemetry) — adds a dependency, initialization boilerplate, and a runtime cost for something that's just string concatenation.
- **Raw text format + log lines** — Prometheus exposition format is a simple text protocol. No library needed. Log lines with timestamps give time-series history for free.

We went with the second. The `/metrics` endpoint is ~30 lines of template strings. The log lines are one `process.stderr.write()` per event.

## `/metrics` Endpoint

### Format

Standard [Prometheus text exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format) (version 0.0.4).

```
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

### Exposed Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ash_up` | gauge | — | Always 1 if reachable |
| `ash_uptime_seconds` | gauge | — | Seconds since server start |
| `ash_active_sessions` | gauge | — | Sessions with status `active` |
| `ash_active_sandboxes` | gauge | — | Live sandbox processes |
| `ash_pool_sandboxes` | gauge | `state` | Sandbox count by state (`cold`, `warming`, `warm`, `waiting`, `running`) |
| `ash_pool_max_capacity` | gauge | — | Maximum sandbox limit |
| `ash_resume_total` | counter | `path` | Total resumes: `warm` (sandbox alive) or `cold` (new sandbox spawned) |
| `ash_resume_cold_total` | counter | `source` | Cold resume workspace source: `local` (disk), `cloud` (S3/GCS), `fresh` (no state) |

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ash'
    static_configs:
      - targets: ['localhost:4100']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Example Queries

```promql
# Resume rate over 5 minutes
rate(ash_resume_total[5m])

# Warm vs cold ratio
ash_resume_total{path="warm"} / (ash_resume_total{path="warm"} + ash_resume_total{path="cold"})

# Running sandbox utilization
ash_pool_sandboxes{state="running"} / ash_pool_max_capacity

# Alert: cold resumes spiking (possible sandbox instability)
rate(ash_resume_total{path="cold"}[5m]) > 0.1

# Cold resume source breakdown
rate(ash_resume_cold_total{source="local"}[5m])   # From local disk
rate(ash_resume_cold_total{source="cloud"}[5m])    # From S3/GCS
rate(ash_resume_cold_total{source="fresh"}[5m])    # No backup (state loss)

# Ratio of cold resumes that found a backup vs started fresh
(ash_resume_cold_total{source="local"} + ash_resume_cold_total{source="cloud"})
  / ash_resume_cold_total
```

## Structured Log Lines

Every session resume emits a JSON line to stderr, always on (not gated by `ASH_DEBUG_TIMING`):

```json
{"type":"resume_hit","path":"warm","sessionId":"abc-123","agentName":"qa-bot","ts":"2026-02-18T20:15:30.000Z"}
{"type":"resume_hit","path":"cold","source":"local","sessionId":"def-456","agentName":"qa-bot","ts":"2026-02-18T20:16:45.000Z"}
{"type":"resume_hit","path":"cold","source":"cloud","sessionId":"ghi-789","agentName":"qa-bot","ts":"2026-02-18T20:17:00.000Z"}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"resume_hit"` | Event discriminator |
| `path` | `"warm"` \| `"cold"` | Which resume path was taken |
| `source` | `"local"` \| `"cloud"` \| `"fresh"` | Where the workspace came from (cold path only) |
| `sessionId` | UUID | Session that was resumed |
| `agentName` | string | Agent the session belongs to |
| `ts` | ISO 8601 | When the resume happened |

### Analysis with jq

```bash
# Count warm vs cold in last hour
grep '"resume_hit"' server.log \
  | jq -s '[.[] | select(.ts > "2026-02-18T19:00")] | group_by(.path) | map({path: .[0].path, count: length})'

# Cold resumes per agent
grep '"resume_hit"' server.log \
  | jq -s '[.[] | select(.path == "cold")] | group_by(.agentName) | map({agent: .[0].agentName, count: length})'

# Resume timeline (1-minute buckets)
grep '"resume_hit"' server.log \
  | jq -r '.ts[:16]' | sort | uniq -c
```

### Capturing Logs

```bash
# Docker mode — stderr goes to Docker logs
docker logs ash-server 2>&1 | grep '"resume_hit"'

# Native mode — redirect stderr
ASH_REAL_SDK=1 pnpm --filter '@ash-ai/server' dev 2>server.log

# Pipe to CloudWatch/GCP Logging — just forward stderr
```

## `/health` Pool Stats

The `/health` endpoint also includes the resume counters in its response:

```json
{
  "status": "ok",
  "activeSessions": 3,
  "activeSandboxes": 3,
  "uptime": 3600,
  "pool": {
    "total": 5,
    "cold": 2,
    "warming": 0,
    "warm": 0,
    "waiting": 2,
    "running": 1,
    "maxCapacity": 1000,
    "resumeWarmHits": 42,
    "resumeColdHits": 7,
    "resumeColdLocalHits": 4,
    "resumeColdCloudHits": 2,
    "resumeColdFreshHits": 1,
    "preWarmHits": 3
  }
}
```

The cold resume source counters (`resumeColdLocalHits`, `resumeColdCloudHits`, `resumeColdFreshHits`) break down where the workspace came from during cold resumes. Their sum equals `resumeColdHits`.

These are monotonic in-memory counters that reset on server restart. For persistent history, use the log lines or Prometheus with persistent storage.

## Known Limitations

- Counters are in-memory — they reset on restart. This is intentional: Prometheus handles persistence, and log lines provide the historical record.
- No histogram/latency metrics yet. Resume latency is captured by the existing `ASH_DEBUG_TIMING` system (see [hot-path-timing.md](./hot-path-timing.md)).
- The `/metrics` endpoint queries the database for session counts on every scrape. At default 15s scrape interval this is negligible; don't set it to 1s.
