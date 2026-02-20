---
sidebar_position: 5
title: Health
---

# Health

Check the health of a running Ash server.

## `ash health`

Queries the server's `/health` endpoint and prints the response.

```bash
ash health
```

### Example Output

```json
{
  "status": "ok",
  "activeSessions": 3,
  "activeSandboxes": 2,
  "uptime": 7200,
  "pool": {
    "total": 5,
    "cold": 2,
    "warming": 0,
    "warm": 1,
    "waiting": 1,
    "running": 1,
    "maxCapacity": 1000,
    "resumeWarmHits": 5,
    "resumeColdHits": 2
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `status` | Always `"ok"` if the server is reachable |
| `activeSessions` | Number of sessions with status `active` |
| `activeSandboxes` | Number of live sandbox processes |
| `uptime` | Seconds since the server started |
| `pool.total` | Total sandbox entries in the database (live + cold) |
| `pool.cold` | Sandboxes with no live process (can be evicted or restored) |
| `pool.warming` | Sandboxes currently starting up |
| `pool.warm` | Sandboxes with a live process, not yet assigned to a message |
| `pool.waiting` | Sandboxes idle between messages (sandbox alive, session paused or between turns) |
| `pool.running` | Sandboxes actively processing a message |
| `pool.maxCapacity` | Maximum number of sandboxes allowed (set by `ASH_MAX_SANDBOXES`) |
| `pool.resumeWarmHits` | Number of resumes that found the sandbox still alive |
| `pool.resumeColdHits` | Number of resumes that required creating a new sandbox |

The health endpoint does not require authentication.
