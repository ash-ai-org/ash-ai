---
name: ash
description: |
  Deploy and orchestrate hosted AI agents with Ash. Use when building agent APIs,
  managing stateful sessions, streaming SSE responses, running code in sandboxes,
  or orchestrating Claude-powered agents as production services. Works with
  TypeScript (@ash-ai/sdk) and Python (ash-ai) SDKs.
license: MIT
metadata:
  author: ash-ai-org
  version: "1.0"
---

# Ash Skill

## Product summary

Ash is an open-source CLI, SDK, and self-hostable system for deploying and orchestrating hosted AI agents. Developers define agents as folders (CLAUDE.md + config), deploy them to a server, and interact via REST API + SSE streaming. Each agent session runs inside an isolated Docker sandbox with its own workspace. Sessions persist messages across turns and can be paused, resumed, forked, and ended. Primary CLI command: `ash start` to run the server. Clients available in TypeScript (`@ash-ai/sdk`) and Python (`ash-ai`). API server runs on port 4100 by default. See https://docs.ash-cloud.ai for full documentation.

## When to use

Reach for this skill when:
- Building an API that wraps a Claude-powered AI agent
- Creating stateful multi-turn agent conversations
- Deploying agents as hosted services with sandbox isolation
- Streaming real-time agent responses via SSE (Server-Sent Events)
- Managing agent session lifecycle (create, pause, resume, fork, end)
- Running shell commands inside agent sandboxes
- Reading/writing files in agent workspaces
- Building async job queues for agent tasks
- Tracking usage and token consumption across agents
- Self-hosting an agent orchestration platform (Docker, EC2, GCE)

## Quick reference

### Client initialization

| Scenario | TypeScript | Python |
|----------|-----------|--------|
| **Local dev** | `new AshClient({ serverUrl: 'http://localhost:4100' })` | `AshClient(server_url="http://localhost:4100")` |
| **With API key** | `new AshClient({ serverUrl: url, apiKey: 'key' })` | `AshClient(server_url=url, api_key="key")` |

### Agent operations

| Operation | TypeScript | Python |
|-----------|-----------|--------|
| **Deploy** | `client.deployAgent('name', '/path')` | `client.deploy_agent(name="name", path="/path")` |
| **List** | `client.listAgents()` | `client.list_agents()` |
| **Get** | `client.getAgent('name')` | `client.get_agent("name")` |
| **Delete** | `client.deleteAgent('name')` | `client.delete_agent("name")` |

### Session operations

| Operation | TypeScript | Python |
|-----------|-----------|--------|
| **Create** | `client.createSession('agent-name')` | `client.create_session("agent-name")` |
| **List** | `client.listSessions('agent-name')` | `client.list_sessions(agent="agent-name")` |
| **Get** | `client.getSession(id)` | `client.get_session(id)` |
| **Pause** | `client.pauseSession(id)` | `client.pause_session(id)` |
| **Resume** | `client.resumeSession(id)` | `client.resume_session(id)` |
| **End** | `client.endSession(id)` | `client.end_session(id)` |
| **Stop** | `client.stopSession(id)` | — |
| **Fork** | `client.forkSession(id)` | — |

### Message operations

| Operation | TypeScript | Python |
|-----------|-----------|--------|
| **Stream** | `client.sendMessageStream(id, 'text')` | `client.send_message_stream(id, "text")` |
| **Raw response** | `client.sendMessage(id, 'text')` | — |
| **List history** | `client.listMessages(id)` | `client.list_messages(id)` |
| **Stream with deltas** | `client.sendMessageStream(id, 'text', { includePartialMessages: true })` | `client.send_message_stream(id, "text", include_partial_messages=True)` |

### SSE event types

| Event | Data Shape | Description |
|-------|-----------|-------------|
| `message` | Raw SDK message object | Complete or partial message from the agent |
| `text_delta` | `{ delta: string }` | Incremental text chunk (with `includePartialMessages`) |
| `tool_use` | `{ id, name, input }` | Tool invocation started |
| `tool_result` | `{ tool_use_id, content, is_error? }` | Tool result returned |
| `turn_complete` | `{ numTurns?, result? }` | Agent turn finished |
| `error` | `{ error: string }` | Error during processing |
| `done` | `{ sessionId: string }` | Stream complete |

### Additional operations

| Operation | TypeScript | Description |
|-----------|-----------|-------------|
| `exec(sessionId, command)` | Execute shell command in sandbox | Returns `{ exitCode, stdout, stderr }` |
| `getSessionFiles(sessionId)` | List workspace files | Returns file entries with paths and sizes |
| `getSessionFile(sessionId, path)` | Read file content | JSON response, 1MB limit |
| `downloadSessionFile(sessionId, path)` | Download raw file | Binary, 100MB limit |
| `storeCredential(type, key)` | Store API key for injection | Types: `anthropic`, `openai`, `custom` |
| `enqueue(agentName, prompt)` | Add to async job queue | Background processing |
| `health()` | Server health check | Status, sessions, sandboxes, pool stats |

## Decision guidance

### When to use streaming vs. raw response

| Scenario | `sendMessageStream` | `sendMessage` |
|----------|---------------------|---------------|
| **Display real-time output** | Recommended | Not ideal |
| **Process complete response** | Works (iterate to end) | Works (manual SSE parse) |
| **Real-time text deltas** | Use with `includePartialMessages` | Not supported |
| **Forward to another SSE client** | Works | Better (pass-through) |
| **Simple request-response** | Works | Works |

### When to use pause vs. end

| Scenario | `pauseSession` | `endSession` |
|----------|---------------|--------------|
| **Temporary idle (resume later)** | Recommended | Permanent |
| **Save costs on idle sessions** | Recommended | Only if done forever |
| **Preserve conversation for later** | Yes (warm or cold resume) | Messages persist but no new messages |
| **Free sandbox resources** | Sandbox may be reclaimed | Sandbox destroyed |
| **Session is completely done** | No | Recommended |

### Session states

| State | Can send messages? | Can resume? | Sandbox alive? |
|-------|-------------------|-------------|----------------|
| `starting` | No (wait) | — | Starting |
| `active` | Yes | — | Yes |
| `paused` | No | Yes (warm or cold) | Maybe |
| `stopped` | No | Yes | No |
| `ended` | No | No | No |
| `error` | No | Yes | No |

## Workflow

### 1. Install SDK and start server

```bash
npm install @ash-ai/sdk    # TypeScript
pip install ash-ai          # Python
ash start                   # Start Ash server (Docker)
```

### 2. Define and deploy an agent

```bash
mkdir my-agent
cat > my-agent/CLAUDE.md << 'EOF'
You are a helpful coding assistant.
Answer questions about JavaScript and TypeScript.
Keep answers concise. Include working code examples.
EOF

ash agent deploy my-agent ./my-agent
```

### 3. Create client and session

```typescript
import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });
const session = await client.createSession('my-agent');
```

### 4. Send messages and stream responses

```typescript
for await (const event of client.sendMessageStream(session.id, 'Explain closures in JS.')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) process.stdout.write(text);
  } else if (event.type === 'error') {
    console.error('Error:', event.data.error);
  } else if (event.type === 'done') {
    console.log('\nDone.');
  }
}
```

### 5. Real-time text deltas (optional)

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

### 6. Multi-turn conversation

```typescript
// Turn 1
for await (const event of client.sendMessageStream(session.id, 'My name is Alice.')) {}

// Turn 2 -- agent remembers context
for await (const event of client.sendMessageStream(session.id, 'What is my name?')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) console.log(text); // "Your name is Alice."
  }
}
```

### 7. Pause, resume, and clean up

```typescript
// Pause (sandbox may stay alive for fast resume)
await client.pauseSession(session.id);

// Resume later (warm path if sandbox alive, cold path restores from snapshot)
await client.resumeSession(session.id);

// End permanently when done
await client.endSession(session.id);
```

## Common gotchas

- **Trailing slash in server URL**: `AshClient` strips trailing slashes automatically, but `http://localhost:4100/` and `http://localhost:4100` are both fine.
- **API key required in production**: If `ASH_API_KEY` is set on the server, all requests need `apiKey` in the client. In local dev mode (no key set), auth is disabled.
- **Session must be active to send messages**: Sending to a paused, ended, or error session throws. Resume first with `client.resumeSession(id)`.
- **Always consume the full stream**: Breaking out of `sendMessageStream` early without handling `done` can leave server-side resources hanging. Always iterate to completion or call `stopSession`.
- **Two sources of errors**: Connection errors throw exceptions. Agent-level errors arrive as `error` events in the stream. Handle both.
- **Warm vs cold resume**: If resumed quickly, the sandbox is still alive (instant). If the sandbox was reclaimed (idle timeout, restart), a new one is created and workspace is restored from snapshot. Conversation history is always preserved.
- **`extractStreamDelta` only works with `includePartialMessages`**: Without the flag, `extractStreamDelta` always returns `null`. Only `extractTextFromEvent` works on complete messages.
- **Session IDs are UUIDs**: Always use the full UUID string. Short IDs or names won't work.
- **Agent names are unique**: Deploying an agent with the same name creates a new version, not a duplicate.
- **File access after session ends**: You can still read files from ended sessions via `getSessionFiles` / `getSessionFile` (reads from persisted snapshot). Active sessions read from the live sandbox.

## Verification checklist

Before submitting work with Ash:

- [ ] **Server running**: `ash health` returns `{ "status": "ok" }` or `client.health()` succeeds
- [ ] **Agent deployed**: `client.listAgents()` includes your agent name
- [ ] **Session active**: `client.getSession(id)` shows `status: "active"` before sending messages
- [ ] **Stream consumed**: Every `sendMessageStream` loop runs to the `done` event
- [ ] **Errors handled**: Both `try/catch` around the stream AND `event.type === 'error'` inside it
- [ ] **Session cleaned up**: `endSession()` called when done, or `pauseSession()` if resuming later
- [ ] **API key set**: If server has `ASH_API_KEY`, client has matching `apiKey`
- [ ] **Correct imports**: TypeScript uses `@ash-ai/sdk`, Python uses `ash_ai` (underscore, not hyphen)
- [ ] **Helper functions imported**: `extractTextFromEvent`, `extractStreamDelta`, `extractDisplayItems` from `@ash-ai/sdk`

## Resources

- **Full documentation**: https://docs.ash-cloud.ai/llms.txt (navigation index for agents)
- **Complete docs**: https://docs.ash-cloud.ai/llms-full.txt (all pages in one file)
- **OpenAPI spec**: https://docs.ash-cloud.ai/openapi.json (39 endpoints, machine-readable)
- **Quickstart**: https://docs.ash-cloud.ai/getting-started/quickstart
- **Streaming guide**: https://docs.ash-cloud.ai/guides/streaming-responses
- **Session lifecycle**: https://docs.ash-cloud.ai/guides/managing-sessions
- **TypeScript SDK**: https://docs.ash-cloud.ai/sdks/typescript
- **Python SDK**: https://docs.ash-cloud.ai/sdks/python
- **API reference**: https://docs.ash-cloud.ai/api/overview
- **GitHub**: https://github.com/ash-ai-org/ash-ai

---

> For additional documentation and navigation, see: https://docs.ash-cloud.ai/llms.txt
