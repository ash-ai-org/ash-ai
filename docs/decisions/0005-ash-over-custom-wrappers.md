# 0005: Ash Over Custom SDK Wrappers for Production Hosting

**Date**: 2026-02-27
**Status**: Accepted

## Context

Teams adopting the Claude Code SDK for production services often build a custom wrapper — a thin layer that handles subprocess management, session routing, and permission configuration. These wrappers work for prototyping but hit fundamental problems at scale:

1. **Stateless process management in stateful infrastructure.** Wrappers run SDK subprocesses in-process. When a pod restarts or scales, sessions are lost. Adding external session storage, connection pooling, and process management turns the wrapper into a platform — essentially rebuilding what Ash already provides.

2. **No sandbox isolation.** Wrappers run agent code in the same process or an uncontained subprocess. The agent has full access to the host environment, network, and filesystem. This is fine for local dev but unacceptable for production.

3. **Per-team API surfaces.** Each team builds its own wrapper with its own REST API, authentication, error handling, and streaming format. This fragments tooling, observability, and operational knowledge.

4. **Kubernetes deployment issues.** Long-running SDK subprocesses don't survive pod eviction, rolling deploys, or autoscaler scale-down events. Teams either lose sessions on deploy or build increasingly complex process management — which is Ash's job.

## Decision

Teams should use Ash for production agent hosting instead of maintaining custom SDK wrappers. Ash provides the hosting, orchestration, and isolation layer that wrappers try to build ad-hoc.

## What Teams Keep From Existing Wrappers

Not everything in a wrapper is hosting logic. These components remain useful:

- **Local development helpers** — Option factories, default configurations, and convenience functions for scripts and CLI tooling that don't need hosted infrastructure.
- **Memory and context modules** — Can be contributed as Ash plugins or run as MCP servers within agent definitions. The sidecar MCP pattern (see [ash-sidecar-mcp-integration.md](../diagrams/ash-sidecar-mcp-integration.md)) lets these modules run in-process in the host app while Ash handles the agent lifecycle.
- **Client-side OTEL tracing** — Useful for tracing calls from your application to the Ash API.

## What Teams Retire

- **Production subprocess management** — Ash sandboxes handle process lifecycle, isolation, and resource limits.
- **Hardcoded permission allow/deny lists** — Move into per-agent configuration files (`.claude/settings.json` in agent definitions).
- **Custom session storage** — Ash persists sessions to SQLite or Postgres with pause/resume support.
- **Ad-hoc scaling logic** — Ash multi-runner mode handles session routing across multiple nodes.

## Alternatives Considered

### Fix the wrapper's Kubernetes issues

Add external session storage, connection pooling, and process management to the wrapper. This turns the wrapper into a platform — essentially rebuilding Ash in a different language, without the sandboxing, multi-runner architecture, or standard API surface. Higher maintenance cost for a worse result.

### Run the SDK directly without a wrapper

Works for single-turn local scripts. Doesn't work for multi-turn sessions, concurrent users, or production deployments that need isolation and observability.

## Consequences

**Good**:
- Teams get production-grade hosting without building it themselves
- Standard API surface means shared tooling, SDKs, and observability
- Sandbox isolation from day one (not "we'll add it later")
- Session resume survives deploys, restarts, and scale events

**Bad**:
- Migration effort for teams with existing wrappers (though the overlap is small — most wrapper code is hosting logic that Ash replaces)
- Ash is another service to operate (mitigated by Docker/Helm/ECS deployment options)

**Neutral**:
- Teams still own their business logic and tools — Ash handles orchestration, not application logic. The sidecar MCP pattern keeps tools in the host app's process.
