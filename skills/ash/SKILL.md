---
name: ash
description: |
  Deploy and orchestrate hosted AI agents with Ash. Covers: creating an Ash client,
  deploying agents, managing sessions (create, pause, resume, end), sending messages,
  streaming SSE responses, sandbox isolation, multi-turn conversations, real-time
  text deltas, error handling, and working with files in agent workspaces.
  Works with TypeScript (@ash-ai/sdk) and Python (ash-ai) SDKs.
keywords:
  - ash
  - ai agent
  - deploy agent
  - hosted agent
  - session
  - sandbox
  - streaming
  - SSE
  - server-sent events
  - orchestration
  - claude
  - agent sdk
  - real-time
  - multi-turn
---

# Ash SDK Skill

Ash is an open-source system for deploying and orchestrating hosted AI agents.
You deploy agents to a server, create sessions, and interact via REST API + SSE streaming.

## Decision Workflow

Before writing code, determine what you're building:

1. **"I need to deploy an agent"** → See [Quick Start](#quick-start) step 1
2. **"I need to create a session and send messages"** → See [Quick Start](#quick-start) steps 2-3
3. **"I need real-time streaming output"** → See [Streaming](#streaming-messages)
4. **"I need to manage session lifecycle"** → See `references/sessions.md`
5. **"I need to handle errors"** → See `references/error-handling.md`
6. **"I need the full API surface"** → See `references/api-reference.md`

## Quick Start

### Install

**TypeScript:**
```bash
npm install @ash-ai/sdk
```

**Python:**
```bash
pip install ash-ai
```

### Step 1: Create Client

**TypeScript:**
```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key', // optional in local dev mode
});
```

**Python:**
```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key="your-api-key",  # optional in local dev mode
)
```

### Step 2: Create a Session

**TypeScript:**
```typescript
const session = await client.createSession('my-agent');
console.log(session.id);     // "a1b2c3d4-..."
console.log(session.status); // "active"
```

**Python:**
```python
session = client.create_session("my-agent")
print(session.id)     # "a1b2c3d4-..."
print(session.status) # "active"
```

### Step 3: Send a Message and Stream the Response

**TypeScript:**
```typescript
import { extractTextFromEvent } from '@ash-ai/sdk';

for await (const event of client.sendMessageStream(session.id, 'Hello!')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) console.log(text);
  } else if (event.type === 'error') {
    console.error('Error:', event.data.error);
  } else if (event.type === 'done') {
    console.log('Turn complete.');
  }
}
```

**Python:**
```python
for event in client.send_message_stream(session.id, "Hello!"):
    if event.type == "message":
        data = event.data
        if data.get("type") == "assistant":
            for block in data.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(block["text"])
    elif event.type == "error":
        print(f"Error: {event.data['error']}")
    elif event.type == "done":
        print("Turn complete.")
```

### Step 4: Clean Up

**TypeScript:**
```typescript
await client.endSession(session.id);
```

**Python:**
```python
client.end_session(session.id)
```

## Streaming Messages

The SSE stream carries three event types:

| Event | Description |
|-------|-------------|
| `message` | SDK message (assistant text, tool use, tool results, stream deltas) |
| `error` | Error during processing |
| `done` | Agent's turn is complete |

### Real-Time Text Deltas

Enable `includePartialMessages` for character-by-character streaming:

**TypeScript:**
```typescript
import { extractStreamDelta } from '@ash-ai/sdk';

for await (const event of client.sendMessageStream(session.id, 'Write a haiku.', {
  includePartialMessages: true,
})) {
  if (event.type === 'message') {
    const delta = extractStreamDelta(event.data);
    if (delta) process.stdout.write(delta);
  }
}
```

**Python:**
```python
for event in client.send_message_stream(
    session.id, "Write a haiku.",
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

## Multi-Turn Conversations

Sessions preserve conversation context across turns automatically:

**TypeScript:**
```typescript
const session = await client.createSession('my-agent');

for await (const event of client.sendMessageStream(session.id, 'My name is Alice.')) {
  // Agent acknowledges
}

for await (const event of client.sendMessageStream(session.id, 'What is my name?')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) console.log(text); // "Your name is Alice."
  }
}

await client.endSession(session.id);
```

## Session Lifecycle

Sessions have five states: `starting` → `active` → `paused` → `active` (resume) → `ended`.

```typescript
// Pause (sandbox may stay alive for fast resume)
await client.pauseSession(session.id);

// Resume (warm path if sandbox alive, cold path restores from snapshot)
await client.resumeSession(session.id);

// End permanently
await client.endSession(session.id);
```

For full lifecycle details, see `references/sessions.md`.

## Validation Checklist

Before running your code, verify:

- [ ] **Server URL** is correct (default: `http://localhost:4100`, no trailing slash)
- [ ] **API key** is set if the server has `ASH_API_KEY` configured
- [ ] **Agent exists** — deploy it first or check with `client.listAgents()`
- [ ] **Session is active** before sending messages (not paused or ended)
- [ ] **Stream is consumed** — always iterate the full stream (don't break early without handling `done`)
- [ ] **Errors are handled** — both thrown exceptions (connection) and `error` events (agent-level)

## Topic Index

| Topic | File |
|-------|------|
| SSE event types and stream handling | `references/streaming.md` |
| Session states and lifecycle | `references/sessions.md` |
| Full AshClient API reference | `references/api-reference.md` |
| Common errors and fixes | `references/error-handling.md` |

## Fallback

For complete documentation: https://docs.ash-cloud.ai/llm.txt
