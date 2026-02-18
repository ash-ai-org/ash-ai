# Contributing

This guide is for developers who want to build Ash from source, run the test suite, or contribute changes.

If you just want to **use** Ash, see the [Getting Started Guide](docs/getting-started.md).

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker

## Setup

```bash
git clone <repo-url> && cd ash
pnpm install
pnpm build
```

## Project Structure

```
ash/
├── packages/
│   ├── shared/        # Types, protocol, constants (no dependencies)
│   ├── bridge/        # Runs inside sandbox, talks to Claude Code SDK
│   ├── server/        # Fastify REST API, sandbox lifecycle, state persistence
│   ├── cli/           # ash CLI tool
│   ├── sdk/           # @ash-ai/sdk (TypeScript client)
│   └── sdk-python/    # ash-ai (Python client, generated from OpenAPI)
├── examples/
│   └── qa-bot/        # Next.js chat app example
├── docs/              # Architecture, decisions, features, runbooks
├── test/              # Integration tests, benchmarks
├── Makefile
└── Dockerfile
```

## Development Commands

```bash
# Build and test
make build             # Build all packages
make test              # Run unit tests
make typecheck         # Type-check all packages
make test-integration  # Run integration tests
make test-cli          # Build, docker-build, then run CLI integration tests
make bench             # Run benchmarks

# Run locally with Docker (recommended)
make dev               # Docker server + QA Bot UI (http://localhost:3100)

# Run locally without Docker (no sandbox isolation)
make dev-no-sandbox    # Native server + QA Bot UI

# Docker management
make docker-build      # Build local ash-dev image
make docker-start      # Start server in Docker
make docker-stop       # Stop server container
make docker-status     # Show container status
make docker-logs       # Show container logs

# Clean up
make kill              # Kill processes on dev ports and stop Docker
make clean             # Remove build artifacts
```

## Running a Single Package

```bash
# Server only (native, no Docker)
ASH_REAL_SDK=1 pnpm --filter '@ash-ai/server' dev

# QA Bot web UI only (needs server running)
pnpm --filter qa-bot dev

# Build a single package
pnpm --filter '@ash-ai/shared' build

# Test a single package
pnpm --filter '@ash-ai/server' test
```

## Using the CLI from Source

Instead of `ash`, use:

```bash
npx tsx packages/cli/src/index.ts <command>
```

For example:

```bash
npx tsx packages/cli/src/index.ts start --image ash-dev --no-pull
npx tsx packages/cli/src/index.ts deploy ./examples/qa-bot/agent --name qa-bot
npx tsx packages/cli/src/index.ts status
```

## OpenAPI and Python SDK

```bash
make openapi       # Generate OpenAPI spec from route schemas
make sdk-python    # Generate Python SDK from OpenAPI spec
```

## Publishing

```bash
make publish-dry-run   # See what would be published
make publish           # Publish all packages to npm
```

## Architecture

```
CLI / SDK  ──HTTP──>  ash-server (:4100)  ──unix socket──>  bridge  ──>  Claude Code SDK
                      (Fastify REST + SSE)                  (in sandbox)
```

- **Server** is the single entry point. Manages agent registry, session state (SQLite/Postgres), and sandbox lifecycle.
- **Bridge** runs inside each sandbox as an isolated child process. Communicates with the server over a Unix socket using newline-delimited JSON.
- **Sandbox isolation**: On Linux, uses bubblewrap (bwrap). In Docker, uses a non-root user with restricted environment. On macOS (dev), runs with restricted env but no filesystem isolation.

See [docs/architecture.md](docs/architecture.md) for the full design.

## Key Conventions

- **SDK types pass through** — Ash uses the Claude Code SDK's types (`Message`, `AssistantMessage`, etc.) directly. Don't create wrapper types for conversation data.
- **Test boundaries, not glue** — Test API contracts, state transitions, and failure modes. Don't test trivial wrappers.
- **Document what you build** — Features go in `docs/features/`, decisions in `docs/decisions/`, benchmarks in `docs/benchmarks/`.
