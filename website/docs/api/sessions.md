---
sidebar_position: 3
title: Sessions
---

# Sessions

A session represents an ongoing conversation with a deployed agent. Each session runs inside an isolated sandbox with its own filesystem, process tree, and environment. Sessions have a lifecycle: they are created, become active, can be paused and resumed, and eventually end.

## Session Type

```typescript
interface Session {
  id: string;              // UUID
  tenantId: string;        // Tenant that owns this session
  agentName: string;       // Name of the agent this session runs
  sandboxId: string;       // ID of the sandbox process
  status: SessionStatus;   // Current lifecycle state
  model: string | null;    // Model override for this session (null = use agent default)
  runnerId: string | null; // Runner hosting the sandbox (null in standalone mode)
  createdAt: string;       // ISO 8601 timestamp
  lastActiveAt: string;    // ISO 8601 timestamp, updated on each message
}

type SessionStatus = 'starting' | 'active' | 'paused' | 'ended' | 'error';
```

### Session Status Transitions

```
starting --> active --> paused --> active  (resume)
                   \         \--> ended    (delete)
                    \--> ended             (delete)
                    \--> error --> active   (resume)
                              \--> ended   (delete)
```

---

## Create Session

```
POST /api/sessions
```

Creates a new session for the specified agent. The server allocates a sandbox, copies the agent directory into it, and starts the bridge process. The session is returned in `active` status once the sandbox is ready.

### Request

```json
{
  "agent": "qa-bot",
  "model": "claude-opus-4-6"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `agent` | string | Yes | Name of a previously deployed agent |
| `model` | string | No | Model to use for this session. Overrides the agent's default model. Any valid model identifier accepted (e.g. `claude-sonnet-4-5-20250929`, `claude-opus-4-6`). |

### Response

**201 Created**

```json
{
  "session": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "tenantId": "default",
    "agentName": "qa-bot",
    "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "active",
    "model": "claude-opus-4-6",
    "runnerId": null,
    "createdAt": "2025-06-15T10:30:00.000Z",
    "lastActiveAt": "2025-06-15T10:30:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `400` | Missing `agent` field |
| `404` | Agent not found |
| `500` | Sandbox creation failed |
| `503` | Sandbox capacity reached or no runners available |

---

## List Sessions

```
GET /api/sessions
```

Returns all sessions for the authenticated tenant. Optionally filter by agent name.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent` | string | No | Filter sessions by agent name |

### Response

**200 OK**

```json
{
  "sessions": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "tenantId": "default",
      "agentName": "qa-bot",
      "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "active",
      "model": "claude-opus-4-6",
      "runnerId": null,
      "createdAt": "2025-06-15T10:30:00.000Z",
      "lastActiveAt": "2025-06-15T10:35:00.000Z"
    },
    {
      "id": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
      "tenantId": "default",
      "agentName": "code-reviewer",
      "sandboxId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
      "status": "paused",
      "model": null,
      "runnerId": null,
      "createdAt": "2025-06-15T09:00:00.000Z",
      "lastActiveAt": "2025-06-15T09:15:00.000Z"
    }
  ]
}
```

### Example: Filter by Agent

```
GET /api/sessions?agent=qa-bot
```

---

## Get Session

```
GET /api/sessions/:id
```

Returns a single session by ID.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Response

**200 OK**

```json
{
  "session": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "tenantId": "default",
    "agentName": "qa-bot",
    "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "active",
    "model": "claude-opus-4-6",
    "runnerId": null,
    "createdAt": "2025-06-15T10:30:00.000Z",
    "lastActiveAt": "2025-06-15T10:35:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `404` | Session not found |

---

## Pause Session

```
POST /api/sessions/:id/pause
```

Pauses an active session. The sandbox state is persisted so the session can be resumed later. Only sessions with status `active` can be paused.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Request

No request body.

### Response

**200 OK**

```json
{
  "session": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "tenantId": "default",
    "agentName": "qa-bot",
    "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "paused",
    "model": "claude-opus-4-6",
    "runnerId": null,
    "createdAt": "2025-06-15T10:30:00.000Z",
    "lastActiveAt": "2025-06-15T10:35:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `400` | Session is not in `active` status |
| `404` | Session not found |

```json
{
  "error": "Cannot pause session with status \"paused\"",
  "statusCode": 400
}
```

---

## Resume Session

```
POST /api/sessions/:id/resume
```

Resumes a paused, errored, or starting session. The server attempts two resume paths:

1. **Warm resume** -- If the original sandbox is still alive on the same runner, the session is reactivated immediately with no overhead.
2. **Cold resume** -- If the sandbox has been evicted or the runner is gone, a new sandbox is created. Workspace state is restored from a local snapshot or cloud storage if available.

Sessions with status `active` are returned as-is (no-op). Sessions with status `ended` cannot be resumed.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Request

No request body.

### Response

**200 OK**

```json
{
  "session": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "tenantId": "default",
    "agentName": "qa-bot",
    "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "active",
    "model": "claude-opus-4-6",
    "runnerId": null,
    "createdAt": "2025-06-15T10:30:00.000Z",
    "lastActiveAt": "2025-06-15T10:35:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `404` | Session or agent not found |
| `410` | Session has ended -- create a new session instead |
| `500` | Failed to create a new sandbox for cold resume |
| `503` | Sandbox capacity reached or no runners available |

```json
{
  "error": "Session has ended \u2014 create a new session",
  "statusCode": 410
}
```

---

## End Session

```
DELETE /api/sessions/:id
```

Ends a session. The sandbox state is persisted and the sandbox process is destroyed. Ended sessions cannot be resumed.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Request

No request body.

### Response

**200 OK**

```json
{
  "session": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "tenantId": "default",
    "agentName": "qa-bot",
    "sandboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "ended",
    "model": "claude-opus-4-6",
    "runnerId": null,
    "createdAt": "2025-06-15T10:30:00.000Z",
    "lastActiveAt": "2025-06-15T10:35:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `404` | Session not found |
