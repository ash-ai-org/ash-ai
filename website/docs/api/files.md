---
sidebar_position: 5
title: Files
---

# Files

The Files API provides read access to files in a session's workspace. Each session has an isolated workspace directory where the agent operates. You can list all files and read individual file contents.

Files are resolved from the live sandbox when the session is active. If the sandbox has been evicted (session paused or ended), the server falls back to the most recent persisted snapshot. The `source` field in each response indicates which one was used.

---

## List Files

```
GET /api/sessions/:id/files
```

Returns a list of all files in the session's workspace, recursively. Certain directories and file types are excluded automatically: `node_modules`, `.git`, `__pycache__`, `.cache`, `.npm`, `.pnpm-store`, `.yarn`, `.venv`, `venv`, `.tmp`, `tmp`, and files with `.sock`, `.lock`, or `.pid` extensions.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |

### Response

**200 OK**

```json
{
  "files": [
    {
      "path": "CLAUDE.md",
      "size": 1234,
      "modifiedAt": "2025-06-15T10:30:00.000Z"
    },
    {
      "path": "src/index.ts",
      "size": 567,
      "modifiedAt": "2025-06-15T10:32:00.000Z"
    },
    {
      "path": "package.json",
      "size": 890,
      "modifiedAt": "2025-06-15T10:30:00.000Z"
    }
  ],
  "source": "sandbox"
}
```

| Field | Type | Description |
|---|---|---|
| `files` | FileEntry[] | Array of file entries |
| `files[].path` | string | Path relative to workspace root |
| `files[].size` | integer | File size in bytes |
| `files[].modifiedAt` | string | ISO 8601 last-modified timestamp |
| `source` | string | `"sandbox"` if read from the live sandbox, `"snapshot"` if read from a persisted snapshot |

### Errors

| Status | Condition |
|---|---|
| `404` | Session not found, or no workspace is available for the session |

```json
{
  "error": "No workspace available for this session",
  "statusCode": 404
}
```

---

## Read File

```
GET /api/sessions/:id/files/*
```

Returns the content of a single file from the session's workspace. The file path is specified as the wildcard portion of the URL.

Files larger than 1 MB (1,048,576 bytes) are rejected.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (UUID) | Session ID |
| `*` | string | File path relative to workspace root |

### Example Request

```
GET /api/sessions/f47ac10b-58cc-4372-a567-0e02b2c3d479/files/src/index.ts
```

### Response

**200 OK**

```json
{
  "path": "src/index.ts",
  "content": "import express from 'express';\n\nconst app = express();\napp.listen(3000);\n",
  "size": 67,
  "source": "sandbox"
}
```

| Field | Type | Description |
|---|---|---|
| `path` | string | The requested file path |
| `content` | string | Full file content as UTF-8 text |
| `size` | integer | File size in bytes |
| `source` | string | `"sandbox"` if read from the live sandbox, `"snapshot"` if from a persisted snapshot |

### Errors

| Status | Condition |
|---|---|
| `400` | Missing file path, path contains `..` traversal, path starts with `/`, path is a directory, or file exceeds 1 MB |
| `404` | Session not found, no workspace available, or file does not exist |

```json
{
  "error": "File not found",
  "statusCode": 404
}
```

---

## Use Cases

**Inspecting agent output.** After an agent writes code or generates files, use the Files API to retrieve the results without needing direct sandbox access.

```bash
# List what the agent created
curl http://localhost:4100/api/sessions/SESSION_ID/files \
  -H "Authorization: Bearer YOUR_API_KEY"

# Read a specific file
curl http://localhost:4100/api/sessions/SESSION_ID/files/output/report.md \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Building UIs.** The Files API provides the data needed to build file-browser components that show the agent's workspace in real time.

**Reviewing changes after a session ends.** Even after a session is paused or ended, files remain accessible from the persisted snapshot, so you can review what the agent produced.
