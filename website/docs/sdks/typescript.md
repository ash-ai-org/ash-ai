---
sidebar_position: 1
title: TypeScript SDK
---

# TypeScript SDK

The `@ash-ai/sdk` package provides a typed TypeScript client for the Ash REST API.

## Installation

```bash
npm install @ash-ai/sdk
```

## Client Setup

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key', // optional in local dev mode
});
```

The `serverUrl` is the base URL of your Ash server. Trailing slashes are stripped automatically.

When `ASH_API_KEY` is not set on the server, authentication is disabled and the `apiKey` parameter can be omitted.

## Methods Reference

### Agents

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

### Sessions

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

### Messages

#### `sendMessage(sessionId, content, opts?)` -- Raw Response

Returns a raw `Response` object with an SSE stream body. Use this when you need full control over the stream.

```typescript
const response = await client.sendMessage(sessionId, 'Hello, agent');
// response.body is a ReadableStream<Uint8Array> containing SSE frames
```

#### `sendMessageStream(sessionId, content, opts?)` -- Async Generator

Returns an async generator that yields parsed `AshStreamEvent` objects. This is the recommended way to consume messages.

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

#### Options

Both `sendMessage` and `sendMessageStream` accept an optional `SendMessageOptions` object:

```typescript
interface SendMessageOptions {
  /** Enable partial message streaming. Yields incremental StreamEvent messages
   *  with raw API deltas in addition to complete messages. */
  includePartialMessages?: boolean;
}
```

When `includePartialMessages` is `true`, the stream includes `stream_event` messages with `content_block_delta` events. Use `extractStreamDelta()` to pull text chunks from these events for real-time streaming UIs.

### Messages History

```typescript
// List persisted messages for a session
const messages = await client.listMessages(sessionId);

// With pagination
const messages = await client.listMessages(sessionId, {
  limit: 50,
  afterSequence: 10,
});
```

### Session Events (Timeline)

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

Event types: `text`, `tool_start`, `tool_result`, `reasoning`, `error`, `turn_complete`, `lifecycle`.

### Files

```typescript
// List files in a session's workspace
const { files, source } = await client.getSessionFiles(sessionId);
// source is 'sandbox' (live) or 'snapshot' (persisted)

// Read a specific file
const { path, content, size, source } = await client.getSessionFile(sessionId, 'src/index.ts');
```

### Health

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

## Full Streaming Example

```typescript
import { AshClient, extractTextFromEvent, extractStreamDelta, extractDisplayItems } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

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
