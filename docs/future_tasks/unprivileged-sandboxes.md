# Unprivileged Sandbox Mode

## Status: Proposed

## Problem

Ash's sandbox isolation on Linux requires bubblewrap (bwrap) for filesystem namespacing and cgroups v2 for resource limits. The Docker image runs in `--privileged` mode to enable cgroup v2 delegation and namespace creation. Many enterprise Kubernetes clusters have policies that prohibit privileged containers.

## Current Architecture

```
Docker --privileged
  └── docker-entrypoint.sh
       ├── Sets up /sys/fs/cgroup/ash (cgroup v2 delegation)
       └── exec ash-server
            └── SandboxManager.create()
                 ├── spawnWithLimits() → bwrap + cgroups
                 └── Requires: CAP_SYS_ADMIN (for bwrap namespace creation)
                              writable /sys/fs/cgroup/ash (for cgroup limits)
```

## Options

### Option A: Specific Linux Capabilities Instead of Full Privileged

Instead of `--privileged`, request only the capabilities bwrap and cgroups need:

```yaml
securityContext:
  capabilities:
    add:
      - SYS_ADMIN    # Namespace creation (bwrap)
      - NET_ADMIN     # Network namespace (if needed)
  seccompProfile:
    type: RuntimeDefault
```

**Pros**: More targeted than `--privileged`. May pass some cluster policies.
**Cons**: `SYS_ADMIN` is still a broad capability. Some policies block it too.

### Option B: Unprivileged User Namespaces

Bubblewrap can use unprivileged user namespaces on kernels that allow it:

```bash
# Check if available
sysctl kernel.unprivileged_userns_clone  # Must be 1
```

If available, bwrap runs without `CAP_SYS_ADMIN`. The existing bwrap args work as-is — bwrap automatically uses user namespaces when it can't create privileged namespaces.

**Pros**: No elevated privileges at all. Container can run as non-root.
**Cons**: Depends on node kernel configuration (`kernel.unprivileged_userns_clone=1`). Many hardened kernels disable this. GKE and EKS have different defaults.

**Implementation**:
1. Modify `hasBwrap()` in `resource-limits.ts` to test both privileged and unprivileged modes
2. Add `ASH_BWRAP_MODE` env var: `auto` (default, try both), `privileged`, `unprivileged`
3. In `spawnWithCgroups()`, add `--unshare-user` flag when running unprivileged
4. Docker image gets a non-privileged variant

### Option C: K8s-Native Isolation (Replace bwrap with Pods)

Run each agent session as a separate Kubernetes Job or Pod instead of a bwrap namespace:

```
Coordinator Pod → creates Job per session → Job runs bridge + Claude Code SDK
```

**Pros**: Uses native K8s primitives. No elevated privileges. NetworkPolicy works at pod level. Resource limits via K8s resource requests/limits.
**Cons**: Significant architectural change. Pod startup latency (~seconds vs ~100ms for bwrap). Requires K8s API access from the coordinator. Would need the pluggable sandbox provider interface (see `pluggable-sandbox-providers.md`).

### Option D: Fallback to ulimit-Only (No Filesystem Isolation)

Run without bwrap, using only ulimit-based resource limits (current macOS behavior):

```yaml
securityContext:
  privileged: false
```

**Pros**: Works everywhere, zero elevated privileges.
**Cons**: No filesystem isolation. Agent can read the entire container filesystem. Only acceptable when the container itself is the isolation boundary (single-tenant, ephemeral containers).

## Recommendation

**Short term**: Option B (unprivileged user namespaces) where kernel allows it, with Option A as fallback. This requires minimal code changes and covers most modern K8s clusters.

**Medium term**: Option C (K8s-native pods) via the pluggable sandbox provider interface. This is the enterprise-grade solution but requires more work.

**Always available**: Option D for environments where the container is the trust boundary.

## Implementation Plan

### Phase 1: Unprivileged bwrap support

1. Modify `hasBwrap()` to detect unprivileged namespace support
2. Add `--unshare-user` to bwrap args when running unprivileged
3. Gracefully degrade cgroup limits when `/sys/fs/cgroup/ash` isn't writable (fall back to ulimit)
4. Document capability requirements in Helm chart and K8s deployment guide

### Phase 2: Graceful degradation

1. Add `ASH_ISOLATION_MODE` env var: `strict` (require bwrap+cgroups, fail otherwise), `best-effort` (use whatever is available), `none` (ulimit only)
2. Health endpoint reports isolation level
3. Log warnings when running without full isolation

### Phase 3: K8s-native sandbox provider

See `pluggable-sandbox-providers.md` for the full design. This replaces bwrap entirely with K8s Jobs/Pods when running in a cluster.

## What Changes

| Component | Change |
|-----------|--------|
| `resource-limits.ts` | Add unprivileged bwrap detection and `--unshare-user` flag |
| `resource-limits.ts` | Graceful cgroup fallback to ulimit when cgroups unavailable |
| `manager.ts` | Read `ASH_ISOLATION_MODE` env var |
| `docker-entrypoint.sh` | Skip cgroup setup when not privileged |
| Helm chart | Document `securityContext` options with capability list |
| K8s deployment guide | Add section on isolation modes |
