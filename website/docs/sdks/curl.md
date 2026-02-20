---
sidebar_position: 3
title: Direct API (curl)
---

# Direct API (curl)

No SDK dependencies needed. All Ash functionality is available through HTTP requests. This page shows every operation using `curl`.

If authentication is enabled (the `ASH_API_KEY` environment variable is set on the server), include the `-H "Authorization: Bearer YOUR_KEY"` header on every request except `/health`.

## Health Check

```bash
curl http://localhost:4100/health
```

```json
{
  "status": "ok",
  "activeSessions": 2,
  "activeSandboxes": 2,
  "uptime": 1234,
  "pool": {
    "total": 5,
    "cold": 2,
    "warming": 0,
    "warm": 1,
    "waiting": 1,
    "running": 1,
    "maxCapacity": 1000,
    "resumeWarmHits": 3,
    "resumeColdHits": 1
  }
}
```

## Agents

### Deploy an Agent

```bash
curl -X POST http://localhost:4100/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"name": "my-agent", "path": "/path/to/agent/directory"}'
```

The agent directory must contain a `CLAUDE.md` file. The path is resolved on the server.

### List Agents

```bash
curl http://localhost:4100/api/agents \
  -H "Authorization: Bearer YOUR_KEY"
```

### Get Agent Details

```bash
curl http://localhost:4100/api/agents/my-agent \
  -H "Authorization: Bearer YOUR_KEY"
```

### Delete an Agent

```bash
curl -X DELETE http://localhost:4100/api/agents/my-agent \
  -H "Authorization: Bearer YOUR_KEY"
```

## Sessions

### Create a Session

```bash
curl -X POST http://localhost:4100/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"agent": "my-agent"}'
```

Response:

```json
{
  "session": {
    "id": "a1b2c3d4-...",
    "agentName": "my-agent",
    "sandboxId": "a1b2c3d4-...",
    "status": "active",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "lastActiveAt": "2026-01-15T10:00:00.000Z"
  }
}
```

### Send a Message (SSE Stream)

Use `-N` to disable output buffering so SSE events print in real time:

```bash
curl -N -X POST http://localhost:4100/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"content": "What files are in the workspace?"}'
```

The response is a `text/event-stream`. Events arrive as:

```
event: message
data: {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Here are the files..."}]}}

event: message
data: {"type":"result","subtype":"success","session_id":"...","num_turns":1}

event: done
data: {"sessionId":"a1b2c3d4-..."}
```

To enable partial message streaming (incremental text deltas):

```bash
curl -N -X POST http://localhost:4100/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"content": "Write a haiku", "includePartialMessages": true}'
```

### List Sessions

```bash
# All sessions
curl http://localhost:4100/api/sessions \
  -H "Authorization: Bearer YOUR_KEY"

# Filter by agent
curl "http://localhost:4100/api/sessions?agent=my-agent" \
  -H "Authorization: Bearer YOUR_KEY"
```

### Get Session Details

```bash
curl http://localhost:4100/api/sessions/SESSION_ID \
  -H "Authorization: Bearer YOUR_KEY"
```

### Pause a Session

```bash
curl -X POST http://localhost:4100/api/sessions/SESSION_ID/pause \
  -H "Authorization: Bearer YOUR_KEY"
```

### Resume a Session

```bash
curl -X POST http://localhost:4100/api/sessions/SESSION_ID/resume \
  -H "Authorization: Bearer YOUR_KEY"
```

### End a Session

```bash
curl -X DELETE http://localhost:4100/api/sessions/SESSION_ID \
  -H "Authorization: Bearer YOUR_KEY"
```

### List Messages (History)

```bash
# Default: last 100 messages
curl http://localhost:4100/api/sessions/SESSION_ID/messages \
  -H "Authorization: Bearer YOUR_KEY"

# With pagination
curl "http://localhost:4100/api/sessions/SESSION_ID/messages?limit=50&after=10" \
  -H "Authorization: Bearer YOUR_KEY"
```

Note: `GET /api/sessions/:id/messages` returns persisted message history, while `POST /api/sessions/:id/messages` sends a new message and returns an SSE stream.

### List Session Events (Timeline)

```bash
# All events
curl http://localhost:4100/api/sessions/SESSION_ID/events \
  -H "Authorization: Bearer YOUR_KEY"

# Filter by type
curl "http://localhost:4100/api/sessions/SESSION_ID/events?type=text&limit=50" \
  -H "Authorization: Bearer YOUR_KEY"
```

## Files

### List Workspace Files

```bash
curl http://localhost:4100/api/sessions/SESSION_ID/files \
  -H "Authorization: Bearer YOUR_KEY"
```

### Read a File

```bash
curl http://localhost:4100/api/sessions/SESSION_ID/files/src/index.ts \
  -H "Authorization: Bearer YOUR_KEY"
```

## SSE Event Format

The send-message endpoint returns an SSE stream with three event types:

| Event | Data | Description |
|-------|------|-------------|
| `message` | Raw Claude Code SDK `Message` object | Assistant response, tool use, tool result, or final result. The `data.type` field indicates the message kind (`assistant`, `user`, `result`, `stream_event`). |
| `error` | `{"error": "..."}` | An error occurred during processing. |
| `done` | `{"sessionId": "..."}` | The agent's turn is complete. |

Each SSE frame follows the standard format:

```
event: <type>\n
data: <JSON>\n
\n
```

The `message` event data is a passthrough of the Claude Code SDK's `Message` type. Ash does not translate or wrap these messages -- the SDK's types are the wire format.
