---
sidebar_position: 2
title: Quickstart
---

# Quickstart

Deploy an agent and chat with it. This takes about two minutes, assuming you have completed [Installation](installation.md).

## 1. Define an Agent

An agent is a folder with a `CLAUDE.md` file. The `CLAUDE.md` is the system prompt -- it tells the agent who it is and how to behave.

```bash
mkdir my-agent

cat > my-agent/CLAUDE.md << 'EOF'
You are a helpful coding assistant.
Answer questions about JavaScript and TypeScript.
Keep answers concise. Include working code examples.
EOF
```

That is the only required file. For production agents, you can add `.claude/settings.json` (tool permissions), `.claude/skills/` (reusable skills), and `.mcp.json` (MCP server connections). See [Key Concepts](concepts.md) for more.

## 2. Deploy and Chat

```bash
ash deploy ./my-agent --name my-agent
ash chat my-agent "What is a closure in JavaScript?"
```

The response streams back in real time:

```
A closure is a function that retains access to variables from its enclosing
scope, even after the outer function has returned...
```

That is it. `ash chat` creates a session, streams the response, and cleans up automatically.

:::tip
Use `ash chat --keep` to keep the session alive after the response. It prints the session ID to stderr so you can send follow-up messages with `ash session send`.
:::

## Detailed Flow (Optional)

If you need more control -- multiple messages, pause/resume, or session inspection -- use the session commands directly:

```bash
# Create a session
ash session create my-agent
# → { "id": "550e8400-...", "status": "active", "agentName": "my-agent" }

# Send messages (replace SESSION_ID with the actual ID)
ash session send SESSION_ID "What is a closure in JavaScript?"
ash session send SESSION_ID "Now explain it with an example"

# End the session when done
ash session end SESSION_ID
```

---

## Using the SDKs

The CLI is convenient for testing. For applications, use one of the SDKs.

### TypeScript

```bash
npm install @ash-ai/sdk
```

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

// Create a session
const session = await client.createSession('my-agent');

// Send a message and stream the response
for await (const event of client.sendMessageStream(session.id, 'What is a closure?')) {
  if (event.type === 'message') {
    process.stdout.write(event.data);
  }
}

// Clean up
await client.endSession(session.id);
```

### Python

```bash
pip install ash-ai
```

```python
from ash_ai import AshClient

client = AshClient(server_url="http://localhost:4100")

# Create a session
session = client.create_session("my-agent")

# Send a message and stream the response
for event in client.send_message_stream(session.id, "What is a closure?"):
    if event.type == "message":
        print(event.data, end="")

# Clean up
client.end_session(session.id)
```

### curl

```bash
# Create a session
curl -s -X POST http://localhost:4100/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"agent":"my-agent"}'

# Send a message (returns an SSE stream)
curl -N -X POST http://localhost:4100/api/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"What is a closure?"}'

# End the session
curl -s -X DELETE http://localhost:4100/api/sessions/SESSION_ID
```

---

## What Just Happened

When you ran those commands, here is what Ash did under the hood:

1. **`ash deploy`** -- Copied your agent folder to the server's agent registry and recorded it in the database.
2. **`ash session create`** -- Created a session record in the database and spawned an isolated sandbox process. Inside that sandbox, a bridge process started and loaded your `CLAUDE.md` as the system prompt.
3. **`ash session send`** -- Sent your message to the bridge over a Unix socket. The bridge called the Claude Agent SDK, which streamed the response back. Ash proxied each chunk as a Server-Sent Event (SSE) over HTTP to your terminal.
4. **`ash session end`** -- Marked the session as ended in the database and destroyed the sandbox process.

The sandbox is an isolated child process with a restricted environment -- only allowlisted variables reach it, and on Linux it runs with cgroup resource limits and filesystem isolation via bubblewrap.

## Next Steps

- [Key Concepts](concepts.md) -- Understand agents, sessions, sandboxes, bridges, and the server
- [CLI Reference](/docs/cli/overview) -- All commands and flags
- [API Reference](/docs/api/overview) -- REST endpoints, SSE format, request/response schemas
- [TypeScript SDK](/docs/sdks/typescript) -- Full TypeScript client documentation
- [Python SDK](/docs/sdks/python) -- Full Python client documentation
