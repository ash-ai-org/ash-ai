# Gap 13: `sandbox` (SDK Sandbox Settings)

## Status: Not Applicable

## Problem

The Claude Agent SDK supports `sandbox` — settings for the SDK's built-in command sandboxing. This controls network restrictions, filesystem restrictions, and command execution within the SDK's own sandbox layer.

## SDK Reference

```typescript
// Claude Agent SDK Options
sandbox?: SandboxSettings;

type SandboxSettings = {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  // ...
};
```

## Why This Is N/A

Ash has its **own sandbox system** — bubblewrap (bwrap) on Linux, restricted processes on macOS. Ash's sandbox operates at the OS level (filesystem isolation, network namespaces, cgroups), which is strictly stronger than the SDK's application-level sandbox.

The SDK's sandbox is designed for running Claude Code on a developer's local machine. Ash's sandbox is designed for running untrusted agent code in production. They serve different purposes and Ash's is the appropriate choice for this deployment model.

Exposing the SDK's sandbox settings could create confusion (two sandbox layers) or weaken security (if users disable the SDK sandbox thinking Ash's is sufficient, but then run without Ash's sandbox too).

## Recommendation

Do not expose SDK sandbox settings. Ash's sandbox is the security boundary. Document this explicitly so users understand why the option is intentionally omitted.

If users need fine-grained network or filesystem restrictions within the sandbox, enhance Ash's own sandbox configuration instead (e.g., per-session network allowlists in the bwrap layer).

## Effort

N/A — Intentionally not implemented.
