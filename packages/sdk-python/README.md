# ash-ai-sdk

Python SDK for [Ash](https://ash.dev) — deploy and orchestrate hosted AI agents.

## Installation

```bash
pip install ash-ai-sdk
```

## Quick Start

The high-level `AshClient` is the recommended way to use the SDK. It supports SSE streaming out of the box:

```python
from ash_sdk import AshClient
from ash_sdk.streaming import MessageEvent, TextDeltaEvent, ErrorEvent, DoneEvent

client = AshClient("http://localhost:4100", token="your-api-key")

# Create a session with SDK options
session = client.create_session(
    "my-agent",
    system_prompt="You are a helpful assistant.",
    model="claude-sonnet-4-20250514",
)

# Stream messages with SSE
for event in client.send_message_stream(session.id, "Hello!"):
    if isinstance(event, MessageEvent):
        print(event.data)
    elif isinstance(event, TextDeltaEvent):
        print(event.delta, end="", flush=True)
    elif isinstance(event, ErrorEvent):
        print(f"Error: {event.error}")
    elif isinstance(event, DoneEvent):
        print("\n[Done]")

# Clean up
client.end_session(session.id)
```

## Session Creation Options

All Claude Code SDK options are supported at session creation:

```python
session = client.create_session(
    "my-agent",
    model="claude-sonnet-4-20250514",
    system_prompt="You are a coding assistant.",
    permission_mode="bypassPermissions",
    allowed_tools=["Read", "Write", "Bash"],
    mcp_servers={
        "my-server": {
            "command": "npx",
            "args": ["-y", "@my/mcp-server"],
        }
    },
    betas=["interleaved-thinking"],
)
```

## Async Support

Both the high-level client and the generated API functions support async:

```python
import asyncio
from ash_sdk import AshClient
from ash_sdk.streaming import MessageEvent

async def main():
    client = AshClient("http://localhost:4100", token="your-api-key")
    session = client.create_session("my-agent")

    async for event in client.asend_message_stream(session.id, "Hello!"):
        if isinstance(event, MessageEvent):
            print(event.data)

    client.end_session(session.id)

asyncio.run(main())
```

## Message Options

Control model behavior per-message:

```python
for event in client.send_message_stream(
    session.id,
    "Explain quantum computing",
    model="claude-sonnet-4-20250514",
    max_turns=5,
    max_budget_usd=0.50,
    effort="high",
    thinking={"type": "enabled", "budgetTokens": 10000},
):
    ...
```

## Low-Level API

For direct control, use the auto-generated API functions:

```python
from ash_sdk import AuthenticatedClient
from ash_sdk.api.sessions import post_api_sessions
from ash_sdk.api.agents import get_api_agents
from ash_sdk.models import PostApiSessionsBody

client = AuthenticatedClient(base_url="http://localhost:4100", token="your-api-key")

with client as c:
    agents = get_api_agents.sync(client=c)

    session = post_api_sessions.sync(
        client=c,
        body=PostApiSessionsBody(
            agent="my-agent",
            system_prompt="You are helpful.",
        ),
    )
```

## API Coverage

The SDK covers all Ash API endpoints:

- **Agents** — deploy, list, get, delete
- **Sessions** — create, list, get, delete, pause, resume, stop, fork
- **Messages** — send messages with SSE streaming, list history
- **Files** — list, upload, browse session workspaces
- **Credentials** — create, list, delete agent secrets
- **Queue** — enqueue items, list, get stats
- **Attachments** — upload, list, download, delete
- **Usage** — track token usage and costs

## Links

- [Documentation](https://ash.dev/docs/sdks/python)
- [GitHub](https://github.com/ash-ai-org/ash-ai)
- [TypeScript SDK](https://www.npmjs.com/package/@ash-ai/sdk)
