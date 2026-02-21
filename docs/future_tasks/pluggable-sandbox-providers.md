# Pluggable Sandbox Providers

## Status: Proposed

## Inspiration

ComputeSDK (https://www.computesdk.com/) abstracts sandbox creation across 8+ cloud providers (E2B, Modal, Railway, Vercel, Daytona, etc.) behind a single API. Users swap providers by changing an environment variable -- no code changes. Ash currently hardcodes sandbox creation to local processes with bubblewrap (Linux) or ulimit (macOS).

## Problem

Today, Ash's `SandboxManager` directly spawns child processes on the host machine. This means:

1. **Scaling requires running your own infrastructure.** Every sandbox runs on the Ash host. To scale, you add runner nodes and manage them yourself.
2. **No cloud sandbox option.** Users who want managed, ephemeral cloud sandboxes (E2B, Modal) cannot use them with Ash.
3. **Dev/prod parity gap.** macOS development uses weak isolation (ulimit only). Cloud providers offer real isolation out of the box.

## Proposed Solution: SandboxProvider Interface

Add a `SandboxProvider` interface to `@ash-ai/sandbox` that abstracts sandbox lifecycle:

```typescript
interface SandboxProvider {
  create(opts: CreateSandboxOpts): Promise<SandboxHandle>;
  destroy(id: string): Promise<void>;
  exec(id: string, command: string): Promise<ExecResult>;
  writeFile(id: string, path: string, content: Buffer): Promise<void>;
  readFile(id: string, path: string): Promise<Buffer>;
}

interface SandboxHandle {
  id: string;
  /** How to reach the bridge inside this sandbox */
  bridgeTransport: BridgeTransport;
}

type BridgeTransport =
  | { type: 'unix-socket'; path: string }
  | { type: 'tcp'; host: string; port: number }
  | { type: 'websocket'; url: string };
```

### Provider Implementations

| Provider | Transport | Isolation | Notes |
|----------|-----------|-----------|-------|
| `LocalProvider` (default) | Unix socket | bubblewrap/ulimit | Current behavior, zero config |
| `E2BProvider` | WebSocket or TCP | E2B sandbox | Requires `E2B_API_KEY` |
| `ModalProvider` | TCP | Modal container | Requires Modal credentials |
| `DockerProvider` | Unix socket (mounted) | Docker container | For users who want container isolation without bubblewrap |

### Configuration

```bash
# Current default (no change)
ASH_SANDBOX_PROVIDER=local

# Use E2B for cloud sandboxes
ASH_SANDBOX_PROVIDER=e2b
E2B_API_KEY=e2b_...

# Use Docker containers instead of bubblewrap
ASH_SANDBOX_PROVIDER=docker
```

## Key Design Decisions

### Bridge must run inside the sandbox

Regardless of provider, the bridge process must run inside the sandbox (not on the Ash server). The bridge calls the Claude Code SDK, which executes arbitrary tool use -- that code must be isolated. The provider is responsible for:
1. Starting the bridge process inside its sandbox
2. Providing a transport for the Ash server to communicate with the bridge

### Local provider stays the default

The local provider (current bubblewrap/ulimit approach) remains the default. It requires no external dependencies, no API keys, and no network calls. Cloud providers are opt-in for users who want managed infrastructure.

### SandboxPool still manages lifecycle

The `SandboxPool` (capacity limits, LRU eviction, idle sweep) operates on `SandboxHandle` objects regardless of the underlying provider. The pool doesn't care whether the sandbox is a local process or a cloud container -- it just calls `create()` and `destroy()`.

## What Changes

| Component | Change |
|-----------|--------|
| `@ash-ai/sandbox` | Add `SandboxProvider` interface, refactor `SandboxManager` to use it |
| `@ash-ai/sandbox` | Extract current logic into `LocalProvider` |
| `@ash-ai/sandbox` | Add `BridgeTransport` abstraction (currently hardcoded to Unix socket) |
| `@ash-ai/server` | Read `ASH_SANDBOX_PROVIDER` env var, instantiate correct provider |
| New packages | `@ash-ai/provider-e2b`, `@ash-ai/provider-docker`, etc. (optional) |

## What Does NOT Change

- REST API -- clients don't know or care where sandboxes run
- Bridge protocol -- still newline-delimited JSON, just over a different transport
- Session lifecycle -- create, message, pause, resume, end all work the same
- Agent definition -- still a folder with `CLAUDE.md`

## Open Questions

1. **Workspace persistence across providers.** Local provider persists workspace to disk. Cloud providers would need to snapshot/restore via S3 or the provider's own persistence. How does this interact with session resume?
2. **Bridge deployment.** For cloud providers, the bridge code needs to be available inside the sandbox. Do we bake it into a container image? Upload it on create? Require the provider to have it pre-installed?
3. **Latency.** Local sandboxes communicate over Unix socket (~1ms). Cloud sandboxes add network latency. Is this acceptable for the SSE streaming use case?
4. **Cost model.** Cloud sandboxes have per-minute pricing. Should Ash's idle sweep be more aggressive for cloud providers?

## When to Build This

Not now. This makes sense when:
- Users request cloud sandbox support (demand-driven, not speculative)
- The local provider's scaling limits are hit in practice
- A specific cloud provider partnership materializes

Per principle #1: make it work (local sandboxes work), make it right (isolation is solid), then extend when measured need exists.
