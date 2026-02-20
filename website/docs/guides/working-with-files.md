---
sidebar_position: 5
title: Working with Files
---

# Working with Files

Each session runs inside an isolated sandbox with its own workspace directory. Files the agent creates, modifies, or downloads during a session are accessible through the files API. This lets you review agent-written code, download generated artifacts, or inspect the workspace state.

## Listing Files

Retrieve a flat list of all files in a session's workspace.

### TypeScript SDK

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

const result = await client.getSessionFiles(sessionId);
console.log(`Source: ${result.source}`); // "sandbox" or "snapshot"
for (const file of result.files) {
  console.log(`${file.path} (${file.size} bytes, modified ${file.modifiedAt})`);
}
```

### Python SDK

```python
from ash_sdk import AshClient

client = AshClient("http://localhost:4100")
# The Python SDK uses the raw API response
import httpx
resp = httpx.get(f"http://localhost:4100/api/sessions/{session_id}/files")
data = resp.json()
for f in data["files"]:
    print(f"{f['path']} ({f['size']} bytes)")
```

### curl

```bash
curl http://localhost:4100/api/sessions/SESSION_ID/files
```

Response:

```json
{
  "files": [
    {
      "path": "CLAUDE.md",
      "size": 512,
      "modifiedAt": "2025-01-15T10:30:00.000Z"
    },
    {
      "path": "src/index.ts",
      "size": 1024,
      "modifiedAt": "2025-01-15T10:35:00.000Z"
    },
    {
      "path": "output/report.md",
      "size": 4096,
      "modifiedAt": "2025-01-15T10:36:00.000Z"
    }
  ],
  "source": "sandbox"
}
```

The `source` field indicates where the file listing came from:

| Source | Meaning |
|--------|---------|
| `sandbox` | Read from the live sandbox process. The session is active or paused with its sandbox still running. |
| `snapshot` | Read from a persisted workspace snapshot. The sandbox was reclaimed but workspace state was saved. |

## Reading a File

Retrieve the content of a single file by its path.

### TypeScript SDK

```typescript
const file = await client.getSessionFile(sessionId, 'src/index.ts');
console.log(`Path: ${file.path}`);
console.log(`Size: ${file.size} bytes`);
console.log(`Source: ${file.source}`);
console.log(file.content);
```

### curl

```bash
curl http://localhost:4100/api/sessions/SESSION_ID/files/src/index.ts
```

Response:

```json
{
  "path": "src/index.ts",
  "content": "console.log('hello world');\n",
  "size": 28,
  "source": "sandbox"
}
```

### Limitations

- Maximum file size for inline content is 1 MB. Files larger than this return a 400 error.
- Binary files are not supported. Content is read as UTF-8 text.
- Path traversal (`..`) and absolute paths (`/`) are rejected with a 400 error.
- Certain directories are excluded from listings: `node_modules`, `.git`, `__pycache__`, `.cache`, `.npm`, `.venv`, and other common dependency/cache directories.

## Workspace Isolation

Each session's workspace is isolated from other sessions and from the host system. The agent can read and write files within its workspace but cannot access files outside of it.

When a session is created, the agent definition folder is copied into the sandbox workspace. Any files the agent creates during the session live alongside the agent definition files.

When a session is paused or ended, the workspace state is persisted as a snapshot. If the session is later resumed with a new sandbox (cold resume), the snapshot is restored so the agent picks up where it left off.

## Use Cases

**Reviewing agent-written code.** After an agent writes code in response to a prompt, list the workspace files and read specific files to review what was generated.

```typescript
const session = await client.createSession('code-writer');

// Ask the agent to write something
for await (const event of client.sendMessageStream(session.id, 'Write a Python fibonacci function')) {
  // wait for completion
}

// Review what was written
const files = await client.getSessionFiles(session.id);
for (const f of files.files) {
  if (f.path.endsWith('.py')) {
    const content = await client.getSessionFile(session.id, f.path);
    console.log(`--- ${content.path} ---`);
    console.log(content.content);
  }
}
```

**Downloading artifacts.** If an agent generates reports, data files, or other artifacts, read them after the session completes.

```typescript
// Session can be ended -- files are still accessible from snapshot
await client.endSession(session.id);
const report = await client.getSessionFile(session.id, 'output/report.md');
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions/:id/files` | List all files in the session workspace |
| `GET` | `/api/sessions/:id/files/*path` | Read a single file by path |
