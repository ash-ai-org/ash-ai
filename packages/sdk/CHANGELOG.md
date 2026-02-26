# @ash-ai/sdk

## 0.0.9 - 2026-02-25

### Changed

- Updated dependencies: @ash-ai/shared@0.0.9

## 0.0.8 - 2026-02-25

### Added

- `writeSessionFiles()` method for batch writing files to session workspace (#19)
- `deleteSessionFile()` method for deleting files from session workspace (#19)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.8

## 0.0.7 - 2026-02-24

### Added

- `includeHidden` option on `getSessionFiles()` — defaults to true so `.claude` and other hidden dirs are visible (#18)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.7

## 0.0.6 - 2026-02-24

### Added

- `deployAgent`, `listAgents`, `getAgent` methods for agent management
- Streaming helpers with `includePartialMessages` support
- `apiKey` option on `AshClientOptions` for authenticated requests
- Re-exported agent and session types from `@ash-ai/shared`

### Changed

- Updated dependencies: @ash-ai/shared@0.0.6

## 0.0.5 - 2026-02-23

### Added

- File operation methods: `listSessionFiles`, `getSessionFile`, `uploadSessionFile`

### Changed

- Updated dependencies: @ash-ai/shared@0.0.5

## 0.0.4 - 2026-02-21

### Added

- Credential management methods: `createCredential`, `listCredentials`, `deleteCredential`
- Queue methods: `enqueueItem`, `listQueueItems`, `getQueueStats`
- Attachment methods: `uploadAttachment`, `listAttachments`, `downloadAttachment`, `deleteAttachment`
- Usage methods: `getUsageStats`, `listUsageEvents`
- Workspace bundle methods: `uploadWorkspace`, `downloadWorkspace`
- Re-exported types: `Message`, `Credential`, `Attachment`, `QueueItem`, `UsageEvent`, `UsageStats`, and more

### Changed

- Updated dependencies: @ash-ai/shared@0.0.4

## 0.0.3 - 2026-02-20

### Added

- `listSessionMessages()` method for retrieving persisted session messages (#5)
- `listSessionEvents()` method for session event timeline (#5)

### Changed

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
