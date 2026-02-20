---
sidebar_position: 2
title: Python SDK
---

# Python SDK

The `ash-ai` Python package provides a client for the Ash REST API. It is auto-generated from the OpenAPI specification.

## Installation

```bash
pip install ash-ai
```

## Client Setup

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key="your-api-key",  # optional in local dev mode
)
```

## Usage Examples

### Deploy an Agent

```python
agent = client.deploy_agent(name="my-agent", path="/path/to/agent")
print(f"Deployed: {agent.name} v{agent.version}")
```

### Create a Session

```python
session = client.create_session(agent="my-agent")
print(f"Session ID: {session.id}")
print(f"Status: {session.status}")
```

### Send a Message (Streaming)

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

### Pause and Resume

```python
# Pause the session (persists workspace state)
paused = client.pause_session(session.id)
print(f"Status: {paused.status}")  # 'paused'

# Resume later (fast path if sandbox is still alive)
resumed = client.resume_session(session.id)
print(f"Status: {resumed.status}")  # 'active'
```

### End a Session

```python
ended = client.end_session(session.id)
print(f"Status: {ended.status}")  # 'ended'
```

### Multi-Turn Conversation

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

### List Agents and Sessions

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

## Error Handling

```python
from ash_ai import AshApiError

try:
    session = client.create_session(agent="nonexistent")
except AshApiError as e:
    print(f"API error ({e.status_code}): {e.message}")
except Exception as e:
    print(f"Connection error: {e}")
```

## Note on SDK Generation

The Python SDK is auto-generated from the Ash server's OpenAPI specification using `openapi-python-client`. The spec is generated from Fastify route schemas, so the Python SDK always matches the server's API surface.

To regenerate the SDK from source:

```bash
make sdk-python
```

This runs `make openapi` first (to generate the spec), then runs the Python client generator.
