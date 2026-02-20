---
sidebar_position: 1
title: Installation
---

# Installation

Get the Ash CLI installed and the server running.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 20 ([download](https://nodejs.org/)) |
| **Docker** | Required for `ash start` ([install Docker](https://docs.docker.com/get-docker/)) |
| **Anthropic API key** | Get one at [console.anthropic.com](https://console.anthropic.com/) |

## Install the CLI

```bash
npm install -g @ash-ai/cli
```

Verify the installation:

```bash
ash --help
```

You should see a list of available commands including `start`, `deploy`, `session`, `agent`, and `health`.

## Set Your API Key

Ash needs an Anthropic API key to run agents. Export it in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

For persistence, add the export to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.).

## Start the Server

```bash
ash start
```

This pulls the Ash Docker image, starts the container, and waits for the server to become healthy:

```
Pulling ghcr.io/ash-ai/ash:latest...
Starting Ash server...
Waiting for server to be ready...
Ash server is running.
  URL:      http://localhost:4100
  Data dir: ~/.ash
```

### `ash start` Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port <port>` | `4100` | Host port to expose |
| `--database-url <url>` | SQLite (`data/ash.db`) | Use Postgres or CockroachDB instead of SQLite. Example: `postgresql://user:pass@host:5432/ash` |
| `--env KEY=VALUE` | -- | Pass extra environment variables to the container. Can be specified multiple times. |
| `--tag <tag>` | `latest` | Docker image tag |
| `--image <image>` | -- | Full Docker image name (overrides default + tag) |
| `--no-pull` | -- | Skip pulling the image (use a local build) |

Examples:

```bash
# Custom port
ash start --port 5000

# Use Postgres
ash start --database-url "postgresql://localhost:5432/ash"

# Pass additional environment variables
ash start --env ASH_SNAPSHOT_URL=s3://my-bucket/snapshots/

# Use a local dev image
ash start --image ash-dev --no-pull
```

## Verify the Server

Check that the server is running and healthy:

```bash
ash health
```

Expected output:

```json
{ "status": "ok", "activeSessions": 0, "activeSandboxes": 0, "uptime": 5 }
```

You can also check container status:

```bash
ash status
```

## Stopping the Server

```bash
ash stop
```

This stops and removes the Docker container. Session data persists in `~/.ash` (SQLite) or your configured database.

## View Logs

```bash
ash logs        # Show server logs
ash logs -f     # Follow logs in real-time
```

## Next Step

With the server running, follow the [Quickstart](quickstart.md) to deploy your first agent.
