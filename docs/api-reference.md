# API Reference

Base URL: `http://localhost:4100` (configurable via `ASH_PORT`)

All request/response bodies are JSON unless noted. Error responses follow the shape `{ "error": "message", "statusCode": number }`.

> **Interactive docs**: Start the server and visit [`http://localhost:4100/docs`](http://localhost:4100/docs) for the Swagger UI. The raw OpenAPI spec is at [`/docs/json`](http://localhost:4100/docs/json) or in [`openapi.json`](./openapi.json).

## Authentication

All `/api/*` requests require a Bearer token. The server auto-generates an API key on first start (see [features/authentication.md](./features/authentication.md)):

```
Authorization: Bearer <your-api-key>
```

Public endpoints (`/health`, `/metrics`, `/docs/*`) do not require auth.

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

### `PATCH /api/agents/:name`

Update an existing agent's metadata.

**Request**:

```json
{
  "description": "Updated description",
  "model": "claude-sonnet-4-5-20250929",
  "status": "active"
}
```

All fields are optional: `name`, `slug`, `description`, `model`, `backend`, `systemPrompt`, `status`, `config`.

**Response** `200`: `{ "agent": { ... } }`

---

### `DELETE /api/agents/:name`

Delete an agent registration. Does not affect running sessions.

**Response** `200`: `{ "ok": true }`

**Errors**: `404` if not found.

---

### `GET /api/agents/:name/files`

List files in the agent's source directory.

**Response** `200`:

```json
{
  "files": [
    { "path": "CLAUDE.md", "size": 512, "modifiedAt": "2025-01-01T00:00:00.000Z" }
  ]
}
```

---

### `GET /api/agents/:name/files/:path`

Read a single file from the agent's source directory (UTF-8, 1 MB limit). Append `?format=json` for JSON-wrapped response.

**Response** `200`:

```json
{ "path": "CLAUDE.md", "content": "# My Agent\n...", "size": 512 }
```

---

## Sessions

### `POST /api/sessions`

Create a session. Spawns a sandboxed bridge process for the named agent.

**Request**:

```json
{
  "agent": "my-agent",
  "model": "claude-sonnet-4-5-20250929",
  "credentialId": "uuid",
  "extraEnv": { "MY_VAR": "value" },
  "startupScript": "pip install pandas",
  "mcpServers": {
    "my-tools": { "url": "https://my-app.com/mcp/tenant-123" }
  },
  "systemPrompt": "Custom system prompt override",
  "allowedTools": ["Bash", "Read"],
  "disallowedTools": ["Write"],
  "betas": ["interleaved-thinking"],
  "subagents": { "researcher": { "model": "claude-sonnet-4-5-20250929" } },
  "initialAgent": "researcher"
}
```

Only `agent` is required — this must be the agent **name** (the `name` field returned by `GET /api/agents`). All other fields are optional.

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

**Errors**: `400` missing agent field, `404` agent not found, `422` agent directory missing from disk (re-deploy the agent), `500` sandbox creation failed.

---

### `GET /api/sessions`

List sessions. Supports filtering and pagination.

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `agent` | string | Filter by agent name |
| `status` | string | Filter by status (`active`, `paused`, `ended`, etc.) |
| `limit` | number | Max results (default: all) |
| `offset` | number | Skip first N results |
| `includeTotal` | boolean | Include total count in response |

**Response** `200`: `{ "sessions": [{ ... }] }`

With `includeTotal=true`: `{ "sessions": [...], "total": 42 }`

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
{
  "content": "What is a closure?",
  "includePartialMessages": true,
  "model": "claude-sonnet-4-5-20250929",
  "maxTurns": 5,
  "maxBudgetUsd": 1.0,
  "effort": "high",
  "thinking": { "type": "enabled", "budgetTokens": 10000 },
  "outputFormat": { "type": "json_schema", "schema": { ... } }
}
```

Only `content` is required. All other fields are optional per-query overrides.

**Response**: SSE stream (`Content-Type: text/event-stream`)

```
event: message
data: {"type":"assistant","message":{"content":[{"type":"text","text":"A closure is..."}]}}

event: done
data: {"sessionId":"550e8400-..."}
```

**Event types**:

| Event | Data shape | Description |
|-------|-----------|-------------|
| `message` | SDK Message object | Raw SDK message (always emitted) |
| `text_delta` | `{ delta: string }` | Incremental text chunk (requires `includePartialMessages`) |
| `thinking_delta` | `{ delta: string }` | Incremental thinking chunk (requires `includePartialMessages`) |
| `tool_use` | `{ id, name, input }` | Tool invocation started |
| `tool_result` | `{ tool_use_id, content, is_error? }` | Tool result returned |
| `turn_complete` | `{ numTurns?, result? }` | Agent turn finished |
| `error` | `{ error: string }` | Mid-stream error |
| `done` | `{ sessionId: string }` | Stream complete, connection closes |

**Pre-stream errors** (returned as JSON, not SSE): `400` content missing or session not active, `404` session not found, `500` sandbox not found.

---

### `GET /api/sessions/:id/messages`

List persisted messages for a session.

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max messages to return |
| `after` | number | Return messages after this sequence number |

**Response** `200`: `{ "messages": [{ id, sessionId, role, content, sequence, createdAt }] }`

---

### `PATCH /api/sessions/:id/config`

Update session configuration mid-session. Affects subsequent queries.

**Request**:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "allowedTools": ["Bash"],
  "betas": ["interleaved-thinking"]
}
```

**Response** `200`: `{ "session": { ... } }`

---

### `POST /api/sessions/:id/stop`

Stop a running session (keeps sandbox alive for resume).

**Response** `200`: `{ "session": { ... } }`

---

### `POST /api/sessions/:id/pause`

Pause a session. Persists sandbox state for cold resume.

**Response** `200`: `{ "session": { ... } }`

---

### `POST /api/sessions/:id/resume`

Resume a paused or stopped session.

**Response** `200`: `{ "session": { ... } }`

---

### `POST /api/sessions/:id/fork`

Fork a session. Creates a new session with a copy of the workspace.

**Response** `200`: `{ "session": { ... } }`

---

### `POST /api/sessions/:id/exec`

Execute a shell command in the session's sandbox.

**Request**:

```json
{
  "command": "ls -la",
  "timeout": 30000
}
```

**Response** `200`:

```json
{
  "exitCode": 0,
  "stdout": "total 8\ndrwxr-xr-x ...",
  "stderr": ""
}
```

---

### `DELETE /api/sessions/:id`

End a session. Destroys the sandbox process.

**Response** `200`: `{ "session": { "status": "ended", ... } }`

**Errors**: `404` if not found.

---

## Session Files

Full CRUD for files in a session's workspace. Works on active, paused, and ended sessions (falls back to persisted snapshot).

### `GET /api/sessions/:id/files`

List all files in the session's workspace.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `includeHidden` | `"true"` \| `"false"` | `"true"` | Include hidden directories (`.claude`, etc.) |

**Response** `200`:

```json
{
  "files": [
    { "path": "src/index.ts", "size": 1024, "modifiedAt": "2025-01-01T00:00:00.000Z" },
    { "path": "package.json", "size": 256, "modifiedAt": "2025-01-01T00:00:00.000Z" }
  ],
  "source": "sandbox"
}
```

`source` is `"sandbox"` (live process) or `"snapshot"` (persisted after pause/end).

---

### `GET /api/sessions/:id/files/:path`

Read a single file. Two modes:

**Raw mode** (default): Streams the file bytes with proper `Content-Type` and `Content-Disposition` headers. Max 100 MB.

**JSON mode** (`?format=json`): Returns file content as a UTF-8 string wrapped in JSON. Max 1 MB.

```json
{
  "path": "src/index.ts",
  "content": "console.log('hello');",
  "size": 21,
  "source": "sandbox"
}
```

**Errors**: `400` path traversal or file too large, `404` file not found.

---

### `POST /api/sessions/:id/files`

Write one or more files to the session's workspace (batch upload).

**Request**:

```json
{
  "files": [
    { "path": "src/index.ts", "content": "Y29uc29sZS5sb2coJ2hlbGxvJyk7" },
    { "path": "data/input.json", "content": "eyJrZXkiOiAidmFsdWUifQ==" }
  ],
  "targetPath": "."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `files[].path` | string | Relative path within workspace |
| `files[].content` | string | **Base64-encoded** file content |
| `files[].mimeType` | string | Optional MIME type hint |
| `targetPath` | string | Base directory within workspace (default: `"."`) |

**Limits**: Max 500 files per request. Max 50 MB per file. Max 100 MB total per request.

**Response** `200`:

```json
{
  "files": [
    { "path": "src/index.ts", "written": true, "size": 21 },
    { "path": "data/input.json", "written": true, "size": 16 }
  ]
}
```

Failed files include an `error` field instead of `size`.

---

### `DELETE /api/sessions/:id/files/:path`

Delete a file from the session's workspace.

**Response** `200`:

```json
{ "path": "temp.txt", "deleted": true }
```

---

## Workspace Bundles

Upload/download an entire workspace as a tar.gz archive.

### `GET /api/sessions/:id/workspace`

Download the session's workspace as a tar.gz bundle.

**Response** `200` (`application/gzip`): Binary tar.gz stream.

Falls back to persisted snapshot if sandbox is not running.

---

### `POST /api/sessions/:id/workspace`

Upload a tar.gz bundle to restore the session's workspace.

**Request**:

```json
{
  "bundle": "<base64-encoded tar.gz>"
}
```

Max upload size: ~100 MB (134 MB base64-encoded).

Restores to live sandbox if available, otherwise saves as a snapshot.

**Response** `200`:

```json
{ "message": "Workspace restored to live sandbox" }
```

---

## Attachments

Upload files tied to a session. Stored on disk and optionally copied into the sandbox workspace.

### `POST /api/sessions/:id/attachments`

Upload an attachment.

**Request**:

```json
{
  "filename": "report.pdf",
  "content": "<base64-encoded content>",
  "mimeType": "application/pdf",
  "messageId": "uuid (optional)"
}
```

Max size: 10 MB (configurable via `ASH_MAX_ATTACHMENT_SIZE`).

**Response** `201`:

```json
{
  "attachment": {
    "id": "uuid",
    "sessionId": "uuid",
    "filename": "report.pdf",
    "mimeType": "application/pdf",
    "size": 102400,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

### `GET /api/sessions/:id/attachments`

List all attachments for a session.

**Response** `200`: `{ "attachments": [{ ... }] }`

---

### `GET /api/attachments/:id`

Download an attachment by ID. Returns raw bytes with proper `Content-Type`.

---

### `DELETE /api/attachments/:id`

Delete an attachment (removes from disk and database).

**Response** `204` (no body).

---

## Session Events

Timeline events extracted from SDK messages. Useful for building activity feeds.

### `GET /api/sessions/:id/events`

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max events to return |
| `after` | number | Return events after this sequence number |
| `type` | string | Filter by event type |

**Event types**: `text`, `tool_start`, `tool_result`, `reasoning`, `error`, `turn_complete`, `lifecycle`.

**Response** `200`: `{ "events": [{ id, sessionId, type, data, sequence, createdAt }] }`

---

## Session Logs

### `GET /api/sessions/:id/logs`

Get sandbox stdout/stderr logs for a session.

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `after` | number | Return logs after this index |

**Response** `200`:

```json
{
  "logs": [
    { "index": 0, "level": "stdout", "text": "Bridge started", "ts": "2025-01-01T00:00:00.000Z" }
  ],
  "source": "sandbox"
}
```

---

## Credentials

Store API keys for injection into sandbox environments.

### `POST /api/credentials`

**Request**: `{ "type": "anthropic", "key": "sk-...", "label": "My Key" }`

**Response** `201`: `{ "credential": { id, type, label, active, createdAt } }`

The raw key is never returned after creation.

### `GET /api/credentials`

**Response** `200`: `{ "credentials": [{ ... }] }`

### `DELETE /api/credentials/:id`

**Response** `200`: `{ "ok": true }`

---

## Queue

Async job queue for batch processing.

### `POST /api/queue`

Enqueue a prompt for background processing.

**Request**:

```json
{
  "agentName": "my-agent",
  "prompt": "Analyze this data",
  "sessionId": "uuid (optional — reuse existing session)",
  "priority": 0,
  "maxRetries": 3
}
```

**Response** `201`: `{ "item": { id, status: "pending", ... } }`

### `GET /api/queue`

List queue items. Filter by `?status=pending` or `?limit=10`.

### `GET /api/queue/:id`

Get one queue item.

### `DELETE /api/queue/:id`

Cancel a queue item.

### `GET /api/queue/stats`

**Response** `200`: `{ "stats": { pending, processing, completed, failed, cancelled } }`

---

## Usage

Track token consumption and costs.

### `GET /api/usage`

List usage events. Filter by `?sessionId=...` or `?agentName=...`.

**Response** `200`: `{ "events": [{ id, sessionId, agentName, eventType, value, createdAt }] }`

### `GET /api/usage/stats`

Aggregate usage stats. Same filters as above.

**Response** `200`:

```json
{
  "stats": {
    "totalInputTokens": 50000,
    "totalOutputTokens": 12000,
    "totalCacheCreationTokens": 8000,
    "totalCacheReadTokens": 30000,
    "totalToolCalls": 45,
    "totalMessages": 20,
    "totalComputeSeconds": 120
  }
}
```

---

## TypeScript Types

All types are exported from `@ash-ai/shared` and re-exported from `@ash-ai/sdk`:

```typescript
import type {
  // Core
  Agent, AgentUpdate, Session, SessionStatus, SessionConfig,
  HealthResponse, PoolStats,

  // Requests
  CreateSessionRequest, SendMessageRequest, DeployAgentRequest,
  UpdateSessionConfigRequest, WriteSessionFilesRequest,

  // Responses
  ListAgentsResponse, ListSessionsResponse, ListSessionsWithTotalResponse,
  ListMessagesResponse, ListSessionEventsResponse, ListSessionLogsResponse,
  ListFilesResponse, GetFileResponse, WriteSessionFilesResponse,
  DeleteSessionFileResponse, ListAttachmentsResponse,
  ListCredentialsResponse, ListUsageResponse, ListQueueResponse,
  ListProjectFilesResponse,
  ApiError,

  // Files
  FileEntry, WriteFileInput, WriteFileResult,
  Attachment, Credential, UsageEvent, UsageStats,
  QueueItem, QueueItemStatus, QueueStats,

  // SSE stream events
  AshStreamEvent, AshMessageEvent, AshErrorEvent, AshDoneEvent,
  AshTextDeltaEvent, AshThinkingDeltaEvent, AshToolUseEvent,
  AshToolResultEvent, AshTurnCompleteEvent,

  // Message parsing
  MessageContent, parseMessageContent,
  DisplayItem, extractDisplayItems, extractTextFromEvent, extractStreamDelta,
} from '@ash-ai/sdk';
```

## SDK Client

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'ash_...',
});
```

### Agents

```typescript
const agent = await client.createAgent('my-agent', {
  description: 'A helpful assistant',
  model: 'claude-sonnet-4-5-20250929',
  systemPrompt: '# My Agent\nYou are helpful.',
});

const agents = await client.listAgents();
const agent = await client.getAgent('my-agent');
await client.updateAgent('my-agent', { description: 'Updated' });
await client.deleteAgent('my-agent');

// Agent files
const { files } = await client.listAgentFiles('my-agent');
const { content } = await client.getAgentFile('my-agent', 'CLAUDE.md');
```

### Sessions

```typescript
// Create
const session = await client.createSession('my-agent', {
  model: 'claude-sonnet-4-5-20250929',
  mcpServers: { tools: { url: 'https://my-app.com/mcp' } },
  systemPrompt: 'Custom prompt',
});

// List with filters
const sessions = await client.listSessions({ agent: 'my-agent', status: 'active', limit: 10 });
const { sessions, total } = await client.listSessionsWithTotal({ limit: 10 });

// Lifecycle
await client.stopSession(session.id);
await client.pauseSession(session.id);
await client.resumeSession(session.id);
const forked = await client.forkSession(session.id);
await client.endSession(session.id);

// Config
await client.updateSessionConfig(session.id, { model: 'claude-sonnet-4-5-20250929' });
```

### Messages

```typescript
// Stream a response
for await (const event of client.sendMessageStream(session.id, 'Hello', {
  includePartialMessages: true,
  maxTurns: 5,
})) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.data.delta);
      break;
    case 'tool_use':
      console.log(`Tool: ${event.data.name}`);
      break;
    case 'error':
      console.error(event.data.error);
      break;
  }
}

// List persisted messages
const messages = await client.listMessages(session.id, { limit: 50 });
```

### Files

```typescript
// List files in workspace
const { files, source } = await client.getSessionFiles(session.id);
// source: 'sandbox' (live) or 'snapshot' (persisted)

// Read a file as JSON
const { path, content, size } = await client.getSessionFile(session.id, 'src/index.ts');

// Download raw bytes (large files, binary files)
const { buffer, mimeType } = await client.downloadSessionFile(session.id, 'output.png');

// Stream a download (for proxying to browser)
const response = await client.downloadSessionFileRaw(session.id, 'large-file.zip');

// Upload files (base64-encoded content)
await client.writeSessionFiles(session.id, [
  { path: 'src/index.ts', content: Buffer.from('console.log("hello")').toString('base64') },
  { path: 'data/config.json', content: Buffer.from('{"key": "value"}').toString('base64') },
]);

// Upload to a subdirectory
await client.writeSessionFiles(session.id, [
  { path: 'model.py', content: b64content },
], 'src/models');

// Delete a file
await client.deleteSessionFile(session.id, 'temp.txt');
```

### Workspace Bundles

```typescript
// Download entire workspace as tar.gz
const bundle = await client.downloadWorkspace(session.id);
fs.writeFileSync('workspace.tar.gz', bundle);

// Upload/restore workspace from tar.gz
const bundle = fs.readFileSync('workspace.tar.gz');
await client.uploadWorkspace(session.id, bundle);
```

### Attachments

```typescript
// Upload an attachment
const attachment = await client.uploadAttachment(
  session.id,
  'report.pdf',
  pdfBuffer,
  { mimeType: 'application/pdf' },
);

// List attachments
const attachments = await client.listAttachments(session.id);

// Download
const data = await client.downloadAttachment(attachment.id);

// Delete
await client.deleteAttachment(attachment.id);
```

### Shell Execution

```typescript
const { exitCode, stdout, stderr } = await client.exec(session.id, 'ls -la', {
  timeout: 30000,
});
```

### Events and Logs

```typescript
// Session events (timeline)
const events = await client.listSessionEvents(session.id, {
  type: 'tool_start',
  limit: 50,
});

// Sandbox logs
const { logs } = await client.getSessionLogs(session.id, { after: 0 });
```

### Credentials

```typescript
const cred = await client.storeCredential('anthropic', 'sk-...', 'My Key');
const creds = await client.listCredentials();
await client.deleteCredential(cred.id);
```

### Queue

```typescript
const item = await client.enqueue('my-agent', 'Analyze this data', {
  priority: 1,
  maxRetries: 3,
});
const items = await client.listQueueItems({ status: 'pending' });
const stats = await client.getQueueStats();
await client.cancelQueueItem(item.id);
```

### Usage

```typescript
const events = await client.listUsageEvents({ sessionId: session.id });
const stats = await client.getUsageStats({ agentName: 'my-agent' });
```

### Health

```typescript
const health = await client.health();
console.log(`Active sessions: ${health.activeSessions}`);
```

---

`parseSSEStream(stream: ReadableStream<Uint8Array>)` is also exported for parsing SSE streams directly (used by the qa-bot Next.js app to parse proxied streams in the browser).
