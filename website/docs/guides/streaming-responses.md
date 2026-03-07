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

## Error Handling

Errors can arrive at two levels: **connection errors** (network failure, server restart) throw exceptions, and **agent errors** (sandbox crash, SDK error) arrive as `error` events within the stream. Handle both:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
try {
  for await (const event of client.sendMessageStream(sessionId, 'Hello')) {
    if (event.type === 'message') {
      const text = extractTextFromEvent(event.data);
      if (text) process.stdout.write(text);
    } else if (event.type === 'error') {
      // Agent-level error (sandbox crash, OOM, SDK error)
      console.error('Agent error:', event.data.error);
    } else if (event.type === 'done') {
      console.log('\nDone.');
    }
  }
} catch (err) {
  // Connection-level error (network failure, server restart, 404)
  console.error('Connection error:', err.message);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
try:
    for event in client.send_message_stream(session_id, "Hello"):
        if event.type == "message":
            data = event.data
            if data.get("type") == "assistant":
                for block in data.get("message", {}).get("content", []):
                    if block.get("type") == "text":
                        print(block["text"], end="")
        elif event.type == "error":
            # Agent-level error (sandbox crash, OOM, SDK error)
            print(f"Agent error: {event.data.get('error')}")
        elif event.type == "done":
            print("\nDone.")
except Exception as e:
    # Connection-level error (network failure, server restart)
    print(f"Connection error: {e}")
```

</TabItem>
</Tabs>

## Reconnection with Retry

When an SSE stream disconnects (server restart, network blip, load balancer timeout), retry with exponential backoff. If the session's sandbox was destroyed, resume it before retrying.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamWithRetry(
  sessionId: string,
  content: string,
  maxRetries = 3,
): Promise<string> {
  let fullText = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      for await (const event of client.sendMessageStream(sessionId, content)) {
        if (event.type === 'message') {
          const text = extractTextFromEvent(event.data);
          if (text) {
            fullText += text;
            process.stdout.write(text);
          }
        } else if (event.type === 'error') {
          throw new Error(`Agent error: ${event.data.error}`);
        }
      }
      return fullText; // Stream completed successfully
    } catch (err) {
      console.warn(`Stream attempt ${attempt + 1} failed: ${(err as Error).message}`);

      if (attempt === maxRetries - 1) throw err;

      // Check if the session needs recovery before retrying
      try {
        const session = await client.getSession(sessionId);
        if (session.status === 'paused' || session.status === 'error') {
          await client.resumeSession(sessionId);
          console.log('Session resumed after disconnect');
        }
      } catch {
        // Server might be temporarily unreachable — wait and retry
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  return fullText;
}

// Usage
const session = await client.createSession('my-agent');
const result = await streamWithRetry(session.id, 'Analyze this code');
```

</TabItem>
<TabItem value="python" label="Python">

```python
import time
from ash_ai import AshClient, AshApiError

client = AshClient(
    server_url="http://localhost:4100",
    api_key=os.environ["ASH_API_KEY"],
)

def stream_with_retry(session_id: str, content: str, max_retries: int = 3) -> str:
    full_text = ""

    for attempt in range(max_retries):
        try:
            for event in client.send_message_stream(session_id, content):
                if event.type == "message":
                    data = event.data
                    if data.get("type") == "assistant":
                        for block in data.get("message", {}).get("content", []):
                            if block.get("type") == "text":
                                full_text += block["text"]
                                print(block["text"], end="", flush=True)
                elif event.type == "error":
                    raise Exception(f"Agent error: {event.data.get('error')}")
            return full_text  # Stream completed successfully

        except Exception as e:
            print(f"\nStream attempt {attempt + 1} failed: {e}")

            if attempt == max_retries - 1:
                raise

            # Check if the session needs recovery
            try:
                session = client.get_session(session_id)
                if session.status in ("paused", "error"):
                    client.resume_session(session_id)
                    print("Session resumed after disconnect")
            except Exception:
                pass  # Server temporarily unreachable

            # Exponential backoff
            time.sleep(2 ** attempt)

    return full_text

# Usage
session = client.create_session("my-agent")
result = stream_with_retry(session.id, "Analyze this code")
```

</TabItem>
</Tabs>

## Backpressure

Ash handles backpressure automatically on the server side. When your client reads the SSE stream slowly, the server pauses the upstream agent rather than buffering unbounded data in memory.

**What this means for your client:**

- **You do not need to implement client-side backpressure.** Read the stream at whatever pace you can handle. If you process events slowly, the server waits.
- **Memory is bounded.** The server buffers at most one SSE frame plus the kernel TCP send buffer (typically 128 KB - 1 MB). There is no application-level buffering.
- **Slow clients get disconnected after 30 seconds.** If your client stops reading for more than 30 seconds, the server closes the stream with a timeout error. Reconnect and resume the session to continue.

See [SSE Backpressure](../architecture/sse-backpressure.md) for the full server-side implementation.

## Helper Functions Reference

The `@ash-ai/shared` package exports three helper functions for extracting content from stream events:

| Function | Purpose | Returns |
|----------|---------|---------|
| `extractTextFromEvent(data)` | Extract text content from assistant messages | `string \| null` |
| `extractDisplayItems(data)` | Extract structured items (text, tool use, tool results) | `DisplayItem[] \| null` |
| `extractStreamDelta(data)` | Extract incremental text from partial stream events | `string \| null` |

All three accept the `data` field from a `message` event and return `null` for events that do not match their expected type.
