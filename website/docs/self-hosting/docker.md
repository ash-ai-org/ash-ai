---
sidebar_position: 1
title: Docker (Default)
---

# Docker (Default)

The recommended way to run Ash is via Docker. The `ash start` command manages the entire Docker lifecycle for you -- pulling the image, creating volumes, and starting the container with the correct flags.

## Quick Start

```bash
npm install -g @ash-ai/cli

export ANTHROPIC_API_KEY=sk-ant-...
ash start
```

That is it. The server is now running at `http://localhost:4100`.

## What `ash start` Does

When you run `ash start`, the CLI performs the following steps in order:

1. **Checks Docker** -- verifies Docker is installed and the daemon is running.
2. **Removes stale containers** -- if a stopped `ash-server` container exists, it is removed.
3. **Creates `~/.ash/`** -- ensures the persistent data directory exists on the host.
4. **Pulls the image** -- downloads `ghcr.io/ash-ai/ash:0.1.0` (skip with `--no-pull`).
5. **Starts the container** -- runs `docker run` with the flags described below.
6. **Waits for healthy** -- polls `GET /health` until the server responds 200 (up to 30 seconds).

### Docker Flags

The container is started with these flags:

| Flag | Purpose |
|------|---------|
| `--init` | Runs [tini](https://github.com/krallin/tini) as PID 1 so signals (SIGTERM, SIGINT) are forwarded correctly to child processes. Without this, sandbox processes can become zombies on shutdown. |
| `--cgroupns=host` | Shares the host's cgroup namespace so the entrypoint script can create per-sandbox cgroups for memory, CPU, and process limits. |
| `-v ~/.ash:/data` | Mounts the host data directory into the container. All persistent state -- SQLite database, agent definitions, session workspaces -- lives here. |
| `-p 4100:4100` | Exposes the API on the host. Configurable with `--port`. |
| `-e ANTHROPIC_API_KEY=...` | Passes your API key into the container. The key is read from your shell environment. |

### Entrypoint: cgroup v2 Setup

The container uses a custom entrypoint (`docker-entrypoint.sh`) that configures cgroup v2 delegation before starting the server. This enables per-sandbox resource limits (memory, CPU, process count). If cgroup v2 is not available (older kernels or restricted Docker configurations), the server falls back to ulimit-based limits.

## Lifecycle Commands

```bash
# Start the server (pulls image, creates container, waits for healthy)
ash start

# Check server status (container state + health endpoint)
ash status

# View logs (add -f to follow)
ash logs
ash logs -f

# Stop and remove the container
ash stop
```

## Configuration

Pass environment variables to the container with `-e`:

```bash
ash start -e ASH_MAX_SANDBOXES=50

# Override the auto-generated API key (optional — not required for basic setup)
ash start -e ASH_API_KEY=my-secret-key
```

Use `--database-url` to connect to an external database instead of the default SQLite:

```bash
ash start --database-url "postgresql://user:pass@host:5432/ash"
```

Use `--port` to change the host port:

```bash
ash start --port 8080
```

Use `--image` to run a custom image (for example, a local build):

```bash
docker build -t ash-dev .
ash start --image ash-dev --no-pull
```

See the [Configuration Reference](./configuration.md) for all environment variables.

## Volume Mount Layout

The host directory `~/.ash/` is mounted into the container at `/data/`. Here is what it contains:

```
~/.ash/                        (host)     →  /data/           (container)
├── ash.db                                    SQLite database (agents, sessions, sandboxes, messages)
├── agents/                                   Deployed agent definitions
│   └── my-agent/
│       ├── CLAUDE.md
│       └── .claude/
├── sessions/                                 Persisted session workspaces
│   └── <session-id>/
│       ├── workspace/                        Snapshot of the sandbox filesystem
│       └── metadata.json                     Agent name, persist timestamp
└── sandboxes/                                Active sandbox working directories
    └── <sandbox-id>/
        └── workspace/
```

Because all state lives in `~/.ash/`, you can stop and restart the container without losing data. Sessions, agents, and the database survive across restarts.

## Docker Compose for Production

For production deployments with CockroachDB (or PostgreSQL):

```yaml
version: "3.8"

services:
  ash:
    image: ghcr.io/ash-ai/ash:0.1.0
    init: true
    privileged: true
    ports:
      - "4100:4100"
    volumes:
      - ash-data:/data
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ASH_API_KEY=${ASH_API_KEY}  # Required for Docker Compose — auto-generation only works with `ash start`
      - ASH_DATABASE_URL=postgresql://ash:ash@cockroach:26257/ash?sslmode=disable
      - ASH_MAX_SANDBOXES=200
      - ASH_IDLE_TIMEOUT_MS=1800000
    depends_on:
      cockroach:
        condition: service_healthy

  cockroach:
    image: cockroachdb/cockroach:v24.1.0
    command: start-single-node --insecure
    ports:
      - "26257:26257"
      - "8080:8080"
    volumes:
      - cockroach-data:/cockroach/cockroach-data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  ash-data:
  cockroach-data:
```

Start with:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ASH_API_KEY=my-production-key
docker compose up -d
```

## Resource Recommendations

| Concurrent Sessions | CPU | RAM | Disk |
|---------------------|-----|-----|------|
| 1--5 | 2 cores | 4 GB | 20 GB |
| 5--20 | 4 cores | 8 GB | 50 GB |
| 20--50 | 8 cores | 16 GB | 100 GB |

Each active sandbox uses up to 2 GB of memory (configurable via resource limits) and 1 GB of disk by default. Plan capacity based on your peak concurrent session count, not total sessions -- idle sessions are evicted to disk and do not consume memory.

## Using a Local Build

If you are developing Ash itself or need a custom image:

```bash
# Build the image from the repository root
docker build -t ash-dev .

# Start using the local image (skip pulling from registry)
ash start --image ash-dev --no-pull
```

The Dockerfile builds the full monorepo, installs `@anthropic-ai/claude-code` globally, creates a non-root sandbox user, and configures the entrypoint for cgroup v2 delegation.
