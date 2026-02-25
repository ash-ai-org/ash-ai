# ash-ai-sdk

Python SDK for [Ash](https://ash.dev) — deploy and orchestrate hosted AI agents.

## Installation

```bash
pip install ash-ai-sdk
```

## Quick Start

```python
from ash_sdk import AuthenticatedClient
from ash_sdk.api.sessions import post_api_sessions, post_api_sessions_id_messages
from ash_sdk.api.agents import get_api_agents
from ash_sdk.models import PostApiSessionsBody, PostApiSessionsIdMessagesBody

client = AuthenticatedClient(base_url="http://localhost:4100", token="your-api-key")

with client as c:
    # List agents
    agents = get_api_agents.sync(client=c)

    # Create a session
    session = post_api_sessions.sync(
        client=c,
        body=PostApiSessionsBody(agent="my-agent"),
    )

    # Send a message
    response = post_api_sessions_id_messages.sync(
        client=c,
        id=session.parsed.id,
        body=PostApiSessionsIdMessagesBody(message="Hello!"),
    )
```

## Async Support

Every endpoint has an async variant:

```python
async with client as c:
    agents = await get_api_agents.asyncio(client=c)
```

## API Coverage

The SDK is auto-generated from Ash's OpenAPI spec and covers all endpoints:

- **Agents** — deploy, list, get, delete
- **Sessions** — create, list, get, delete, pause, resume, stop, fork
- **Messages** — send messages, stream events, list history
- **Files** — list, upload, browse session workspaces
- **Credentials** — create, list, delete agent secrets
- **Queue** — enqueue items, list, get stats
- **Attachments** — upload, list, download, delete
- **Usage** — track token usage and costs

## Links

- [Documentation](https://ash.dev/docs/sdks/python)
- [GitHub](https://github.com/ash-ai-org/ash-ai)
- [TypeScript SDK](https://www.npmjs.com/package/@ash-ai/sdk)
