---
sidebar_position: 3
title: Agent Commands
---

# Agent Commands

Deploy and manage agent definitions on the Ash server.

## `ash deploy <path>`

Deploys an agent from a local directory. The directory must contain a `CLAUDE.md` file.

```bash
ash deploy ./my-agent --name my-agent
```

The command copies the agent directory to `~/.ash/agents/<name>/` (so it is accessible inside the Docker container via volume mount), then registers it with the server.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --name <name>` | Agent name | Directory name |

### Example

```bash
ash deploy ./examples/qa-bot/agent --name qa-bot
```

```
Copied agent files to /Users/you/.ash/agents/qa-bot
Deployed agent: {
  "id": "a1b2c3d4-...",
  "name": "qa-bot",
  "version": 1,
  "path": "agents/qa-bot",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

Deploying the same name again increments the version:

```bash
ash deploy ./examples/qa-bot/agent --name qa-bot
```

```
Deployed agent: {
  ...
  "version": 2,
  ...
}
```

## `ash agent list`

Lists all deployed agents.

```bash
ash agent list
```

```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "qa-bot",
    "version": 2,
    "path": "agents/qa-bot",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-01-15T10:05:00.000Z"
  },
  {
    "id": "e5f6a7b8-...",
    "name": "code-reviewer",
    "version": 1,
    "path": "agents/code-reviewer",
    "createdAt": "2026-01-15T11:00:00.000Z",
    "updatedAt": "2026-01-15T11:00:00.000Z"
  }
]
```

## `ash agent info <name>`

Gets details for a specific agent.

```bash
ash agent info qa-bot
```

```json
{
  "id": "a1b2c3d4-...",
  "name": "qa-bot",
  "version": 2,
  "path": "agents/qa-bot",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:05:00.000Z"
}
```

## `ash agent delete <name>`

Deletes an agent and its associated sessions.

```bash
ash agent delete qa-bot
```

```
Deleted agent: qa-bot
```
