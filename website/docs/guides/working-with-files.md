---
sidebar_position: 5
title: Working with Files
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Working with Files

Each session runs inside an isolated sandbox with its own workspace directory. Files the agent creates, modifies, or downloads during a session are accessible through the files API. This lets you review agent-written code, download generated artifacts, or inspect the workspace state.

## Listing Files

Retrieve a flat list of all files in a session's workspace.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

const result = await client.getSessionFiles(sessionId);
console.log(`Source: ${result.source}`); // "sandbox" or "snapshot"
for (const file of result.files) {
  console.log(`${file.path} (${file.size} bytes, modified ${file.modifiedAt})`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_sdk import AshClient
import httpx

client = AshClient("http://localhost:4100")
# The Python SDK uses the raw API response
resp = httpx.get(f"http://localhost:4100/api/sessions/{session_id}/files")
data = resp.json()
for f in data["files"]:
    print(f"{f['path']} ({f['size']} bytes)")
```

</TabItem>
</Tabs>

### curl

```bash
curl $ASH_SERVER_URL/api/sessions/SESSION_ID/files
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

## Downloading a File (Raw)

Download a file as raw bytes. This is the default behavior and works for any file type — text, binary, images, PDFs, etc. Files up to 100 MB are supported.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const { buffer, mimeType, source } = await client.downloadSessionFile(sessionId, 'output/report.pdf');
console.log(`Type: ${mimeType}, Source: ${source}`);
fs.writeFileSync('report.pdf', buffer);
```

</TabItem>
<TabItem value="python" label="Python">

```python
resp = httpx.get(f"http://localhost:4100/api/sessions/{session_id}/files/output/report.pdf")
with open("report.pdf", "wb") as f:
    f.write(resp.content)
print(f"Type: {resp.headers['content-type']}")
print(f"Source: {resp.headers['x-ash-source']}")
```

</TabItem>
</Tabs>

### curl

```bash
# Download raw file
curl -o report.pdf $ASH_SERVER_URL/api/sessions/SESSION_ID/files/output/report.pdf
```

The response includes these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | MIME type based on file extension (e.g. `application/pdf`, `text/typescript`) |
| `Content-Disposition` | Suggested filename for download |
| `Content-Length` | File size in bytes |
| `X-Ash-Source` | `sandbox` or `snapshot` |

## Reading a File (JSON)

For text files, you can get the content inline as a JSON response by adding `?format=json`. This is useful for building UIs that display file content directly. Limited to 1 MB.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const file = await client.getSessionFile(sessionId, 'src/index.ts');
console.log(`Path: ${file.path}`);
console.log(`Size: ${file.size} bytes`);
console.log(`Source: ${file.source}`);
console.log(file.content);
```

</TabItem>
<TabItem value="python" label="Python">

```python
resp = httpx.get(
    f"http://localhost:4100/api/sessions/{session_id}/files/src/index.ts",
    params={"format": "json"}
)
data = resp.json()
print(f"Path: {data['path']}")
print(f"Size: {data['size']} bytes")
print(data["content"])
```

</TabItem>
</Tabs>

### curl

```bash
curl "$ASH_SERVER_URL/api/sessions/SESSION_ID/files/src/index.ts?format=json"
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

### Limitations (JSON mode)

- Maximum file size is 1 MB. For larger files, use the raw download.
- Content is read as UTF-8 text. Binary files should use the raw download instead.
- Path traversal (`..`) and absolute paths (`/`) are rejected with a 400 error.
- Certain directories are excluded from listings: `node_modules`, `.git`, `__pycache__`, `.cache`, `.npm`, `.venv`, and other common dependency/cache directories.

## Workspace Isolation

Each session's workspace is isolated from other sessions and from the host system. The agent can read and write files within its workspace but cannot access files outside of it.

When a session is created, the agent definition folder is copied into the sandbox workspace. Any files the agent creates during the session live alongside the agent definition files.

When a session is paused or ended, the workspace state is persisted as a snapshot. If the session is later resumed with a new sandbox (cold resume), the snapshot is restored so the agent picks up where it left off.

## Use Cases

**Reviewing agent-written code.** After an agent writes code in response to a prompt, list the workspace files and read specific files to review what was generated.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

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

</TabItem>
<TabItem value="python" label="Python">

```python
session = client.create_session("code-writer")

# Ask the agent to write something
for event in client.send_message_stream(session.id, "Write a Python fibonacci function"):
    pass  # wait for completion

# Review what was written
resp = httpx.get(f"http://localhost:4100/api/sessions/{session.id}/files")
for f in resp.json()["files"]:
    if f["path"].endswith(".py"):
        file_resp = httpx.get(
            f"http://localhost:4100/api/sessions/{session.id}/files/{f['path']}",
            params={"format": "json"}
        )
        data = file_resp.json()
        print(f"--- {data['path']} ---")
        print(data["content"])
```

</TabItem>
</Tabs>

**Downloading binary artifacts.** If an agent generates images, PDFs, or other binary files, download them directly.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// Download a generated image
const { buffer } = await client.downloadSessionFile(session.id, 'output/chart.png');
fs.writeFileSync('chart.png', buffer);
```

</TabItem>
<TabItem value="python" label="Python">

```python
# Download a generated image
resp = httpx.get(f"http://localhost:4100/api/sessions/{session.id}/files/output/chart.png")
with open("chart.png", "wb") as f:
    f.write(resp.content)
```

</TabItem>
</Tabs>

**Accessing files after a session ends.** Files remain available from the persisted snapshot.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
await client.endSession(session.id);
// Files still accessible from snapshot
const report = await client.getSessionFile(session.id, 'output/report.md');
```

</TabItem>
<TabItem value="python" label="Python">

```python
client.end_session(session.id)
# Files still accessible from snapshot
resp = httpx.get(
    f"http://localhost:4100/api/sessions/{session.id}/files/output/report.md",
    params={"format": "json"}
)
report = resp.json()
```

</TabItem>
</Tabs>

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions/:id/files` | List all files in the session workspace |
| `GET` | `/api/sessions/:id/files/*path` | Download a file (raw bytes by default, JSON with `?format=json`) |
