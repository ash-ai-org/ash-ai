---
"@ash-ai/shared": minor
"@ash-ai/bridge": minor
"@ash-ai/server": minor
---

Add configurable permission mode and API gateway routing support for enterprise deployments.

- `@ash-ai/shared` — Add `ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`, and `ASH_PERMISSION_MODE` to sandbox env allowlist. New `SandboxPermissionMode` type and `permissionMode` field on `CreateSessionRequest`.
- `@ash-ai/bridge` — Read `ASH_PERMISSION_MODE` env var instead of hardcoding `bypassPermissions`. Supports `bypassPermissions` (default), `permissionsByAgent` (SDK enforces .claude/settings.json rules), and `default`.
- `@ash-ai/server` — New `permissionMode` field on `POST /api/sessions`. Injected into sandbox env so the bridge picks it up.
