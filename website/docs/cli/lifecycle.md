---
sidebar_position: 2
title: Server Lifecycle
---

# Server Lifecycle

The CLI manages an Ash server running in a Docker container. These commands handle the full lifecycle: start, stop, status, and logs.

## `ash start`

Starts the Ash server in a Docker container.

```bash
ash start
```

The command:

1. Checks that Docker is installed and running
2. Removes any stale stopped container
3. Creates the data directory (`~/.ash/`)
4. Pulls the latest image (unless `--no-pull`)
5. Starts the container with port mapping and volume mounts
6. Waits for the health endpoint to respond (up to 30 seconds)

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port <port>` | Host port to expose | `4100` |
| `--tag <tag>` | Docker image tag | Latest published version |
| `--image <image>` | Full Docker image name (overrides default + tag) | `ghcr.io/ash-ai/ash` |
| `--no-pull` | Skip pulling the image; use a local build | Pull enabled |
| `--database-url <url>` | PostgreSQL/CockroachDB connection URL | SQLite (default) |
| `-e, --env <KEY=VALUE>` | Extra env vars to pass to the container (repeatable) | None |

### Examples

```bash
# Start with defaults
ash start

# Use a local dev image
ash start --image ash-dev --no-pull

# Use a specific port
ash start --port 8080

# Use Postgres instead of SQLite
ash start --database-url "postgresql://user:pass@host:5432/ash"

# Pass extra env vars
ash start -e ANTHROPIC_API_KEY=sk-ant-...
```

### Output

```
Starting Ash server...
Waiting for server to be ready...
Ash server is running.
  URL:      http://localhost:4100
  API key:  ash_xxxxxxxx (saved to ~/.ash/config.json)
  Data dir: /Users/you/.ash
```

The server auto-generates a secure API key on first start and the CLI saves it to `~/.ash/config.json`. Subsequent CLI commands use this key automatically.

## `ash stop`

Stops the running Ash server container.

```bash
ash stop
```

```
Stopping Ash server...
Ash server stopped.
```

If no container is found, prints a message and exits.

## `ash status`

Shows the current state of the Ash server container and, if running, its health stats.

```bash
ash status
```

### Example Output

```
Container: running
  ID:    a1b2c3d4e5f6
  Image: ghcr.io/ash-ai/ash:0.1.0
  Active sessions:  3
  Active sandboxes: 2
  Uptime:           1234s
```

When the container is stopped:

```
Container: exited
  ID:    a1b2c3d4e5f6
  Image: ghcr.io/ash-ai/ash:0.1.0
```

When no container exists:

```
Container: not-found
```

## `ash logs`

Shows logs from the Ash server container.

```bash
ash logs
```

### Options

| Flag | Description |
|------|-------------|
| `-f, --follow` | Follow log output (like `tail -f`) |

### Examples

```bash
# Show recent logs
ash logs

# Follow logs in real time
ash logs --follow
```
