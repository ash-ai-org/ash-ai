# Enterprise Integration Gap Analysis

_2026-02-27 — Assessment of gaps between Ash's current capabilities and enterprise deployment requirements. All gaps documented generically — apply to any organization integrating Ash with existing infrastructure._

## Summary

| # | Gap | Severity | Effort | Status |
|---|-----|----------|--------|--------|
| 1 | API gateway / LLM proxy routing | High | **Closed** | `ANTHROPIC_BASE_URL` + `ANTHROPIC_CUSTOM_HEADERS` in env allowlist |
| 2 | Authentication / service identity | Medium | Low-Medium | Built-in API keys work; service mesh mTLS covers internal auth |
| 3 | Managed permissions (allow/deny lists) | Medium | **Closed** | `permissionMode` field on session creation; agent `.claude/settings.json` for rules |
| 4 | OpenTelemetry / distributed tracing | High | High | Coordinator-level OTEL is standard; bridge-level needs work |
| 5 | Memory system | Medium | **Closed** | Package as MCP server in agent definition (zero Ash changes) |
| 6 | Sandbox security (network filtering) | Medium | Medium-High | Filesystem covered by bwrap; network filtering needs K8s NetworkPolicy |
| 7 | Privileged container requirement | High | Medium-High | Unprivileged user namespaces or K8s-native isolation |
| 8 | Multi-region / HA | Low | Varies | CockroachDB handles single-region; multi-region is separate |

---

## Gap 1: API Gateway / LLM Proxy Routing — CLOSED

**What enterprises have**: A central API gateway or LLM proxy that all model API traffic routes through. The gateway handles cost tracking, rate limiting, model routing, and audit logging. The custom wrapper injects `ANTHROPIC_BASE_URL` (pointing to the internal gateway) and `ANTHROPIC_CUSTOM_HEADERS` (with gateway auth headers) into subprocess environment.

**What Ash has now**: `ANTHROPIC_BASE_URL` and `ANTHROPIC_CUSTOM_HEADERS` are in the sandbox environment allowlist. They pass through from the host environment or can be set per-session via `extraEnv`.

**How to use**:
```bash
# Option 1: Set on runner pods / Ash server (all sessions use the gateway)
ANTHROPIC_BASE_URL=https://your-gateway.internal/v1
ANTHROPIC_CUSTOM_HEADERS="x-api-key: ...,x-team-id: my-team"

# Option 2: Per-session via API (different gateways per tenant)
POST /api/sessions
{
  "agent": "my-agent",
  "extraEnv": {
    "ANTHROPIC_BASE_URL": "https://your-gateway.internal/v1",
    "ANTHROPIC_CUSTOM_HEADERS": "x-api-key: ...,x-provider: anthropic"
  }
}
```

Gateway credentials can also be stored via Ash's credential system (encrypted at rest, injected per-session).

---

## Gap 2: Authentication / Service Identity

**What enterprises have**: Service mesh (mTLS, SPIFFE) for service-to-service auth. Internal services authenticate via client certificates or mesh-injected headers.

**What Ash has**: Bearer API keys stored as HMAC-SHA256 hashes in the database. Multi-tenant support. No mTLS, no OIDC. Coordinator-to-runner uses optional shared secret (`ASH_INTERNAL_SECRET`).

**Approach**:

| Component | Solution |
|-----------|----------|
| **Client → Coordinator** | Use Ash's built-in API keys and map to internal service identities. Or: put an auth proxy (OAuth2 Proxy, API gateway) in front of Ash. |
| **Coordinator → Runner** | In K8s with a service mesh, mTLS between pods is automatic. The optional `ASH_INTERNAL_SECRET` provides defense-in-depth. |
| **Sandbox → API gateway** | Credentials injected via `extraEnv` or Ash credential system. |

**Work remaining**: If service mesh mTLS isn't sufficient for client auth, a Fastify auth plugin (~50-100 lines) that validates service identity from headers or client certs.

---

## Gap 3: Managed Permissions (Allow/Deny Lists) — CLOSED

**What enterprises have**: ~150+ allow rules and ~18 deny rules covering file read/write by extension, bash commands, web fetches by domain, and MCP server access. Enforced by the Claude Code CLI's permission system.

**What Ash has now**: Two complementary approaches:

### Approach A: Sandbox-as-security-boundary (default)

`permissionMode: 'bypassPermissions'` (default). Cgroups + bwrap + filesystem isolation is the security layer. The agent can do anything inside its sandbox, but the sandbox limits blast radius. Architecturally cleaner — defense in depth at the OS level.

### Approach B: SDK permission filtering

Set `permissionMode: 'permissionsByAgent'` on session creation. The SDK enforces its built-in permission system, reading allow/deny rules from the agent's `.claude/settings.json`:

```json
POST /api/sessions
{
  "agent": "my-agent",
  "permissionMode": "permissionsByAgent"
}
```

The agent's `.claude/settings.json` contains the permission rules:

```json
{
  "permissions": {
    "allow": [
      "Read(*.py)",
      "Read(*.md)",
      "Bash(python *)",
      "Bash(pip install *)"
    ],
    "deny": [
      "Bash(docker *)",
      "Bash(rm -rf /*)",
      "Read(/etc/shadow)"
    ]
  }
}
```

Both approaches can be combined: bwrap provides OS-level isolation, SDK permissions provide application-level restrictions.

---

## Gap 4: OpenTelemetry / Distributed Tracing

**What enterprises have**: Full OTEL pipeline with structured span hierarchy: conversation → phase → tool/thinking/turn, with token count attributes.

**What Ash has**: Prometheus `/metrics`, structured JSON logs, health endpoint, optional HTTP telemetry exporter. No OTEL spans, no trace propagation.

**Approach** (three phases):

1. **Coordinator-level** (low effort): Standard `@opentelemetry/sdk-node` auto-instrumentation on Fastify. Covers HTTP spans, DB queries. Add manual spans for session lifecycle. ~100 lines.

2. **Bridge-level** (medium effort): Add `traceContext` field to bridge protocol. Bridge creates child spans for tool calls, thinking blocks, and turns as SDK messages stream. ~200 lines.

3. **End-to-end** (low effort, after bridge): Trace context propagates through to model API calls automatically via HTTP instrumentation.

See [otel-tracing.md](../future_tasks/otel-tracing.md) for the full design.

---

## Gap 5: Memory System — CLOSED

**What enterprises have**: An MCP server with memory tools (view, create, update, delete, search) backed by filesystem storage.

**What Ash has**: Native MCP server support via `.mcp.json` in agent definitions. The Claude Code CLI spawns declared MCP servers automatically.

**Approach**: Package the memory server as a stdio MCP server in the agent definition. Memory files live in the workspace, persisted automatically by Ash's snapshot system. Zero Ash code changes.

See [memory-as-mcp.md](../future_tasks/memory-as-mcp.md) for details.

---

## Gap 6: Sandbox Security (Network Filtering)

**What enterprises have**: Domain allowlists for outbound network traffic, filesystem deny lists for secrets paths, command restrictions.

**What Ash has**:
- **Filesystem**: bwrap provides stronger isolation than deny lists — the agent can only write to its sandbox directory. No `/etc`, `~/.ssh`, `~/.aws` access because those paths aren't bind-mounted writable. **This gap is closed by a stronger mechanism.**
- **Commands**: When using `permissionMode: 'permissionsByAgent'` (Gap 3), the SDK enforces command restrictions via the agent's `.claude/settings.json`.
- **Network**: bwrap doesn't filter network traffic by domain. The sandbox has full outbound network access.

**Network filtering approach** (from hardest to easiest):

| Approach | How | Effort |
|----------|-----|--------|
| K8s NetworkPolicy | Restrict pod egress to specific CIDRs/ports. Works at IP level, not domain. | Low (config) |
| Proxy sidecar | Run an HTTP proxy (Squid, Envoy) that filters outbound requests by domain. Set `HTTP_PROXY` in sandbox env. | Medium |
| Network namespace + iptables | Per-sandbox network namespace with nftables rules. Full domain control but complex. | High |

**Recommendation**: K8s NetworkPolicy for IP-level filtering (covers most cases). Add proxy sidecar only if domain-level filtering is required.

---

## Gap 7: Privileged Container Requirement

**What enterprises have**: Cluster policies that prohibit `--privileged` containers.

**What Ash requires**: `--privileged` Docker mode for bwrap namespace creation and cgroup v2 delegation.

**Approach** (in order of preference):

1. **Unprivileged user namespaces**: bwrap uses user namespaces on kernels with `kernel.unprivileged_userns_clone=1`. No `--privileged` needed. Depends on node configuration.

2. **Specific capabilities**: `CAP_SYS_ADMIN` + `CAP_NET_ADMIN` instead of full `--privileged`. More targeted but still elevated.

3. **K8s-native isolation**: Run each session as a separate K8s Job/Pod. Uses native K8s resource limits and network policies. Larger architectural change but eliminates the privileged requirement entirely.

4. **ulimit fallback**: Drop bwrap, use only ulimit-based limits. No filesystem isolation — only acceptable when the container itself is the trust boundary (single-tenant, ephemeral).

See [unprivileged-sandboxes.md](../future_tasks/unprivileged-sandboxes.md) for the full design.

---

## Gap 8: Multi-Region / HA

**What enterprises have**: Services running across multiple regions.

**What Ash has**: Multiple coordinators sharing one Postgres/CockroachDB database. Single-region HA is supported.

**Approach**:

| Scenario | Solution |
|----------|----------|
| Single-region HA | CockroachDB with replicas (already supported) |
| Multi-region | Separate Ash deployments per region with a routing layer. Or CockroachDB multi-region (adds cross-region latency to session lookups) |

Multi-region is an infrastructure topology problem, not an Ash code problem. Most enterprises start with single-region and add regions as needed.

---

## Effort Summary

**Already closed** (this PR):
- Gap 1: API gateway routing (env allowlist)
- Gap 3: Managed permissions (permissionMode passthrough)
- Gap 5: Memory system (MCP server pattern)

**Low effort remaining**:
- Gap 2: Auth plugin for custom identity (50-100 lines, only if service mesh isn't sufficient)

**Medium-high effort**:
- Gap 4: OTEL tracing (coordinator: ~100 lines, bridge: ~200 lines)
- Gap 6: Network filtering (K8s NetworkPolicy is config; proxy sidecar is medium)
- Gap 7: Unprivileged bwrap (code changes + testing across K8s environments)

**Infrastructure decisions**:
- Gap 8: Multi-region (deployment topology, not code)
