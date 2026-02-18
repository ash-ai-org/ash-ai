# Ash Documentation Index

## Guides

| Doc | Description |
|-----|-------------|
| [getting-started.md](./getting-started.md) | Install, start the server, deploy your first agent |
| [guides/connecting.md](./guides/connecting.md) | Connect to a running Ash server (SDK, CLI, Python, curl) |
| [cli-reference.md](./cli-reference.md) | All CLI commands and flags |
| [api-reference.md](./api-reference.md) | REST endpoints, SSE format, TypeScript types, SDK usage |
| [architecture.md](./architecture.md) | System design, data flow, sandbox isolation, protocol |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Building from source, running tests, project structure |
| [guides/ec2-deployment.md](./guides/ec2-deployment.md) | Deploy Ash to EC2 (ops guide) |
| [guides/gce-deployment.md](./guides/gce-deployment.md) | Deploy Ash to GCP Compute Engine (ops guide) |

## Plan

| Doc | Description |
|-----|-------------|
| [jeff-dean-plan/00-overview.md](./jeff-dean-plan/00-overview.md) | Master plan: 8 steps from current state to production |
| [jeff-dean-plan/01-consolidate.md](./jeff-dean-plan/01-consolidate.md) | Merge server + runner into one process |
| [jeff-dean-plan/02-sqlite-state.md](./jeff-dean-plan/02-sqlite-state.md) | Replace in-memory Maps with SQLite |
| [jeff-dean-plan/03-bridge-handshake.md](./jeff-dean-plan/03-bridge-handshake.md) | Fix the bridge connect race condition |
| [jeff-dean-plan/04-resource-limits.md](./jeff-dean-plan/04-resource-limits.md) | cgroups/ulimit for sandbox processes |
| [jeff-dean-plan/04b-sandbox-isolation.md](./jeff-dean-plan/04b-sandbox-isolation.md) | bwrap, env isolation, network namespaces |
| [jeff-dean-plan/05-backpressure.md](./jeff-dean-plan/05-backpressure.md) | Flow control on SSE streams |
| [jeff-dean-plan/06-measure.md](./jeff-dean-plan/06-measure.md) | Instrument the hot path |
| [jeff-dean-plan/07-session-resume.md](./jeff-dean-plan/07-session-resume.md) | Session persistence and resume |
| [jeff-dean-plan/08-split-when-full.md](./jeff-dean-plan/08-split-when-full.md) | Multi-machine split |

## Testing

| Doc | Description |
|-----|-------------|
| [jeff-dean-plan/testing/00-strategy.md](./jeff-dean-plan/testing/00-strategy.md) | Testing philosophy and pyramid |
| [jeff-dean-plan/testing/01-unit-shared.md](./jeff-dean-plan/testing/01-unit-shared.md) | Protocol encode/decode tests |
| [jeff-dean-plan/testing/02-unit-bridge.md](./jeff-dean-plan/testing/02-unit-bridge.md) | Bridge handler and mock SDK tests |
| [jeff-dean-plan/testing/03-unit-runner.md](./jeff-dean-plan/testing/03-unit-runner.md) | Bridge client, env isolation, pool tests |
| [jeff-dean-plan/testing/04-unit-server.md](./jeff-dean-plan/testing/04-unit-server.md) | Agent store, validator, session router tests |
| [jeff-dean-plan/testing/05-unit-cli-sdk.md](./jeff-dean-plan/testing/05-unit-cli-sdk.md) | SSE parsing, output, client tests |
| [jeff-dean-plan/testing/06-integration.md](./jeff-dean-plan/testing/06-integration.md) | End-to-end lifecycle tests |
| [jeff-dean-plan/testing/07-isolation.md](./jeff-dean-plan/testing/07-isolation.md) | Sandbox security escape tests |
| [jeff-dean-plan/testing/08-load.md](./jeff-dean-plan/testing/08-load.md) | Benchmarks and load tests |

## Decisions

| Doc | Description |
|-----|-------------|
| [decisions/0001-sdk-passthrough-types.md](./decisions/0001-sdk-passthrough-types.md) | Use SDK types directly instead of custom bridge/SSE event types |
| [decisions/0002-http-over-grpc-for-runner.md](./decisions/0002-http-over-grpc-for-runner.md) | HTTP + SSE for runner communication (not gRPC) |

*Additional decisions added as they are made. Format: `docs/decisions/NNNN-short-title.md`*

## Features

| Doc | Description |
|-----|-------------|
| [features/authentication.md](./features/authentication.md) | API key authentication: setup, SDK/CLI/curl usage, public endpoints |
| [features/sse-backpressure.md](./features/sse-backpressure.md) | SSE stream backpressure and write timeout |
| [features/hot-path-timing.md](./features/hot-path-timing.md) | Hot-path timing instrumentation (`ASH_DEBUG_TIMING=1`) |
| [features/docker-lifecycle.md](./features/docker-lifecycle.md) | Docker container lifecycle management (`ash start/stop/status/logs`) |
| [features/session-resume.md](./features/session-resume.md) | Session pause/resume with fast-path and cold-path recovery |
| [features/database.md](./features/database.md) | Configurable database: SQLite (default) + Postgres/CRDB via `ASH_DATABASE_URL` |
| [features/sandbox-pool.md](./features/sandbox-pool.md) | DB-backed sandbox pool with capacity limits, LRU eviction, and idle sweep |
| [features/openapi-spec.md](./features/openapi-spec.md) | OpenAPI spec generation, Swagger UI, and Python SDK |
| [features/multi-runner.md](./features/multi-runner.md) | Multi-runner architecture: standalone vs coordinator mode, session routing |
| [features/metrics.md](./features/metrics.md) | Prometheus `/metrics` endpoint, structured resume log lines, pool stats |

## Runbooks

*Created as failure modes are discovered. One doc per scenario in `docs/runbooks/`*

## Benchmarks

| Doc | Description |
|-----|-------------|
| [benchmarks/2026-02-18-pool-overhead.md](./benchmarks/2026-02-18-pool-overhead.md) | Pool operation latency: markRunning, eviction, sweep, stats |
| [benchmarks/2026-02-19-sandbox-startup.md](./benchmarks/2026-02-19-sandbox-startup.md) | Sandbox startup + TTFT: new session, warm resume, cold resume |
