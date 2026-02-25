---
sidebar_position: 2
title: Python SDK
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Python SDK

The `ash-ai-sdk` Python package provides a client for the Ash REST API. It is auto-generated from the OpenAPI specification.

## Installation

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```bash
pip install ash-ai-sdk
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```bash
npm install @ash-ai/sdk
```

</TabItem>
</Tabs>

## Client Setup

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key="your-api-key",  # optional in local dev mode
)
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key', // optional in local dev mode
});
```

</TabItem>
</Tabs>

## Usage Examples

### Deploy an Agent

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
agent = client.deploy_agent(name="my-agent", path="/path/to/agent")
print(f"Deployed: {agent.name} v{agent.version}")
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
const agent = await client.deployAgent('my-agent', '/path/to/agent');
console.log(`Deployed: ${agent.name} v${agent.version}`);
```

</TabItem>
</Tabs>

### Create a Session

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
session = client.create_session(agent="my-agent")
print(f"Session ID: {session.id}")
print(f"Status: {session.status}")
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.createSession('my-agent');
console.log(`Session ID: ${session.id}`);
console.log(`Status: ${session.status}`);
```

</TabItem>
</Tabs>

### Send a Message (Streaming)

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
for event in client.send_message_stream(session.id, "Analyze this code"):
    if event.type == "message":
        data = event.data
        if data.get("type") == "assistant" and data.get("message", {}).get("content"):
            for block in data["message"]["content"]:
                if block.get("type") == "text":
                    print(block["text"])
    elif event.type == "error":
        print(f"Error: {event.data['error']}")
    elif event.type == "done":
        print("Turn complete.")
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
for await (const event of client.sendMessageStream(session.id, 'Analyze this code')) {
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

</TabItem>
</Tabs>

### Pause and Resume

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
# Pause the session (persists workspace state)
paused = client.pause_session(session.id)
print(f"Status: {paused.status}")  # 'paused'

# Resume later (fast path if sandbox is still alive)
resumed = client.resume_session(session.id)
print(f"Status: {resumed.status}")  # 'active'
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
// Pause the session (persists workspace state)
const paused = await client.pauseSession(session.id);
console.log(`Status: ${paused.status}`); // 'paused'

// Resume later (fast path if sandbox is still alive)
const resumed = await client.resumeSession(session.id);
console.log(`Status: ${resumed.status}`); // 'active'
```

</TabItem>
</Tabs>

### End a Session

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
ended = client.end_session(session.id)
print(f"Status: {ended.status}")  # 'ended'
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
const ended = await client.endSession(session.id);
console.log(`Status: ${ended.status}`); // 'ended'
```

</TabItem>
</Tabs>

### Multi-Turn Conversation

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
session = client.create_session(agent="my-agent")

questions = [
    "What files are in the workspace?",
    "Read the main config file.",
    "Summarize what this project does.",
]

for question in questions:
    print(f"\n> {question}")
    for event in client.send_message_stream(session.id, question):
        if event.type == "message":
            data = event.data
            if data.get("type") == "assistant":
                content = data.get("message", {}).get("content", [])
                for block in content:
                    if block.get("type") == "text":
                        print(block["text"], end="")
    print()

client.end_session(session.id)
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
const session = await client.createSession('my-agent');

const questions = [
  'What files are in the workspace?',
  'Read the main config file.',
  'Summarize what this project does.',
];

for (const question of questions) {
  console.log(`\n> ${question}`);
  for await (const event of client.sendMessageStream(session.id, question)) {
    if (event.type === 'message') {
      const text = extractTextFromEvent(event.data);
      if (text) process.stdout.write(text);
    }
  }
  console.log();
}

await client.endSession(session.id);
```

</TabItem>
</Tabs>

### List Agents and Sessions

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
# List all deployed agents
agents = client.list_agents()
for agent in agents:
    print(f"{agent.name} (v{agent.version})")

# List all sessions, optionally filtered by agent
sessions = client.list_sessions(agent="my-agent")
for s in sessions:
    print(f"{s.id} - {s.status}")
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
// List all deployed agents
const agents = await client.listAgents();
for (const agent of agents) {
  console.log(`${agent.name} (v${agent.version})`);
}

// List all sessions, optionally filtered by agent
const sessions = await client.listSessions('my-agent');
for (const s of sessions) {
  console.log(`${s.id} - ${s.status}`);
}
```

</TabItem>
</Tabs>

## Error Handling

<Tabs groupId="sdk-language">
<TabItem value="python" label="Python" default>

```python
from ash_ai import AshApiError

try:
    session = client.create_session(agent="nonexistent")
except AshApiError as e:
    print(f"API error ({e.status_code}): {e.message}")
except Exception as e:
    print(f"Connection error: {e}")
```

</TabItem>
<TabItem value="typescript" label="TypeScript">

```typescript
try {
  const session = await client.createSession('nonexistent');
} catch (err) {
  console.error(err.message);
}
```

</TabItem>
</Tabs>

## Note on SDK Generation

The Python SDK is auto-generated from the Ash server's OpenAPI specification using `openapi-python-client`. The spec is generated from Fastify route schemas, so the Python SDK always matches the server's API surface.

To regenerate the SDK from source:

```bash
make sdk-python
```

This runs `make openapi` first (to generate the spec), then runs the Python client generator.
