# Connecting to an Ash Server

You have an Ash server URL (e.g. `http://your-server:4100`) and want to build against it. This guide covers everything you need — no cloning the Ash repo required.

## What You Need

- **Server URL** — e.g. `http://your-server:4100`
- **API key** (if the server has auth enabled) — the admin who deployed it will give you this
- **An agent name** — ask what agents are deployed, or deploy your own

Verify the server is reachable:

```bash
curl http://your-server:4100/health
```

You should see:

```json
{"status":"ok","activeSessions":0,"activeSandboxes":0,"uptime":347}
```

If the server has auth enabled (`ASH_API_KEY` is set), include the key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://your-server:4100/health
```

## Check What Agents Are Available

```bash
curl http://your-server:4100/api/agents
```

Returns a list of deployed agents:

```json
{"agents":[{"name":"qa-bot","version":1,"path":"agents/qa-bot"}]}
```

Use the agent `name` when creating sessions.

## Option A: TypeScript SDK

### Install

```bash
npm install @ash-ai/sdk
```

### Connect and Chat

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://your-server:4100',
  apiKey: 'YOUR_API_KEY',  // omit if auth is disabled
});

// Check what agents are available
const agents = await client.listAgents();
console.log('Available agents:', agents.map(a => a.name));

// Create a session with an agent
const session = await client.createSession('qa-bot');
console.log('Session:', session.id);

// Send a message and stream the response
for await (const event of client.sendMessageStream(session.id, 'What is Ash?')) {
  if (event.type === 'message') {
    // event.data contains the SDK Message object
    console.log(event.data);
  }
}

// End the session when done
await client.endSession(session.id);
```

### Multi-Turn Conversation

Sessions maintain state. Send multiple messages and the agent remembers context:

```typescript
const session = await client.createSession('qa-bot');

// First message
for await (const event of client.sendMessageStream(session.id, 'What is TypeScript?')) {
  if (event.type === 'message') console.log(event.data);
}

// Follow-up — agent remembers the previous exchange
for await (const event of client.sendMessageStream(session.id, 'How does it differ from JavaScript?')) {
  if (event.type === 'message') console.log(event.data);
}

await client.endSession(session.id);
```

### Pause and Resume

Sessions can be paused (agent sleeps, resources freed) and resumed later:

```typescript
const session = await client.createSession('qa-bot');

// Have a conversation...
for await (const event of client.sendMessageStream(session.id, 'Hello')) {
  if (event.type === 'message') console.log(event.data);
}

// Pause — sandbox stays alive but stops billing compute
await client.pauseSession(session.id);

// Later: resume and continue where you left off
await client.resumeSession(session.id);

for await (const event of client.sendMessageStream(session.id, 'What were we talking about?')) {
  if (event.type === 'message') console.log(event.data);
}

await client.endSession(session.id);
```

### Error Handling

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://your-server:4100' });

try {
  const session = await client.createSession('nonexistent-agent');
} catch (err) {
  console.error(err.message); // "Agent not found: nonexistent-agent"
}

// Errors during streaming come as events
for await (const event of client.sendMessageStream(sessionId, 'Hello')) {
  if (event.type === 'error') {
    console.error('Stream error:', event.data.error);
  }
  if (event.type === 'message') {
    console.log(event.data);
  }
}
```

## Option B: Python SDK

### Install

```bash
pip install ash-ai
```

### Connect and Chat

```python
from ash_sdk import AshClient

client = AshClient("http://your-server:4100", api_key="YOUR_API_KEY")

# List agents
agents = client.list_agents()
print("Available agents:", [a.name for a in agents])

# Create a session
session = client.create_session("qa-bot")
print(f"Session: {session.id}")

# Send a message and stream the response
for event in client.send_message_stream(session.id, "What is Ash?"):
    if event.type == "message":
        print(event.data)

# End the session
client.end_session(session.id)
```

### Multi-Turn Conversation

```python
session = client.create_session("qa-bot")

for event in client.send_message_stream(session.id, "What is TypeScript?"):
    if event.type == "message":
        print(event.data)

# Agent remembers context
for event in client.send_message_stream(session.id, "How does it differ from JavaScript?"):
    if event.type == "message":
        print(event.data)

client.end_session(session.id)
```

### Pause and Resume

```python
session = client.create_session("qa-bot")

for event in client.send_message_stream(session.id, "Hello"):
    if event.type == "message":
        print(event.data)

client.pause_session(session.id)

# Later...
client.resume_session(session.id)

for event in client.send_message_stream(session.id, "What were we talking about?"):
    if event.type == "message":
        print(event.data)

client.end_session(session.id)
```

## Option C: CLI

Install the CLI globally:

```bash
npm install -g @ash-ai/cli
```

Point it at your server:

```bash
export ASH_SERVER_URL=http://your-server:4100
```

### Check Server and Agents

```bash
ash health
ash agent list
```

### Create a Session and Chat

```bash
# Create a session
ash session create qa-bot
# → { "id": "550e8400-...", "status": "active" }

# Send a message (streams the response to stdout)
ash session send 550e8400-... "What is Ash?"

# Send follow-up
ash session send 550e8400-... "Tell me more about agents"

# End the session
ash session end 550e8400-...
```

## Option D: curl (No SDK)

No dependencies required. All you need is `curl` and a server URL.

### Health Check

```bash
curl http://your-server:4100/health
```

### List Agents

```bash
curl http://your-server:4100/api/agents
```

### Create a Session

```bash
curl -s -X POST http://your-server:4100/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"agent":"qa-bot"}'
```

Returns:

```json
{"session":{"id":"550e8400-...","agentName":"qa-bot","status":"active"}}
```

### Send a Message (SSE stream)

```bash
curl -N -X POST http://your-server:4100/api/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"What is Ash?"}'
```

The `-N` flag disables buffering so you see SSE events as they arrive:

```
event: message
data: {"type":"assistant","message":{"content":[{"type":"text","text":"Ash is..."}]}}

event: done
data: {"sessionId":"550e8400-..."}
```

### Pause, Resume, End

```bash
# Pause
curl -s -X POST http://your-server:4100/api/sessions/SESSION_ID/pause

# Resume
curl -s -X POST http://your-server:4100/api/sessions/SESSION_ID/resume

# End
curl -s -X DELETE http://your-server:4100/api/sessions/SESSION_ID
```

### With Auth

If the server has `ASH_API_KEY` set, add the header to every request:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://your-server:4100/health
```

## Deploying Your Own Agent

An agent is a folder with a `CLAUDE.md` file (the system prompt) and optionally `.claude/settings.json` (permissions).

### Minimal Agent

```
my-agent/
└── CLAUDE.md
```

```markdown
# My Agent

You are a helpful assistant that specializes in Python programming.
Always provide code examples and explain your reasoning.
```

### Agent with Permissions

```
my-agent/
├── CLAUDE.md
└── .claude/
    └── settings.json
```

```json
{
  "permissions": {
    "allow": ["Bash", "Read", "Glob", "Grep"]
  }
}
```

### Deploy via CLI

```bash
# Point CLI at the server
export ASH_SERVER_URL=http://your-server:4100

# Deploy
ash deploy ./my-agent --name my-agent
```

### Deploy via API

If you don't have CLI access to the server's file system, you need to get the agent files onto the server first (scp, rsync, etc.), then register:

```bash
curl -X POST http://your-server:4100/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-agent","path":"agents/my-agent"}'
```

The `path` is relative to the server's data directory (usually `~/.ash/` or `/data/` inside Docker).

## SSE Event Format

When you send a message, the server responds with a `text/event-stream` containing these events:

| Event | Data | Description |
|-------|------|-------------|
| `message` | SDK `Message` object | Agent output (assistant text, tool use, tool results) |
| `error` | `{ "error": "..." }` | Something went wrong mid-stream |
| `done` | `{ "sessionId": "..." }` | Turn complete, stream closes |

The `message` events carry the Claude Code SDK's `Message` type directly. The most common shape is:

```json
{
  "type": "assistant",
  "message": {
    "content": [{ "type": "text", "text": "Hello! ..." }]
  }
}
```

## Session Lifecycle

```
create  →  active  →  pause  →  paused  →  resume  →  active  →  end  →  ended
                  └──────────────────────────────────────────────→  end  →  ended
```

- **active**: Agent is running, you can send messages
- **paused**: Agent is sleeping, no compute cost, can resume later
- **ended**: Session is done, resources freed, cannot resume

Sessions survive server restarts. A paused session can be resumed even after the server reboots (cold resume — the workspace is restored from disk).

## Next Steps

- [API Reference](../api-reference.md) — full endpoint docs, all request/response shapes
- [CLI Reference](../cli-reference.md) — all CLI commands and flags
- [Architecture](../architecture.md) — how sessions, sandboxes, and the bridge work
