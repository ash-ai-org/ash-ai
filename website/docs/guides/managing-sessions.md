---
sidebar_position: 3
title: Managing Sessions
---

# Managing Sessions

A session is a stateful conversation between a client and a deployed agent. Each session runs inside an isolated sandbox with its own workspace directory. Sessions persist messages across turns and can be paused, resumed, and ended.

## Session States

| State | Description |
|-------|-------------|
| `starting` | Sandbox is being created. Transitions to `active` on success or `error` on failure. |
| `active` | Sandbox is running and accepting messages. |
| `paused` | Sandbox may still be alive but the session is idle. Can be resumed. |
| `ended` | Session is terminated. Sandbox is destroyed. Cannot be resumed. |
| `error` | Something went wrong (sandbox crash, runner unavailable). Can be resumed. |

State transitions:

```
starting --> active --> paused --> active (resume)
                   \           \-> ended
                    \-> error --> active (resume)
                             \-> ended
```

## Creating a Session

### CLI

```bash
ash session create my-agent
```

### TypeScript SDK

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });
const session = await client.createSession('my-agent');
console.log(session.id);     // "a1b2c3d4-..."
console.log(session.status); // "active"
```

### Python SDK

```python
from ash_sdk import AshClient

client = AshClient("http://localhost:4100")
session = client.create_session("my-agent")
print(session.id)     # "a1b2c3d4-..."
print(session.status) # "active"
```

### curl

```bash
curl -X POST http://localhost:4100/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent": "my-agent"}'
```

Response (201):

```json
{
  "session": {
    "id": "a1b2c3d4-...",
    "agentName": "my-agent",
    "sandboxId": "a1b2c3d4-...",
    "status": "active",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "lastActiveAt": "2025-01-15T10:30:00.000Z"
  }
}
```

## Sending Messages

Messages are sent via POST and return an SSE stream. See the [Streaming Responses](./streaming-responses.md) guide for full details on consuming the stream.

### CLI

```bash
ash session send <session-id> "What is the capital of France?"
```

### TypeScript SDK

```typescript
for await (const event of client.sendMessageStream(session.id, 'What is the capital of France?')) {
  if (event.type === 'message') {
    console.log(event.data);
  } else if (event.type === 'done') {
    console.log('Turn complete');
  }
}
```

### Python SDK

```python
for event in client.send_message_stream(session.id, "What is the capital of France?"):
    if event.type == "message":
        print(event.data)
    elif event.type == "done":
        print("Turn complete")
```

### curl

```bash
curl -X POST http://localhost:4100/api/sessions/<session-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "What is the capital of France?"}' \
  -N
```

## Multi-Turn Conversations

Sessions preserve full conversation context across turns. Each message builds on the previous ones.

```typescript
const session = await client.createSession('my-agent');

// Turn 1
for await (const event of client.sendMessageStream(session.id, 'My name is Alice.')) {
  // Agent acknowledges
}

// Turn 2 -- agent remembers context from turn 1
for await (const event of client.sendMessageStream(session.id, 'What is my name?')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) console.log(text); // "Your name is Alice."
  }
}
```

Messages are persisted to the database. You can retrieve them later:

```typescript
const messages = await client.listMessages(session.id);
for (const msg of messages) {
  console.log(`[${msg.role}] ${msg.content}`);
}
```

## Pausing a Session

Pausing a session marks it as idle. The sandbox may remain alive for fast resume, but the session stops accepting new messages until resumed.

### CLI

```bash
ash session pause <session-id>
```

### TypeScript SDK

```typescript
const session = await client.pauseSession(session.id);
console.log(session.status); // "paused"
```

### Python SDK

```python
session = client.pause_session(session.id)
```

### curl

```bash
curl -X POST http://localhost:4100/api/sessions/<session-id>/pause
```

## Resuming a Session

Resume brings a paused or errored session back to `active`. Ash uses two resume paths:

**Fast path (warm resume):** If the original sandbox is still alive, the session resumes instantly with no state loss. This is the common case when resuming shortly after pausing.

**Cold path (cold resume):** If the sandbox was reclaimed (idle timeout, OOM, server restart), Ash creates a new sandbox. Workspace state is restored from the persisted snapshot if available. Conversation history is preserved in the database regardless.

### CLI

```bash
ash session resume <session-id>
```

### TypeScript SDK

```typescript
const session = await client.resumeSession(session.id);
console.log(session.status); // "active"
```

### Python SDK

```python
session = client.resume_session(session.id)
```

### curl

```bash
curl -X POST http://localhost:4100/api/sessions/<session-id>/resume
```

Response includes the resume path taken:

```json
{
  "session": {
    "id": "a1b2c3d4-...",
    "status": "active",
    "sandboxId": "a1b2c3d4-..."
  }
}
```

## Ending a Session

Ending a session destroys the sandbox and marks the session as permanently closed. The session's messages and events remain in the database for retrieval, but no new messages can be sent.

### CLI

```bash
ash session end <session-id>
```

### TypeScript SDK

```typescript
const session = await client.endSession(session.id);
console.log(session.status); // "ended"
```

### Python SDK

```python
session = client.end_session(session.id)
```

### curl

```bash
curl -X DELETE http://localhost:4100/api/sessions/<session-id>
```

## Listing Sessions

### CLI

```bash
ash session list
```

### TypeScript SDK

```typescript
// All sessions
const sessions = await client.listSessions();

// Filter by agent
const sessions = await client.listSessions('my-agent');
```

### Python SDK

```python
sessions = client.list_sessions()
```

### curl

```bash
# All sessions
curl http://localhost:4100/api/sessions

# Filter by agent
curl http://localhost:4100/api/sessions?agent=my-agent
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions` | List sessions (optional `?agent=` filter) |
| `GET` | `/api/sessions/:id` | Get session details |
| `POST` | `/api/sessions/:id/messages` | Send a message (returns SSE stream) |
| `GET` | `/api/sessions/:id/messages` | List persisted messages |
| `POST` | `/api/sessions/:id/pause` | Pause a session |
| `POST` | `/api/sessions/:id/resume` | Resume a session |
| `DELETE` | `/api/sessions/:id` | End a session |
