# @ash-ai/cli

## 0.0.10 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.11

## 0.0.9 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.10

## 0.0.8 - 2026-02-25

### Added

- Auto-capture API key from bootstrap file after `ash start` — saved to `~/.ash/config.json` (#23)
- `--api-key` option on `ash connect` for remote server authentication (#23)
- `getApiKey()` config function with precedence: `ASH_API_KEY` env > `config.json` (#23)
- `api_key` field in `~/.ash/config.json` (#23)

### Changed

- All CLI HTTP requests now send `Authorization: Bearer` header when a key is available (#23)
- Updated dependencies: @ash-ai/shared@0.0.9

## 0.0.7 - 2026-02-24

### Added

- `ash-dev rebuild` command: rebuild Docker image and restart server in one step (#18)
- Stale image detection on `ash-dev start` and `ash-dev status` — warns when local source is newer than running image
- Separate `dev.ts` entry point for reliable dev mode detection
- `findRepoRoot()` helper so Docker build works from any directory

### Changed

- `ash-dev` bin now points to `dist/dev.js` instead of `dist/index.js`
- Updated dependencies: @ash-ai/shared@0.0.7

## 0.0.6 - 2026-02-24

### Added

- `ash connect <url>` command for persistent remote server configuration
- `ash disconnect` command to clear saved server config
- Config persistence at `~/.ash/config.json` with `ASH_SERVER_URL` env override

### Changed

- Updated dependencies: @ash-ai/shared@0.0.6

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
