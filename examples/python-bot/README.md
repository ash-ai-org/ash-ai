# Python Bot Example

Demonstrates using the Ash Python SDK to deploy an agent, create a session, and have a multi-turn conversation with streaming responses.

## Prerequisites

1. Ash server running: `make server` (from repo root)
2. Python 3.9+
3. Install the SDK:

```bash
pip install -e ../../packages/sdk-python
```

## Usage

```bash
# Deploy agent and have a conversation
python bot.py

# Point to a different server
ASH_SERVER_URL=http://remote-host:4100 python bot.py
```

## What it does

1. Deploys the `agent/` directory as a "python-bot" agent
2. Creates a session
3. Sends a series of messages, streaming each response
4. Ends the session and cleans up
