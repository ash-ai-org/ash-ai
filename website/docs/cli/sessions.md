---
sidebar_position: 4
title: Session Commands
---

# Session Commands

Create, message, and manage agent sessions from the terminal.

## `ash session create <agent>`

Creates a new session for the named agent. A sandbox is allocated and the agent's workspace is initialized.

```bash
ash session create qa-bot
```

```
Session created: {
  "id": "b2c3d4e5-1234-5678-9abc-def012345678",
  "agentName": "qa-bot",
  "sandboxId": "b2c3d4e5-1234-5678-9abc-def012345678",
  "status": "active",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "lastActiveAt": "2026-01-15T10:00:00.000Z"
}
```

## `ash session send <id> <message>`

Sends a message to a session and streams the response. SSE events are printed as they arrive.

```bash
ash session send b2c3d4e5-1234-5678-9abc-def012345678 "What files are in the workspace?"
```

```
[message] assistant: {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]}}
[message] result: {"type":"result","subtype":"success","session_id":"...","num_turns":1}
[done] {"sessionId":"b2c3d4e5-..."}
```

Each line shows the SSE event type in brackets followed by the SDK message type and a truncated JSON preview.

## `ash session list`

Lists all sessions.

```bash
ash session list
```

```json
[
  {
    "id": "b2c3d4e5-...",
    "agentName": "qa-bot",
    "sandboxId": "b2c3d4e5-...",
    "status": "active",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "lastActiveAt": "2026-01-15T10:01:00.000Z"
  },
  {
    "id": "c3d4e5f6-...",
    "agentName": "qa-bot",
    "status": "paused",
    ...
  }
]
```

## `ash session pause <id>`

Pauses an active session. The workspace state is persisted and the sandbox remains alive for fast resume.

```bash
ash session pause b2c3d4e5-1234-5678-9abc-def012345678
```

```
Session paused: {
  "id": "b2c3d4e5-...",
  "status": "paused",
  ...
}
```

## `ash session resume <id>`

Resumes a paused or errored session. If the sandbox is still alive, resume is instant (warm path). If the sandbox was evicted, a new one is created and the workspace is restored (cold path).

```bash
ash session resume b2c3d4e5-1234-5678-9abc-def012345678
```

```
Session resumed: {
  "id": "b2c3d4e5-...",
  "status": "active",
  ...
}
```

## `ash session end <id>`

Ends a session permanently. The sandbox is destroyed and the session status is set to `ended`.

```bash
ash session end b2c3d4e5-1234-5678-9abc-def012345678
```

```
Session ended: {
  "id": "b2c3d4e5-...",
  "status": "ended",
  ...
}
```

## Full Lifecycle Example

```bash
# Deploy an agent
ash deploy ./my-agent --name helper

# Create a session
ash session create helper
# Note the session ID from the output

# Send messages
ash session send SESSION_ID "List the project structure"
ash session send SESSION_ID "Read the README"

# Pause when done for now
ash session pause SESSION_ID

# Resume later
ash session resume SESSION_ID
ash session send SESSION_ID "Summarize what you found"

# End when finished
ash session end SESSION_ID
```
