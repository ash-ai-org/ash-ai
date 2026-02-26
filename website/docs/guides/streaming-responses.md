---
sidebar_position: 4
title: Streaming Responses
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Streaming Responses

When you send a message to a session, the response is delivered as a Server-Sent Events (SSE) stream. Events arrive in real time as the agent thinks, uses tools, and generates text.

## SSE Event Types

The stream carries three event types:

| Event | Description |
|-------|-------------|
| `message` | An SDK message from the agent. Contains assistant text, tool use, tool results, or stream deltas. |
| `error` | An error occurred during processing. |
| `done` | The agent's turn is complete. |

Each SSE frame has the format:

```
event: message
data: {"type": "assistant", "message": {"content": [{"type": "text", "text": "Hello!"}]}}

event: done
data: {"sessionId": "a1b2c3d4-..."}
```

The `data` field of `message` events carries raw SDK message objects passed through from the Claude Code SDK. The shape varies by message type (`assistant`, `user`, `result`, `stream_event`).

## Basic Streaming

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

The `sendMessageStream` method returns an async generator of typed events:

```typescript
import { AshClient } from '@ash-ai/sdk';
import { extractTextFromEvent, extractDisplayItems } from '@ash-ai/shared';

const client = new AshClient({ serverUrl: 'http://localhost:4100', apiKey: process.env.ASH_API_KEY });
const session = await client.createSession('my-agent');

for await (const event of client.sendMessageStream(session.id, 'Explain TCP in one paragraph.')) {
  switch (event.type) {
    case 'message': {
      const text = extractTextFromEvent(event.data);
      if (text) {
        process.stdout.write(text);
      }
      break;
    }
    case 'error':
      console.error('Error:', event.data.error);
      break;
    case 'done':
      console.log('\nDone.');
      break;
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_sdk import AshClient

client = AshClient("http://localhost:4100", api_key=os.environ["ASH_API_KEY"])
session = client.create_session("my-agent")

for event in client.send_message_stream(session.id, "Explain TCP in one paragraph."):
    if event.type == "message":
        data = event.data
        # Extract text from assistant messages
        if data.get("type") == "assistant":
            content = data.get("message", {}).get("content", [])
            for block in content:
                if block.get("type") == "text":
                    print(block["text"], end="")
    elif event.type == "error":
        print(f"Error: {event.data.get('error')}")
    elif event.type == "done":
        print("\nDone.")
```

</TabItem>
<TabItem value="curl" label="curl">

Use the `-N` flag to disable output buffering so events print as they arrive:

```bash
curl -N -X POST $ASH_SERVER_URL/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!"}'
```

Output:

```
event: message
data: {"type":"assistant","message":{"content":[{"type":"text","text":"Hello! How can I help you?"}]}}

event: done
data: {"sessionId":"a1b2c3d4-..."}
```

</TabItem>
</Tabs>

## Display Items

For richer output that includes tool use and tool results, use `extractDisplayItems`:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
for await (const event of client.sendMessageStream(session.id, 'List files in /tmp')) {
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

</TabItem>
<TabItem value="python" label="Python">

```python
for event in client.send_message_stream(session.id, "List files in /tmp"):
    if event.type == "message":
        data = event.data
        if data.get("type") == "assistant":
            for block in data.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(block["text"])
                elif block.get("type") == "tool_use":
                    print(f"[Tool: {block['name']}] {block.get('input', '')}")
        elif data.get("type") == "result":
            for block in data.get("content", []):
                if block.get("type") == "text":
                    print(f"[Result] {block['text']}")
```

</TabItem>
</Tabs>

## Partial Messages (Real-Time Streaming)

By default, `message` events contain complete SDK messages. To receive incremental text deltas as the agent types, enable `includePartialMessages`:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
for await (const event of client.sendMessageStream(
  session.id,
  'Write a haiku about servers.',
  { includePartialMessages: true },
)) {
  if (event.type === 'message') {
    const delta = extractStreamDelta(event.data);
    if (delta) {
      process.stdout.write(delta); // Character-by-character streaming
    }
  }
}
```

The `extractStreamDelta` helper extracts text from `content_block_delta` stream events. It returns `null` for non-delta events, so you can safely call it on every message.

</TabItem>
<TabItem value="python" label="Python">

```python
for event in client.send_message_stream(
    session.id,
    "Write a haiku about servers.",
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

## Browser (Raw Fetch)

For browser applications that do not use the SDK, parse the SSE stream directly with `ReadableStream`:

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
      if (currentEvent === 'message') {
        // Handle message
        console.log(data);
      } else if (currentEvent === 'done') {
        console.log('Stream complete');
      } else if (currentEvent === 'error') {
        console.error(data.error);
      }
    }
  }
}
```

## Helper Functions Reference

The `@ash-ai/shared` package exports three helper functions for extracting content from stream events:

| Function | Purpose | Returns |
|----------|---------|---------|
| `extractTextFromEvent(data)` | Extract text content from assistant messages | `string \| null` |
| `extractDisplayItems(data)` | Extract structured items (text, tool use, tool results) | `DisplayItem[] \| null` |
| `extractStreamDelta(data)` | Extract incremental text from partial stream events | `string \| null` |

All three accept the `data` field from a `message` event and return `null` for events that do not match their expected type.
