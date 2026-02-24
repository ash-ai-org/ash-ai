# Streaming Reference

## SSE Event Types

The Ash server streams responses as Server-Sent Events (SSE). Each frame has:

```
event: <type>
data: <JSON>
```

### Core Event Types

| Event | Data Shape | Description |
|-------|-----------|-------------|
| `message` | Raw SDK message object | Complete or partial message from the agent |
| `error` | `{ error: string }` | Error during processing |
| `done` | `{ sessionId: string }` | Agent's turn is complete |

### Granular Event Types

When using the SDK's `sendMessageStream`, events are parsed into typed `AshStreamEvent` objects. Additional granular types are available:

| Event Type | Data Shape | Description |
|-----------|-----------|-------------|
| `text_delta` | `{ delta: string }` | Incremental text chunk |
| `thinking_delta` | `{ delta: string }` | Incremental reasoning/thinking chunk |
| `tool_use` | `{ id, name, input }` | Tool invocation started |
| `tool_result` | `{ tool_use_id, content, is_error? }` | Tool result returned |
| `turn_complete` | `{ numTurns?, result? }` | Agent turn finished |
| `session_start` | `{ sessionId }` | Session started |
| `session_end` | `{ sessionId }` | Session ended |

## Stream Handling Patterns

### TypeScript: Basic Streaming

```typescript
for await (const event of client.sendMessageStream(sessionId, 'Hello')) {
  switch (event.type) {
    case 'message':
      const text = extractTextFromEvent(event.data);
      if (text) console.log(text);
      break;
    case 'error':
      console.error(event.data.error);
      break;
    case 'done':
      console.log('Done.');
      break;
  }
}
```

### TypeScript: Real-Time Deltas

```typescript
for await (const event of client.sendMessageStream(sessionId, 'Write a story.', {
  includePartialMessages: true,
})) {
  if (event.type === 'message') {
    const delta = extractStreamDelta(event.data);
    if (delta) process.stdout.write(delta);
  }
}
```

### TypeScript: Structured Display Items

```typescript
for await (const event of client.sendMessageStream(sessionId, 'List files')) {
  if (event.type === 'message') {
    const items = extractDisplayItems(event.data);
    if (items) {
      for (const item of items) {
        switch (item.type) {
          case 'text':
            console.log(item.content);
            break;
          case 'tool_use':
            console.log(`[Tool: ${item.toolName}] ${item.toolInput}`);
            break;
          case 'tool_result':
            console.log(`[Result] ${item.content}`);
            break;
        }
      }
    }
  }
}
```

### Python: Basic Streaming

```python
for event in client.send_message_stream(session_id, "Hello"):
    if event.type == "message":
        data = event.data
        if data.get("type") == "assistant":
            for block in data.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(block["text"])
    elif event.type == "error":
        print(f"Error: {event.data['error']}")
    elif event.type == "done":
        print("Done.")
```

### Python: Real-Time Deltas

```python
for event in client.send_message_stream(
    session_id, "Write a story.",
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

## Raw Fetch (Browser)

```javascript
const response = await fetch('http://localhost:4100/api/sessions/SESSION_ID/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY',
  },
  body: JSON.stringify({ content: 'Hello!' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let currentEvent = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (currentEvent === 'message') console.log(data);
      else if (currentEvent === 'done') console.log('Stream complete');
      else if (currentEvent === 'error') console.error(data.error);
    }
  }
}
```

## Helper Functions

| Function | Import | Returns | Description |
|----------|--------|---------|-------------|
| `extractTextFromEvent(data)` | `@ash-ai/sdk` | `string \| null` | Text from assistant messages |
| `extractStreamDelta(data)` | `@ash-ai/sdk` | `string \| null` | Incremental text from partial stream events |
| `extractDisplayItems(data)` | `@ash-ai/sdk` | `DisplayItem[] \| null` | Structured items (text, tool use, tool result) |
| `parseSSEStream(stream)` | `@ash-ai/sdk` | `AsyncGenerator<AshStreamEvent>` | Parse raw ReadableStream into typed events |
