# @ash-ai/shared

## 0.0.7 - 2026-02-24

### Changed

- Updated dependencies

## 0.0.6 - 2026-02-24

### Added

- `Agent` type with full CRUD fields: slug, description, model, backend, systemPrompt, status, config
- `AgentUpdate` type for partial agent updates
- `SandboxState` enum: cold, warming, warm, waiting, running
- `SandboxRecord` and `SandboxInfo` types for persistent sandbox tracking
- `RunnerRecord` type for multi-machine runner registration

### Changed

- Updated dependencies

## 0.0.5 - 2026-02-23

### Added

- Multi-tenant auth types and server extraction types

### Changed

- Updated dependencies

## 0.0.4 - 2026-02-21

### Added

- Credential types for agent secret management
- Queue types: `QueueItem`, `QueueItemStatus`, `QueueStats`
- Attachment types for file upload/download
- Usage tracking types: `UsageEvent`, `UsageEventType`, `UsageStats`
- Workspace bundle types for agent workspace snapshots
- Structured message types for rich content
- Multi-coordinator types for distributed coordination

### Fixed

- Queue processor and usage extractor type fixes

## 0.0.3 - 2026-02-20

### Added

- `SessionEvent` type for session event timeline (#5)
- `MessageRecord` type for message persistence (#5)

### Changed

- Removed hardcoded `ASH_DOCKER_TAG` constant; CLI now derives tag from package version at runtime (#6)
- Fixed Docker image reference to correct org (`ghcr.io/ash-ai-org/ash`) (#6)
- Updated dependencies: @ash-ai/shared@0.0.3

## 0.0.2 - 2026-02-19

### Added

- Multi-tenant types: `tenantId` field on `Agent`, `Session`, and `SandboxRecord`
- New `ApiKey` type for multi-tenant API key management

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
