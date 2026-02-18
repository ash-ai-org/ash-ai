# Docker Lifecycle Management

**Date**: 2026-02-18

## What

CLI commands (`ash start`, `ash stop`, `ash status`, `ash logs`) that manage an Ash server running inside a Docker container. Developers install `ash` via npm and get a fully isolated server without manual Docker flags.

## Why

Running the Ash server natively on macOS provides zero sandbox isolation — no bubblewrap, no cgroups. Docker provides a Linux environment with proper isolation primitives. Wrapping Docker management in CLI commands makes this transparent to the developer.

Alternative considered: native background process management (like `pm2`). Rejected because it doesn't solve the isolation problem on macOS, and Docker provides a consistent Linux environment regardless of host OS.

## How

### Commands

| Command | Description |
|---------|-------------|
| `ash start` | Pull image, start container, wait for healthy |
| `ash stop` | Stop and remove container |
| `ash status` | Show container state + server health |
| `ash logs [-f]` | Show (or follow) container logs |

### Container Configuration

```
docker run -d \
  --name ash-server \
  --init \
  --cgroupns=host \
  -p 4100:4100 \
  -v ~/.ash:/data \
  -e ANTHROPIC_API_KEY \
  ghcr.io/ash-ai/ash:0.1.0
```

Key flags:
- `--init` — proper signal handling (PID 1 reaping)
- `--cgroupns=host` — cgroup v2 delegation for sandbox resource limits
- `-v ~/.ash:/data` — persistent data (agents, database, sandboxes) survives container restarts

### Volume Mount Layout

```
Host: ~/.ash/              Container: /data/
├── agents/                ├── agents/
│   └── my-agent/          │   └── my-agent/
│       └── CLAUDE.md      │       └── CLAUDE.md
├── ash.db                 ├── ash.db
└── sandboxes/             └── sandboxes/
```

### Agent Deploy Flow

1. CLI validates `CLAUDE.md` exists in source directory
2. CLI copies agent directory to `~/.ash/agents/<name>/`
3. CLI sends `{ name, path: "agents/<name>" }` (relative path) to server API
4. Server resolves relative path against its `ASH_DATA_DIR` (`/data/` in Docker, configurable native)
5. Server validates `CLAUDE.md` exists at resolved path and registers agent

This works for both Docker (volume mount) and native mode without any conditional logic.

### Health Check

`ash start` polls `GET /health` at 500ms intervals for up to 30 seconds after starting the container. If the server doesn't become healthy, it prints an error and suggests `ash logs`.

### Environment Variable Passthrough

`ANTHROPIC_API_KEY` is automatically passed from the host environment into the container. This is the only secret the container needs for agent operation.

### CLI Options

```
ash start [options]
  --port <port>   Host port to expose (default: 4100)
  --tag <tag>     Docker image tag (default: 0.1.0)
  --no-pull       Skip pulling the image (use local build)

ash logs [options]
  -f, --follow    Follow log output
```

## Known Limitations

- No `ash start --build` — use `docker build` + `--no-pull` for local development
- No native `--no-docker` background process mode — this is a future feature
- No CI image publishing — for now, build locally with `docker build -t ghcr.io/ash-ai/ash:0.1.0 .`
- `ANTHROPIC_API_KEY` must be set in the host environment before `ash start`
