---
"@ash-ai/server": patch
---

Auto-configure event telemetry for Ash Cloud when `ASH_CLOUD_URL` is set.

- When a user is logged into Ash Cloud (`ash login` + `ash start`), the server now auto-derives `ASH_TELEMETRY_URL` from `ASH_CLOUD_URL` so telemetry flows to the Cloud dashboard without manual configuration
- Explicit `ASH_TELEMETRY_URL` takes precedence over the auto-configuration
