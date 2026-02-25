---
sidebar_position: 4
title: Messages
---

# Messages

Messages are how you interact with an agent inside a session. You send a text prompt and receive a stream of Server-Sent Events (SSE) containing the agent's response, including tool use, intermediate results, and the final answer.

---

## Send Message

```
POST /api/sessions/:id/messages
```

Sends a message to the agent running in the specified session. The response is an SSE stream. The session must be in `active` status.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Request

```json
{
  "content": "What files are in the current directory?",
  "includePartialMessages": false,
  "model": "claude-opus-4-6"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | The message text to send to the agent |
| `includePartialMessages` | boolean | No | When `true`, the stream includes incremental `stream_event` messages with raw API deltas in addition to complete messages. Useful for building real-time streaming UIs. Default: `false`. |
| `model` | string | No | Model override for this specific message. Takes precedence over the session-level and agent-level model. Any valid model identifier accepted. |

### Response

The response uses `Content-Type: text/event-stream`. The HTTP status is `200` and the body is a stream of SSE frames.

#### SSE Event Types

The stream contains three event types: `message`, `error`, and `done`.

**`message` event** -- An SDK Message object from the Claude Code agent. The shape varies depending on the message type (assistant response, tool use, tool result, etc.). These are passed through from the SDK without transformation.

```
event: message
data: {"type":"assistant","message":{"id":"msg_01X...","type":"message","role":"assistant","content":[{"type":"text","text":"The current directory contains the following files:\n\n- src/\n- package.json\n- README.md"}],"model":"claude-sonnet-4-20250514","stop_reason":"end_turn"}}

```

**`error` event** -- An error occurred during message processing.

```
event: error
data: {"error":"Bridge connection lost"}

```

**`done` event** -- The agent has finished processing the message. This is always the last event in the stream.

```
event: done
data: {"sessionId":"f47ac10b-58cc-4372-a567-0e02b2c3d479"}

```

### Pre-Stream Errors

If validation fails before the stream starts, the server returns a standard JSON error response (not SSE):

| Status | Condition |
|---|---|
| `400` | Session is not in `active` status |
| `404` | Session not found |
| `500` | Runner not available or sandbox not found |

```json
{
  "error": "Session is paused",
  "statusCode": 400
}
```

### Connection Lifecycle

1. Client sends `POST /api/sessions/:id/messages` with JSON body.
2. Server validates the session and sandbox, then responds with `200` and `Content-Type: text/event-stream`.
3. Server streams `message` events as the agent works (tool calls, text responses, etc.).
4. If an error occurs mid-stream, the server sends an `error` event.
5. The stream ends with a `done` event, then the connection closes.

### Backpressure

The server applies backpressure on the SSE stream. If the client stops reading and the kernel TCP send buffer fills up, the server waits up to 30 seconds for the buffer to drain. If the client remains unresponsive after 30 seconds, the server closes the connection.

### Consuming the Stream

#### curl

```bash
curl -N -X POST $ASH_SERVER_URL/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"content": "Hello, what can you do?"}'
```

#### JavaScript (EventSource-like)

```javascript
const response = await fetch(
  `http://localhost:4100/api/sessions/${sessionId}/messages`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    body: JSON.stringify({ content: 'Hello, what can you do?' }),
  }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  let eventType = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (eventType === 'message') {
        console.log('Message:', data);
      } else if (eventType === 'error') {
        console.error('Error:', data.error);
      } else if (eventType === 'done') {
        console.log('Done:', data.sessionId);
      }
    }
  }
}
```

---

## List Messages

```
GET /api/sessions/:id/messages
```

Returns persisted messages for a session. Messages are stored after each completed turn. User messages and complete assistant/result messages are persisted; partial streaming events are not.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 100 | Maximum number of messages to return (1--1000) |
| `after` | integer | 0 | Return messages with sequence number greater than this value |

### Response

**200 OK**

```json
{
  "messages": [
    {
      "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "tenantId": "default",
      "role": "user",
      "content": "{\"type\":\"user\",\"content\":\"What files are in the current directory?\"}",
      "sequence": 1,
      "createdAt": "2025-06-15T10:31:00.000Z"
    },
    {
      "id": "e391f2ff-7d65-5c12-a1f7-e812859f1962",
      "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "tenantId": "default",
      "role": "assistant",
      "content": "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Here are the files...\"}]}}",
      "sequence": 2,
      "createdAt": "2025-06-15T10:31:05.000Z"
    }
  ]
}
```

The `content` field is a JSON-encoded string containing the raw SDK message. Parse it to access the full message structure.

### Errors

| Status | Condition |
|---|---|
| `404` | Session not found |
