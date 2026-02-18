# API Reference

Base URL: `http://localhost:4100` (configurable via `ASH_PORT`)

All request/response bodies are JSON unless noted. Error responses follow the shape `{ "error": "message", "statusCode": number }`.

> **Interactive docs**: Start the server and visit [`http://localhost:4100/docs`](http://localhost:4100/docs) for the Swagger UI. The raw OpenAPI spec is at [`/docs/json`](http://localhost:4100/docs/json) or in [`openapi.json`](./openapi.json).

## Authentication

If `ASH_API_KEY` is set on the server, all `/api/*` requests require a Bearer token:

```
Authorization: Bearer <your-api-key>
```

Public endpoints (`/health`, `/metrics`, `/docs/*`) do not require auth. See [features/authentication.md](./features/authentication.md) for setup and details.

| Status | Meaning |
|--------|---------|
| `401` | Missing `Authorization` header or invalid API key |

---

## Health

### `GET /health`

Server liveness and load.

**Response** `200`:

```json
{
  "status": "ok",
  "activeSessions": 2,
  "activeSandboxes": 2,
  "uptime": 347,
  "pool": {
    "total": 5,
    "cold": 2,
    "warming": 0,
    "warm": 1,
    "waiting": 1,
    "running": 1,
    "maxCapacity": 1000,
    "resumeWarmHits": 12,
    "resumeColdHits": 3
  }
}
```

| Field | Description |
|-------|-------------|
| `uptime` | Seconds since process start |
| `pool.resumeWarmHits` | Monotonic counter: resumes where sandbox was still alive |
| `pool.resumeColdHits` | Monotonic counter: resumes that spawned a new sandbox |

### `GET /metrics`

Prometheus text exposition format (version 0.0.4). See [features/metrics.md](./features/metrics.md) for the full metric list and example queries.

**Response** `200` (`text/plain`):

```
# HELP ash_up Whether the Ash server is up (always 1 if reachable).
# TYPE ash_up gauge
ash_up 1

# HELP ash_resume_total Total session resumes by path.
# TYPE ash_resume_total counter
ash_resume_total{path="warm"} 12
ash_resume_total{path="cold"} 3
```

---

## Agents

### `POST /api/agents`

Deploy (register) an agent. Upserts — if the name exists, the version increments.

**Request**:

```json
{
  "name": "my-agent",
  "path": "/absolute/path/to/agent-dir"
}
```

The directory at `path` must contain a `CLAUDE.md` file.

**Response** `201`:

```json
{
  "agent": {
    "name": "my-agent",
    "version": 1,
    "path": "/absolute/path/to/agent-dir",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Errors**: `400` if `name`/`path` missing or no `CLAUDE.md` in directory.

---

### `GET /api/agents`

List all registered agents.

**Response** `200`:

```json
{ "agents": [{ "name": "...", "version": 1, "path": "...", ... }] }
```

---

### `GET /api/agents/:name`

Get one agent.

**Response** `200`: `{ "agent": { ... } }`

**Errors**: `404` if not found.

---

### `DELETE /api/agents/:name`

Delete an agent registration. Does not affect running sessions.

**Response** `200`: `{ "ok": true }`

**Errors**: `404` if not found.

---

## Sessions

### `POST /api/sessions`

Create a session. Spawns a sandboxed bridge process for the named agent.

**Request**:

```json
{ "agent": "my-agent" }
```

**Response** `201`:

```json
{
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "agentName": "my-agent",
    "sandboxId": "sandbox-uuid",
    "status": "active",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "lastActiveAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Errors**: `400` missing agent field, `404` agent not found, `500` sandbox creation failed.

---

### `GET /api/sessions`

List all sessions (all statuses). Optionally filter by agent name.

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `agent` | string | Filter sessions by agent name (optional) |

**Example**: `GET /api/sessions?agent=my-agent`

**Response** `200`: `{ "sessions": [{ ... }] }`

---

### `GET /api/sessions/:id`

Get one session.

**Response** `200`: `{ "session": { ... } }`

**Errors**: `404` if not found.

---

### `POST /api/sessions/:id/messages`

Send a message and receive a streaming response.

**Request**:

```json
{ "content": "What is a closure?" }
```

**Response**: SSE stream (`Content-Type: text/event-stream`)

```
event: message
data: {"type":"assistant","message":{"content":"A closure is..."}}

event: message
data: {"type":"assistant","message":{"content":" a function that..."}}

event: done
data: {"sessionId":"550e8400-..."}
```

**Event types**:

| Event | Data shape | Description |
|-------|-----------|-------------|
| `message` | `{ type: "assistant", message: { content: string } }` | SDK message (streamed token by token) |
| `error` | `{ error: string }` | Mid-stream error |
| `done` | `{ sessionId: string }` | Turn complete, stream closes |

**Pre-stream errors** (returned as JSON, not SSE): `400` content missing or session not active, `404` session not found, `500` sandbox not found.

---

### `DELETE /api/sessions/:id`

End a session. Destroys the sandbox process.

**Response** `200`:

```json
{
  "session": {
    "id": "...",
    "status": "ended",
    ...
  }
}
```

**Errors**: `404` if not found.

---

## TypeScript Types

All types are exported from `ash-shared` and re-exported from `ash-sdk`:

```typescript
import type {
  Agent,
  Session,
  SessionStatus,          // 'starting' | 'active' | 'paused' | 'ended' | 'error'
  HealthResponse,
  CreateSessionRequest,   // { agent: string }
  SendMessageRequest,     // { content: string }
  DeployAgentRequest,     // { name: string, path: string }
  ListAgentsResponse,     // { agents: Agent[] }
  ListSessionsResponse,   // { sessions: Session[] }
  ApiError,               // { error: string, statusCode: number }
  AshStreamEvent,         // AshMessageEvent | AshErrorEvent | AshDoneEvent
  AshMessageEvent,        // { type: 'message', data: { type: 'assistant', message: { content: string } } }
  AshErrorEvent,          // { type: 'error', data: { error: string } }
  AshDoneEvent,           // { type: 'done', data: { sessionId: string } }
} from '@ash-ai/sdk';
```

## SDK Client

```typescript
import { AshClient, parseSSEStream } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

// Deploy an agent
await client.deployAgent('my-agent', '/path/to/agent');

// Create a session
const session = await client.createSession('my-agent');

// Stream a response
for await (const event of client.sendMessageStream(session.id, 'Hello')) {
  if (event.type === 'message') {
    process.stdout.write(event.data.message.content);
  }
}

// End session
await client.endSession(session.id);
```

`parseSSEStream(stream: ReadableStream<Uint8Array>)` is also exported for parsing SSE streams directly (used by the qa-bot Next.js app to parse proxied streams in the browser).
