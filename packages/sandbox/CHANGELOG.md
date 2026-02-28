# @ash-ai/sandbox

## 0.0.13 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.14

## 0.0.12 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.13

## 0.0.11 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.12

## 0.0.10 - 2026-02-26

### Added

- Per-session MCP servers: merge session-level `mcpServers` into agent's `.mcp.json` (#27)
- Per-session system prompt override via `systemPrompt` option (#27)
- Bridge ready signal wait: `SandboxManager` waits for `R` byte from bridge stdout before connecting (#28)

### Fixed

- Removed 100ms polling loop in `BridgeClient.connect()` — socket is guaranteed listening (#28)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.11

## 0.0.9 - 2026-02-26

### Added

- Per-sandbox home directory isolation: each sandbox gets a private writable `/home/ash-sandbox` via bind mount (#25)
- Seed `.claude` config files from base image into per-sandbox home (#25)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.10

## 0.0.8 - 2026-02-25

### Changed

- Updated dependencies: @ash-ai/shared@0.0.9

## 0.0.7 - 2026-02-24

### Changed

- Updated dependencies: @ash-ai/shared@0.0.7

## 0.0.6 - 2026-02-24

### Added

- Sandbox pool state machine: warming, warm, waiting, running lifecycle
- Session-to-sandbox indexing for fast lookup
- Idle timeout cleanup for unused sandboxes
- Disk monitoring and OOM detection
- `SandboxDb` persistence abstraction: insertSandbox, updateState, getIdleSandboxes, eviction

### Changed

- Updated dependencies: @ash-ai/shared@0.0.6

## 0.0.5 - 2026-02-23

### Changed

- Updated dependencies: @ash-ai/shared@0.0.5

## 0.0.4 - 2026-02-21

### Added

- Workspace bundle support: create and extract agent workspace snapshots
- Bundle size limits (100MB) and path traversal protection

### Fixed

- Queue processor and workspace bundle edge cases

### Changed

- Updated dependencies: @ash-ai/shared@0.0.4

## 0.0.3 - 2026-02-20

### Changed

- Updated dependencies: @ash-ai/shared@0.0.3

## 0.0.2 - 2026-02-19

### Added

- Tenant-aware state persistence: session workspace snapshots stored under tenant-scoped directories
- `tenantId` parameter on `SandboxDb.insertSandbox` for tenant-scoped sandbox tracking

### Changed

- Updated dependencies: @ash-ai/shared@0.0.2

## 0.0.1

### Patch Changes

- [#1](https://github.com/ash-ai-org/ash-ai/pull/1) [`f3c8524`](https://github.com/ash-ai-org/ash-ai/commit/f3c8524cc83d8dae27595fe62555fcb4891242a5) Thanks [@nicholaslocascio](https://github.com/nicholaslocascio)! - Initial public release of Ash — a self-hostable platform for deploying and orchestrating hosted AI agents.

  - `@ash-ai/server` — Fastify REST API + SSE streaming server for session routing, agent registry, and sandbox orchestration
  - `@ash-ai/cli` — CLI for deploying agents, managing sessions, and controlling Ash servers
  - `@ash-ai/sdk` — TypeScript client SDK for programmatic interaction with Ash servers
  - `@ash-ai/sandbox` — Sandbox management: process isolation, pooling, bridge client, resource limits, and state persistence
  - `@ash-ai/bridge` — Bridge process that runs inside each sandbox and connects to the Claude Agent SDK
  - `@ash-ai/runner` — Worker node for multi-machine deployments, manages sandboxes on remote hosts
  - `@ash-ai/shared` — Shared types, protocol definitions, and constants

- Updated dependencies [[`f3c8524`](https://github.com/ash-ai-org/ash-ai/commit/f3c8524cc83d8dae27595fe62555fcb4891242a5)]:
  - @ash-ai/shared@0.0.1
