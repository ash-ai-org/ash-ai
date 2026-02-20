# 06 - SDKs Section

## Pages

### 1. TypeScript SDK (`/docs/sdks/typescript`)

**Content:**

#### Installation
```bash
npm install @ash-ai/sdk
```

#### Client Setup
```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key', // optional
});
```

#### Methods Reference

**Agents:**
- `client.deployAgent(name, path)` - Deploy agent from local folder
- `client.listAgents()` - List all agents
- `client.getAgent(name)` - Get agent by name
- `client.deleteAgent(name)` - Delete agent

**Sessions:**
- `client.createSession(agent)` - Create session
- `client.listSessions(agent?)` - List sessions
- `client.getSession(id)` - Get session
- `client.pauseSession(id)` - Pause session
- `client.resumeSession(id)` - Resume session
- `client.endSession(id)` - End session

**Messages:**
- `client.sendMessage(sessionId, content, opts?)` - Raw Response
- `client.sendMessageStream(sessionId, content, opts?)` - Async generator of `AshStreamEvent`

**Files:**
- `client.getSessionFiles(sessionId)` - List workspace files
- `client.getSessionFile(sessionId, path)` - Read file content

**Health:**
- `client.health()` - Server status

#### Streaming Example
```typescript
import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

const session = await client.createSession('my-agent');

for await (const event of client.sendMessageStream(session.id, 'Hello!')) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event);
    if (text) process.stdout.write(text);
  }
}
```

#### Helper Functions
- `extractDisplayItems(messages)` - Extract tool results, text blocks for display
- `extractTextFromEvent(event)` - Get text content from a message event
- `extractStreamDelta(event)` - Get incremental text delta for streaming UIs
- `parseSSEStream(stream)` - Low-level SSE parser (async generator)

#### Types
All types re-exported from `@ash-ai/shared`:
- `Agent`, `Session`, `SessionStatus`
- `AshStreamEvent`, `AshMessageEvent`, `AshErrorEvent`, `AshDoneEvent`
- `HealthResponse`, `PoolStats`

**Source:** `packages/sdk/src/index.ts`, `packages/sdk/src/sse.ts`

---

### 2. Python SDK (`/docs/sdks/python`)

**Content:**

#### Installation
```bash
pip install ash-ai-sdk
```

#### Usage
```python
from ash_sdk import AshClient

client = AshClient(server_url="http://localhost:4100", api_key="your-key")

# Deploy agent
client.deploy_agent("my-agent", "./my-agent")

# Create session
session = client.create_session("my-agent")

# Send message (streaming)
for event in client.send_message_stream(session.id, "Hello!"):
    if event.type == "message":
        print(event.data)
```

**Note:** Python SDK is auto-generated from OpenAPI spec. Link to generated docs.

**Source:** `packages/sdk-python/`

---

### 3. Direct API / curl (`/docs/sdks/curl`)

**Purpose:** For users who don't want an SDK, or who use other languages.

**Content:**

```bash
# Deploy agent
curl -X POST http://localhost:4100/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ASH_API_KEY" \
  -d '{"name":"my-agent","instructions":"You are helpful."}'

# Create session
curl -X POST http://localhost:4100/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ASH_API_KEY" \
  -d '{"agentName":"my-agent"}'

# Send message (SSE stream)
curl -N http://localhost:4100/api/sessions/$SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ASH_API_KEY" \
  -d '{"content":"Hello!"}'
```

**Source:** `docs/guides/connecting.md`

---

## Auto-Generation Opportunities

1. **TypeScript SDK:** Could auto-generate from TSDoc comments using `typedoc` and embed in Docusaurus
2. **Python SDK:** Already auto-generated from OpenAPI. Link to hosted pydoc or include generated markdown.
3. **OpenAPI spec:** Powers interactive "Try it" feature in API reference pages
