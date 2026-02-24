# AshClient API Reference

## Constructor

### TypeScript

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: string,   // Ash server URL (e.g., 'http://localhost:4100')
  apiKey?: string,     // Bearer token (optional in local dev mode)
});
```

### Python

```python
from ash_ai import AshClient

client = AshClient(
    server_url: str,    # Ash server URL
    api_key: str = None # Bearer token (optional in local dev mode)
)
```

## Agents

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `deployAgent(name, path)` | `deploy_agent(name, path)` | Deploy agent from directory path on server |
| `listAgents()` | `list_agents()` | List all deployed agents |
| `getAgent(name)` | `get_agent(name)` | Get agent by name |
| `deleteAgent(name)` | `delete_agent(name)` | Delete agent and its sessions |

### TypeScript Signatures

```typescript
deployAgent(name: string, path: string): Promise<Agent>
listAgents(): Promise<Agent[]>
getAgent(name: string): Promise<Agent>
deleteAgent(name: string): Promise<void>
```

### Agent Type

```typescript
interface Agent {
  id: string;
  name: string;
  version: number;
  path: string;
  createdAt: string;
  updatedAt: string;
}
```

## Sessions

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `createSession(agent, opts?)` | `create_session(agent, **kwargs)` | Create new session |
| `listSessions(agent?)` | `list_sessions(agent?)` | List sessions |
| `getSession(id)` | `get_session(id)` | Get session by ID |
| `pauseSession(id)` | `pause_session(id)` | Pause session |
| `resumeSession(id)` | `resume_session(id)` | Resume session |
| `endSession(id)` | `end_session(id)` | End session permanently |
| `stopSession(id)` | — | Stop/interrupt active session |
| `forkSession(id)` | — | Fork session (branch) |

### TypeScript Signatures

```typescript
createSession(agent: string, opts?: {
  credentialId?: string;
  extraEnv?: Record<string, string>;
  startupScript?: string;
}): Promise<Session>

listSessions(agent?: string): Promise<Session[]>
getSession(id: string): Promise<Session>
pauseSession(id: string): Promise<Session>
resumeSession(id: string): Promise<Session>
endSession(id: string): Promise<Session>
stopSession(id: string): Promise<Session>
forkSession(id: string): Promise<Session>
```

### Session Type

```typescript
interface Session {
  id: string;
  agentName: string;
  sandboxId: string;
  status: 'starting' | 'active' | 'paused' | 'stopped' | 'ended' | 'error';
  createdAt: string;
  lastActiveAt: string;
}
```

## Messages

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `sendMessageStream(id, content, opts?)` | `send_message_stream(id, content, **kwargs)` | Send message, stream response |
| `sendMessage(id, content, opts?)` | — | Send message, get raw Response |
| `listMessages(id, opts?)` | `list_messages(id, **kwargs)` | List persisted messages |

### TypeScript Signatures

```typescript
sendMessageStream(sessionId: string, content: string, opts?: {
  includePartialMessages?: boolean;
}): AsyncGenerator<AshStreamEvent>

sendMessage(sessionId: string, content: string, opts?: {
  includePartialMessages?: boolean;
}): Promise<Response>

listMessages(sessionId: string, opts?: {
  limit?: number;
  afterSequence?: number;
}): Promise<Message[]>
```

### AshStreamEvent Type

```typescript
type AshStreamEvent =
  | { type: 'message'; data: Record<string, any> }
  | { type: 'error'; data: { error: string } }
  | { type: 'done'; data: { sessionId: string } }
  | { type: 'text_delta'; data: { delta: string } }
  | { type: 'thinking_delta'; data: { delta: string } }
  | { type: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { type: 'tool_result'; data: { tool_use_id: string; content: unknown; is_error?: boolean } }
  | { type: 'turn_complete'; data: { numTurns?: number; result?: string } }
  | { type: string; data: Record<string, any> }  // unknown events
```

## Session Events (Timeline)

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `listSessionEvents(id, opts?)` | `list_session_events(id, **kwargs)` | List timeline events |

### TypeScript Signature

```typescript
listSessionEvents(sessionId: string, opts?: {
  limit?: number;
  afterSequence?: number;
  type?: 'text' | 'tool_start' | 'tool_result' | 'reasoning' | 'error' | 'turn_complete' | 'lifecycle';
}): Promise<SessionEvent[]>
```

## Files

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `getSessionFiles(id)` | — | List workspace files |
| `getSessionFile(id, path)` | — | Read file content (JSON, 1MB limit) |
| `downloadSessionFile(id, path)` | — | Download file as raw bytes (100MB limit) |

### TypeScript Signatures

```typescript
getSessionFiles(sessionId: string): Promise<ListFilesResponse>
getSessionFile(sessionId: string, path: string): Promise<GetFileResponse>
downloadSessionFile(sessionId: string, path: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  source: string;
}>
```

## Shell Execution

| Method (TS) | Description |
|-------------|-------------|
| `exec(sessionId, command, opts?)` | Execute shell command in sandbox |

```typescript
exec(sessionId: string, command: string, opts?: {
  timeout?: number;
}): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

## Credentials

| Method (TS) | Description |
|-------------|-------------|
| `storeCredential(type, key, label?)` | Store API key |
| `listCredentials()` | List credentials |
| `deleteCredential(id)` | Delete credential |

## Attachments

| Method (TS) | Description |
|-------------|-------------|
| `uploadAttachment(sessionId, filename, content, opts?)` | Upload file |
| `listAttachments(sessionId)` | List attachments |
| `downloadAttachment(id)` | Download attachment |
| `deleteAttachment(id)` | Delete attachment |

## Workspace Bundles

| Method (TS) | Description |
|-------------|-------------|
| `downloadWorkspace(sessionId)` | Download workspace as tar.gz |
| `uploadWorkspace(sessionId, bundle)` | Upload tar.gz to restore workspace |

## Queue

| Method (TS) | Description |
|-------------|-------------|
| `enqueue(agentName, prompt, opts?)` | Add job to queue |
| `listQueueItems(opts?)` | List queue items |
| `getQueueItem(id)` | Get queue item |
| `cancelQueueItem(id)` | Cancel queue item |
| `getQueueStats()` | Get queue statistics |

## Usage Tracking

| Method (TS) | Description |
|-------------|-------------|
| `listUsageEvents(opts?)` | List usage events |
| `getUsageStats(opts?)` | Get aggregated usage stats |

## Health

| Method (TS) | Method (Python) | Description |
|-------------|-----------------|-------------|
| `health()` | `health()` | Server health check |

```typescript
health(): Promise<{
  status: 'ok';
  activeSessions: number;
  activeSandboxes: number;
  uptime: number;
  pool: PoolStats;
}>
```
