---
sidebar_position: 3
title: Managing Sessions
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

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

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100', apiKey: process.env.ASH_API_KEY });
const session = await client.createSession('my-agent');
console.log(session.id);     // "a1b2c3d4-..."
console.log(session.status); // "active"
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_sdk import AshClient

client = AshClient("http://localhost:4100", api_key=os.environ["ASH_API_KEY"])
session = client.create_session("my-agent")
print(session.id)     # "a1b2c3d4-..."
print(session.status) # "active"
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session create my-agent
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions \
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
    "model": null,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "lastActiveAt": "2025-01-15T10:30:00.000Z"
  }
}
```

</TabItem>
</Tabs>

### Creating a Session with a Model Override

You can specify a model when creating a session. This overrides the agent's default model for the entire session.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.createSession('my-agent', { model: 'claude-opus-4-6' });
```

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.create_session("my-agent", model="claude-opus-4-6")
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session create my-agent --model claude-opus-4-6
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent": "my-agent", "model": "claude-opus-4-6"}'
```

</TabItem>
</Tabs>

## Sending Messages

Messages are sent via POST and return an SSE stream. See the [Streaming Responses](./streaming-responses.md) guide for full details on consuming the stream.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
for await (const event of client.sendMessageStream(session.id, 'What is the capital of France?')) {
  if (event.type === 'message') {
    console.log(event.data);
  } else if (event.type === 'done') {
    console.log('Turn complete');
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
for event in client.send_message_stream(session.id, "What is the capital of France?"):
    if event.type == "message":
        print(event.data)
    elif event.type == "done":
        print("Turn complete")
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session send <session-id> "What is the capital of France?"
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions/<session-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "What is the capital of France?"}' \
  -N
```

</TabItem>
</Tabs>

### Per-Message Model Override

You can override the model for a single message. This takes the highest precedence — it overrides both the session model and the agent's default. Useful for using a more capable model on hard tasks or a cheaper model on simple ones.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
for await (const event of client.sendMessageStream(session.id, 'Analyze this complex codebase', {
  model: 'claude-opus-4-6',
})) {
  // This message uses Opus regardless of the session/agent default
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
for event in client.send_message_stream(session.id, "Analyze this complex codebase", model="claude-opus-4-6"):
    pass  # This message uses Opus regardless of the session/agent default
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions/<session-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Analyze this complex codebase", "model": "claude-opus-4-6"}' \
  -N
```

</TabItem>
</Tabs>

## Multi-Turn Conversations

Sessions preserve full conversation context across turns. Each message builds on the previous ones.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

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

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.create_session("my-agent")

# Turn 1
for event in client.send_message_stream(session.id, "My name is Alice."):
    pass  # Agent acknowledges

# Turn 2 -- agent remembers context from turn 1
for event in client.send_message_stream(session.id, "What is my name?"):
    if event.type == "message":
        data = event.data
        if data.get("type") == "assistant":
            for block in data.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(block["text"])  # "Your name is Alice."
```

Messages are persisted to the database. You can retrieve them later:

```python
messages = client.list_messages(session.id)
for msg in messages:
    print(f"[{msg.role}] {msg.content}")
```

</TabItem>
</Tabs>

## Pausing a Session

Pausing a session marks it as idle. The sandbox may remain alive for fast resume, but the session stops accepting new messages until resumed.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.pauseSession(session.id);
console.log(session.status); // "paused"
```

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.pause_session(session.id)
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session pause <session-id>
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions/<session-id>/pause
```

</TabItem>
</Tabs>

## Resuming a Session

Resume brings a paused or errored session back to `active`. Ash uses two resume paths:

**Fast path (warm resume):** If the original sandbox is still alive, the session resumes instantly with no state loss. This is the common case when resuming shortly after pausing.

**Cold path (cold resume):** If the sandbox was reclaimed (idle timeout, OOM, server restart), Ash creates a new sandbox. Workspace state is restored from the persisted snapshot if available. Conversation history is preserved in the database regardless.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.resumeSession(session.id);
console.log(session.status); // "active"
```

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.resume_session(session.id)
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session resume <session-id>
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X POST $ASH_SERVER_URL/api/sessions/<session-id>/resume
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

</TabItem>
</Tabs>

## Ending a Session

Ending a session destroys the sandbox and marks the session as permanently closed. The session's messages and events remain in the database for retrieval, but no new messages can be sent.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.endSession(session.id);
console.log(session.status); // "ended"
```

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.end_session(session.id)
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session end <session-id>
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X DELETE $ASH_SERVER_URL/api/sessions/<session-id>
```

</TabItem>
</Tabs>

## Listing Sessions

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// All sessions
const sessions = await client.listSessions();

// Filter by agent
const sessions = await client.listSessions('my-agent');
```

</TabItem>
<TabItem value="python" label="Python">

```python
sessions = client.list_sessions()
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash session list
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
# All sessions
curl $ASH_SERVER_URL/api/sessions

# Filter by agent
curl "$ASH_SERVER_URL/api/sessions?agent=my-agent"
```

</TabItem>
</Tabs>

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
