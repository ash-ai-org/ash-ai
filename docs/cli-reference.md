# CLI Reference

## Installation

```bash
npm install -g @ash-ai/cli
```

This installs the `ash` command globally.

**Server URL**: Reads `ASH_SERVER_URL` from the environment. Defaults to `http://localhost:4100`.

---

## Server Lifecycle

### `ash start`

Start the Ash server in a Docker container.

| Option | Description |
|--------|-------------|
| `--port <port>` | Host port to expose (default: 4100) |
| `--tag <tag>` | Docker image tag (default: 0.1.0) |
| `--image <image>` | Full Docker image name (overrides default + tag) |
| `--no-pull` | Skip pulling the image (use local build) |

```bash
ash start                              # Pull and start
ash start --port 5000                  # Custom port
ash start --image ash-dev --no-pull    # Use local dev image
```

Checks Docker is installed and running, removes stale containers, pulls the image, starts the container, and polls `/health` until ready (30s timeout).

---

### `ash stop`

Stop and remove the Ash server container.

```bash
ash stop
```

---

### `ash status`

Show container status and server health.

```bash
ash status
# Container: running
#   ID:    abc123def456
#   Image: ghcr.io/ash-ai/ash:0.1.0
#   Active sessions:  2
#   Active sandboxes: 2
#   Uptime:           347s
```

---

### `ash logs`

Show server container logs.

| Option | Description |
|--------|-------------|
| `-f, --follow` | Follow log output |

```bash
ash logs        # Show logs
ash logs -f     # Follow logs
```

---

## Agent Management

### `ash deploy <path> [--name <name>]`

Deploy an agent to the server.

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to agent directory (must contain `CLAUDE.md`) |
| `--name, -n` | No | Agent name. Defaults to directory basename. |

Copies the agent directory to `~/.ash/agents/<name>/` and registers it with the server.

```bash
ash deploy ./my-agent --name my-agent
# Copied agent files to ~/.ash/agents/my-agent
# Deployed agent: { "name": "my-agent", "version": 1, ... }
```

---

### `ash agent list`

List all deployed agents. Prints JSON array.

```bash
ash agent list
# [{ "name": "qa-bot", "version": 1, "path": "/...", ... }]
```

---

### `ash agent info <name>`

Get details for one agent.

| Argument | Required | Description |
|----------|----------|-------------|
| `<name>` | Yes | Agent name |

```bash
ash agent info qa-bot
# { "name": "qa-bot", "version": 1, ... }
```

---

### `ash agent delete <name>`

Delete an agent registration. Does not affect running sessions.

| Argument | Required | Description |
|----------|----------|-------------|
| `<name>` | Yes | Agent name |

```bash
ash agent delete qa-bot
# Deleted agent: qa-bot
```

---

## Session Management

### `ash session create <agent>`

Create a new session. Spawns a sandbox process.

| Argument | Required | Description |
|----------|----------|-------------|
| `<agent>` | Yes | Agent name (must be deployed first) |

```bash
ash session create qa-bot
# { "id": "550e8400-...", "status": "active", ... }
```

---

### `ash session send <id> <message>`

Send a message and print the streamed response.

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Session UUID |
| `<message>` | Yes | Message content |

Reads the SSE stream and prints each event to stdout.

```bash
ash session send 550e8400-... "What is a closure?"
# [message] assistant: {"content":"A closure is a function..."}
# [done] 550e8400-...
```

---

### `ash session list`

List all sessions (all statuses). Prints JSON array.

```bash
ash session list
# [{ "id": "...", "agentName": "qa-bot", "status": "active", ... }]
```

---

### `ash session end <id>`

End a session and destroy its sandbox process.

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Session UUID |

```bash
ash session end 550e8400-...
# { "id": "...", "status": "ended", ... }
```

---

## Health

### `ash health`

Check server health.

```bash
ash health
# { "status": "ok", "activeSessions": 1, "activeSandboxes": 1, "uptime": 120 }
```
