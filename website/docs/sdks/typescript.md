---
sidebar_position: 1
title: TypeScript SDK
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# TypeScript SDK

The `@ash-ai/sdk` package provides a typed TypeScript client for the Ash REST API.

## Installation

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```bash
npm install @ash-ai/sdk
```

</TabItem>
<TabItem value="python" label="Python">

```bash
pip install ash-ai-sdk
```

</TabItem>
</Tabs>

## Client Setup

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key',
});
```

The `serverUrl` is the base URL of your Ash server. Trailing slashes are stripped automatically.

The server always requires authentication. If you used `ash start`, the CLI saves the auto-generated key to `~/.ash/config.json`. For SDK usage, pass the key explicitly.

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key="your-api-key",
)
```

The `server_url` is the base URL of your Ash server. The `api_key` is required — the server always requires authentication.

</TabItem>
</Tabs>

## Methods Reference

### Agents

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// Deploy an agent from a directory path on the server
const agent = await client.deployAgent('my-agent', '/path/to/agent');

// List all deployed agents
const agents = await client.listAgents();

// Get a specific agent by name
const agent = await client.getAgent('my-agent');

// Delete an agent (also deletes its sessions)
await client.deleteAgent('my-agent');
```

</TabItem>
<TabItem value="python" label="Python">

```python
# Deploy an agent from a directory path on the server
agent = client.deploy_agent(name="my-agent", path="/path/to/agent")

# List all deployed agents
agents = client.list_agents()

# Get a specific agent by name
agent = client.get_agent("my-agent")

# Delete an agent (also deletes its sessions)
client.delete_agent("my-agent")
```

</TabItem>
</Tabs>

### Sessions

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// Create a new session for an agent
const session = await client.createSession('my-agent');

// List all sessions (optionally filter by agent name)
const sessions = await client.listSessions();
const agentSessions = await client.listSessions('my-agent');

// Get a session by ID
const session = await client.getSession(sessionId);

// Pause a session (persists workspace state)
const paused = await client.pauseSession(sessionId);

// Resume a paused or errored session
const resumed = await client.resumeSession(sessionId);

// End a session permanently
const ended = await client.endSession(sessionId);
```

</TabItem>
<TabItem value="python" label="Python">

```python
# Create a new session for an agent
session = client.create_session("my-agent")

# List all sessions (optionally filter by agent name)
sessions = client.list_sessions()
agent_sessions = client.list_sessions(agent="my-agent")

# Get a session by ID
session = client.get_session(session_id)

# Pause a session (persists workspace state)
paused = client.pause_session(session_id)

# Resume a paused or errored session
resumed = client.resume_session(session_id)

# End a session permanently
ended = client.end_session(session_id)
```

</TabItem>
</Tabs>

### Messages

#### Streaming Messages (Recommended)

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

`sendMessageStream(sessionId, content, opts?)` returns an async generator that yields parsed `AshStreamEvent` objects:

```typescript
for await (const event of client.sendMessageStream(sessionId, 'Analyze this code')) {
  if (event.type === 'message') {
    console.log('SDK message:', event.data);
  } else if (event.type === 'error') {
    console.error('Error:', event.data.error);
  } else if (event.type === 'done') {
    console.log('Turn complete for session:', event.data.sessionId);
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

`send_message_stream(session_id, content, **kwargs)` returns an iterator of parsed events:

```python
for event in client.send_message_stream(session_id, "Analyze this code"):
    if event.type == "message":
        print("SDK message:", event.data)
    elif event.type == "error":
        print(f"Error: {event.data['error']}")
    elif event.type == "done":
        print(f"Turn complete for session: {event.data['sessionId']}")
```

</TabItem>
</Tabs>

#### Raw Response (TypeScript only)

`sendMessage(sessionId, content, opts?)` returns a raw `Response` object with an SSE stream body. Use this when you need full control over the stream.

```typescript
const response = await client.sendMessage(sessionId, 'Hello, agent');
// response.body is a ReadableStream<Uint8Array> containing SSE frames
```

#### Options

Both methods accept options for partial message streaming:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
interface SendMessageOptions {
  /** Enable partial message streaming. Yields incremental StreamEvent messages
   *  with raw API deltas in addition to complete messages. */
  includePartialMessages?: boolean;
}
```

When `includePartialMessages` is `true`, the stream includes `stream_event` messages with `content_block_delta` events. Use `extractStreamDelta()` to pull text chunks from these events for real-time streaming UIs.

</TabItem>
<TabItem value="python" label="Python">

```python
# Enable partial message streaming with the include_partial_messages kwarg
for event in client.send_message_stream(
    session_id,
    "Write a haiku.",
    include_partial_messages=True,
):
    if event.type == "message":
        data = event.data
        if data.get("type") == "stream_event":
            evt = data.get("event", {})
            if evt.get("type") == "content_block_delta":
                delta = evt.get("delta", {})
                if delta.get("type") == "text_delta":
                    print(delta.get("text", ""), end="", flush=True)
```

</TabItem>
</Tabs>

### Messages History

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// List persisted messages for a session
const messages = await client.listMessages(sessionId);

// With pagination
const messages = await client.listMessages(sessionId, {
  limit: 50,
  afterSequence: 10,
});
```

</TabItem>
<TabItem value="python" label="Python">

```python
# List persisted messages for a session
messages = client.list_messages(session_id)

# With pagination
messages = client.list_messages(session_id, limit=50, after_sequence=10)
```

</TabItem>
</Tabs>

### Session Events (Timeline)

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// List timeline events for a session
const events = await client.listSessionEvents(sessionId);

// Filter by type and paginate
const textEvents = await client.listSessionEvents(sessionId, {
  type: 'text',
  limit: 100,
  afterSequence: 0,
});
```

</TabItem>
<TabItem value="python" label="Python">

```python
# List timeline events for a session
events = client.list_session_events(session_id)

# Filter by type and paginate
text_events = client.list_session_events(session_id, type="text", limit=100, after_sequence=0)
```

</TabItem>
</Tabs>

Event types: `text`, `tool_start`, `tool_result`, `reasoning`, `error`, `turn_complete`, `lifecycle`.

### Files

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// List files in a session's workspace
const { files, source } = await client.getSessionFiles(sessionId);
// source is 'sandbox' (live) or 'snapshot' (persisted)

// Read a specific file
const { path, content, size, source } = await client.getSessionFile(sessionId, 'src/index.ts');
```

</TabItem>
<TabItem value="python" label="Python">

```python
import httpx

# List files in a session's workspace
resp = httpx.get(f"http://localhost:4100/api/sessions/{session_id}/files")
data = resp.json()
# data["source"] is "sandbox" (live) or "snapshot" (persisted)

# Read a specific file
resp = httpx.get(f"http://localhost:4100/api/sessions/{session_id}/files/src/index.ts")
file_data = resp.json()
```

</TabItem>
</Tabs>

### Health

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const health = await client.health();
// {
//   status: 'ok',
//   activeSessions: 3,
//   activeSandboxes: 2,
//   uptime: 3600,
//   pool: { total: 5, cold: 2, warming: 0, warm: 1, waiting: 1, running: 1, maxCapacity: 1000, ... }
// }
```

</TabItem>
<TabItem value="python" label="Python">

```python
health = client.health()
# {
#   "status": "ok",
#   "activeSessions": 3,
#   "activeSandboxes": 2,
#   "uptime": 3600,
#   "pool": { "total": 5, "cold": 2, "warming": 0, "warm": 1, ... }
# }
```

</TabItem>
</Tabs>

## Full Streaming Example

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient, extractTextFromEvent, extractStreamDelta, extractDisplayItems } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

// Deploy and create session
const agent = await client.deployAgent('helper', '/path/to/agent');
const session = await client.createSession('helper');

// Stream with partial messages for real-time output
for await (const event of client.sendMessageStream(session.id, 'Write a haiku', {
  includePartialMessages: true,
})) {
  if (event.type === 'message') {
    // Extract incremental text deltas for real-time display
    const delta = extractStreamDelta(event.data);
    if (delta) {
      process.stdout.write(delta);
      continue;
    }

    // Extract complete text from finished assistant messages
    const text = extractTextFromEvent(event.data);
    if (text) {
      console.log('\nComplete:', text);
    }

    // Extract structured display items (text, tool use, tool results)
    const items = extractDisplayItems(event.data);
    if (items) {
      for (const item of items) {
        if (item.type === 'tool_use') {
          console.log(`Tool: ${item.toolName} (${item.toolInput})`);
        }
      }
    }
  } else if (event.type === 'error') {
    console.error('Error:', event.data.error);
  } else if (event.type === 'done') {
    console.log('Done.');
  }
}

// Clean up
await client.endSession(session.id);
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key=os.environ.get("ASH_API_KEY"),
)

# Deploy and create session
agent = client.deploy_agent(name="helper", path="/path/to/agent")
session = client.create_session("helper")

# Stream with partial messages for real-time output
for event in client.send_message_stream(session.id, "Write a haiku",
    include_partial_messages=True,
):
    if event.type == "message":
        data = event.data

        # Extract incremental text deltas for real-time display
        if data.get("type") == "stream_event":
            evt = data.get("event", {})
            if evt.get("type") == "content_block_delta":
                delta = evt.get("delta", {})
                if delta.get("type") == "text_delta":
                    print(delta.get("text", ""), end="", flush=True)
                    continue

        # Extract complete text from finished assistant messages
        if data.get("type") == "assistant":
            for block in data.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(f"\nComplete: {block['text']}")
                elif block.get("type") == "tool_use":
                    print(f"Tool: {block['name']} ({block.get('input', '')})")

    elif event.type == "error":
        print(f"Error: {event.data.get('error')}")
    elif event.type == "done":
        print("Done.")

# Clean up
client.end_session(session.id)
```

</TabItem>
</Tabs>

## Helper Functions

The SDK re-exports these helpers from `@ash-ai/shared`:

| Function | Description |
|----------|-------------|
| `extractDisplayItems(data)` | Extract structured display items (text, tool use, tool result) from an SDK message. Returns `DisplayItem[]` or `null`. |
| `extractTextFromEvent(data)` | Extract plain text content from an assistant message. Returns `string` or `null`. |
| `extractStreamDelta(data)` | Extract incremental text delta from a `stream_event` / `content_block_delta`. Only yields values when `includePartialMessages` is enabled. Returns `string` or `null`. |
| `parseSSEStream(stream)` | Parse a `ReadableStream<Uint8Array>` into an async generator of `AshStreamEvent`. Works in both Node.js and browser. |

## Re-exported Types

The SDK re-exports these types from `@ash-ai/shared`:

```typescript
// Core entities
Agent, Session, SessionStatus

// Request/Response
CreateSessionRequest, SendMessageRequest, DeployAgentRequest
ListAgentsResponse, ListSessionsResponse, HealthResponse, ApiError

// SSE streaming
AshSSEEventType, AshMessageEvent, AshErrorEvent, AshDoneEvent, AshStreamEvent

// Display helpers
DisplayItem, DisplayItemType

// Files
FileEntry, ListFilesResponse, GetFileResponse
```

## Error Handling

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

All methods throw on non-2xx responses. The error message is extracted from the API response body.

```typescript
try {
  const session = await client.createSession('nonexistent-agent');
} catch (err) {
  // err.message === 'Agent "nonexistent-agent" not found'
  console.error(err.message);
}
```

For streaming, errors can arrive both as thrown exceptions (connection failures) and as `error` events within the stream (agent-level errors):

```typescript
try {
  for await (const event of client.sendMessageStream(sessionId, 'hello')) {
    if (event.type === 'error') {
      // Agent-level error (e.g., sandbox crash, SDK error)
      console.error('Stream error:', event.data.error);
    }
  }
} catch (err) {
  // Connection-level error (e.g., network failure, 404)
  console.error('Connection error:', err.message);
}
```

</TabItem>
<TabItem value="python" label="Python">

All methods raise on non-2xx responses:

```python
from ash_ai import AshApiError

try:
    session = client.create_session(agent="nonexistent")
except AshApiError as e:
    print(f"API error ({e.status_code}): {e.message}")
except Exception as e:
    print(f"Connection error: {e}")
```

For streaming, errors can arrive both as exceptions (connection failures) and as `error` events within the stream (agent-level errors):

```python
try:
    for event in client.send_message_stream(session_id, "hello"):
        if event.type == "error":
            # Agent-level error (e.g., sandbox crash, SDK error)
            print(f"Stream error: {event.data.get('error')}")
except Exception as e:
    # Connection-level error (e.g., network failure, 404)
    print(f"Connection error: {e}")
```

</TabItem>
</Tabs>
