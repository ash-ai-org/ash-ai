# @ash-ai/runner

## 0.0.20 - 2026-03-10

### Changed

- Updated dependencies: @ash-ai/shared@0.0.21, @ash-ai/sandbox@0.0.26

## 0.0.19 - 2026-03-06

### Changed

- Updated dependencies: @ash-ai/sandbox@0.0.25, @ash-ai/server@0.0.28

## 0.0.18 - 2026-03-06

### Changed

- Remove `startupScript` from sandbox creation route (#60)
- Updated dependencies: @ash-ai/shared@0.0.19, @ash-ai/sandbox@0.0.23 (#60)

## 0.0.17 - 2026-03-06

### Changed

- Updated fastify to >=5.8.1 (Content-Type validation bypass CVE fix)
- Updated dependencies: @ash-ai/shared@0.0.18, @ash-ai/sandbox@0.0.22

## 0.0.16 - 2026-03-06

### Changed

- Updated dependencies: @ash-ai/shared@0.0.17, @ash-ai/sandbox@0.0.21

## 0.0.15 - 2026-02-28

### Changed

- Updated dependencies: @ash-ai/shared@0.0.16, @ash-ai/sandbox@0.0.15

## 0.0.14 - 2026-02-28

### Changed

- Updated dependencies: @ash-ai/shared@0.0.15, @ash-ai/sandbox@0.0.14

## 0.0.13 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.14, @ash-ai/sandbox@0.0.13

## 0.0.12 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.13, @ash-ai/sandbox@0.0.12

## 0.0.11 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.12, @ash-ai/sandbox@0.0.11

## 0.0.10 - 2026-02-26

### Added

- Forward `mcpServers` and `systemPrompt` from session creation to sandbox (#27)

### Changed

- Updated dependencies: @ash-ai/shared@0.0.11, @ash-ai/sandbox@0.0.10

## 0.0.9 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.10, @ash-ai/sandbox@0.0.9

## 0.0.8 - 2026-02-25

### Changed

- Updated dependencies: @ash-ai/shared@0.0.9, @ash-ai/sandbox@0.0.8

## 0.0.7 - 2026-02-24

### Changed

- Updated dependencies: @ash-ai/shared@0.0.7, @ash-ai/sandbox@0.0.7

## 0.0.6 - 2026-02-24

### Changed

- Updated dependencies: @ash-ai/shared@0.0.6, @ash-ai/sandbox@0.0.6

## 0.0.5 - 2026-02-23

### Changed

- Updated dependencies: @ash-ai/shared@0.0.5, @ash-ai/sandbox@0.0.5

## 0.0.4 - 2026-02-21

### Added

- Multi-coordinator support for distributed coordination

### Fixed

- Production correctness hardening for multi-runner scenarios

### Changed

- Updated dependencies: @ash-ai/shared@0.0.4, @ash-ai/sandbox@0.0.4

## 0.0.3 - 2026-02-20

### Changed

- Updated dependencies: @ash-ai/shared@0.0.3, @ash-ai/sandbox@0.0.3

## 0.0.2 - 2026-02-19

### Changed

- Updated dependencies: @ash-ai/shared@0.0.2, @ash-ai/sandbox@0.0.2

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
  - @ash-ai/sandbox@0.0.1
