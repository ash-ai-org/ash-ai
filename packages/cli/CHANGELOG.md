# @ash-ai/cli

## 0.0.5 - 2026-02-23

### Added

- `ash session files` subcommand for listing and reading session files
- File upload client support

### Changed

- Updated dependencies: @ash-ai/shared@0.0.5

## 0.0.4 - 2026-02-21

### Fixed

- CLI login flow fixes
- Drizzle ORM compatibility updates (#10)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.4

## 0.0.3 - 2026-02-20

### Added

- `ash-dev` bin entry for local development; `make link` installs it globally (#6)
- Dev mode: `ash-dev start` auto-builds local Docker image instead of pulling from registry (#7)

### Changed

- Docker image tag derived from `package.json` version at runtime instead of hardcoded constant (#6)
- Updated dependencies: @ash-ai/shared@0.0.3

## 0.0.2 - 2026-02-19

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
