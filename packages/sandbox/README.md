# @ash-ai/sandbox

Sandbox management library for [Ash](https://github.com/ash-ai-org/ash-ai) — process spawning, pool management, bridge client, resource limits, and state persistence.

Used by both `@ash-ai/server` and `@ash-ai/runner` to manage isolated agent sandboxes.

## Installation

```bash
npm install @ash-ai/sandbox
```

## What's included

- **SandboxManager** — spawns and manages isolated child processes
- **SandboxPool** — DB-backed pool with capacity limits, LRU eviction, and idle sweep
- **BridgeClient** — communicates with bridge processes over Unix sockets
- **Resource limits** — cgroups (Linux) and ulimit enforcement
- **State persistence** — save/restore sandbox state for session resume

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation.

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
