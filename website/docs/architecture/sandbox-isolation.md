---
sidebar_position: 2
title: Sandbox Isolation
---

# Sandbox Isolation

Ash treats agent code as untrusted. Each agent session runs inside an isolated sandbox process with restricted access to the host system.

## Security Model

The agent inside the sandbox can execute arbitrary shell commands (that is how the Claude Code SDK works). The sandbox must prevent:

- Reading host environment variables (credentials, secrets)
- Writing outside the workspace directory
- Consuming unbounded host resources (memory, CPU, disk)
- Interfering with other sandboxes or the host process

## Isolation Layers

| Layer | Linux | macOS (dev) |
|-------|-------|-------------|
| **Process limits** | cgroups v2 | ulimit |
| **Memory limit** | cgroup `memory.max` (default 2048 MB) | ulimit (best-effort) |
| **CPU limit** | cgroup `cpu.max` (default 100% = 1 core) | Not enforced |
| **Disk limit** | Periodic check, kill on exceed (default 1024 MB) | Periodic check, kill on exceed |
| **Max processes** | cgroup `pids.max` (default 64, fork bomb protection) | ulimit |
| **Environment** | Strict allowlist | Strict allowlist |
| **Filesystem** | bubblewrap (bwrap) read-only root, writable workspace | Restricted cwd only |
| **Network** | Network namespace (configurable) | Unrestricted |

Resource limit defaults are defined in `@ash-ai/shared`:

```typescript
const DEFAULT_SANDBOX_LIMITS = {
  memoryMb: 2048,     // Max RSS in MB
  cpuPercent: 100,     // 100 = 1 core
  diskMb: 1024,        // Max workspace size in MB
  maxProcesses: 64,    // Fork bomb protection
};
```

## Environment Variable Allowlist

The sandbox process receives **only** these environment variables. Everything else is blocked.

### Passed through from host (if set)

| Variable | Purpose |
|----------|---------|
| `PATH` | Standard path |
| `NODE_PATH` | Node.js module resolution |
| `HOME` | Home directory (set to workspace dir) |
| `LANG` | Locale |
| `TERM` | Terminal type |
| `ANTHROPIC_API_KEY` | Required for Claude Code SDK |
| `ASH_DEBUG_TIMING` | Enable timing instrumentation |

### Injected by Ash

| Variable | Purpose |
|----------|---------|
| `ASH_BRIDGE_SOCKET` | Path to the Unix socket for bridge communication |
| `ASH_AGENT_DIR` | Original agent directory path |
| `ASH_WORKSPACE_DIR` | Writable workspace directory for this session |
| `ASH_SANDBOX_ID` | Unique sandbox identifier |
| `ASH_SESSION_ID` | Session identifier |

### Everything else: blocked

The sandbox does not inherit `process.env`. Variables like `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `GITHUB_TOKEN`, or any other host secret are never visible inside the sandbox.

```typescript
// From sandbox/manager.ts -- allowlist enforcement
const env: Record<string, string> = {};
for (const key of SANDBOX_ENV_ALLOWLIST) {
  if (process.env[key]) {
    env[key] = process.env[key]!;
  }
}
// Only these vars + injected ASH_* vars are passed to the child process
```

## OOM Detection

When a sandbox process is killed by the kernel's OOM killer (exit code 137 or SIGKILL), Ash detects this and automatically pauses the session. The session can be resumed later with a fresh sandbox.

## Disk Monitoring

A periodic check (every 30 seconds) measures the workspace directory size. If it exceeds `diskMb`, the sandbox is killed immediately.
