---
"@ash-ai/server": patch
"@ash-ai/dashboard": patch
---

Fix dashboard UX issues: flickering, message rendering, favicon auth, telemetry warnings.

- `@ash-ai/dashboard` — Cache last-known health, agents, and sessions in sessionStorage so the UI doesn't flash OFFLINE/"-" between navigations
- `@ash-ai/dashboard` — Fix assistant message rendering: extract text from SDK result objects instead of showing raw JSON
- `@ash-ai/server` — Exclude `/favicon.ico` from auth middleware (was returning 401)
- `@ash-ai/server` — Suppress repeated telemetry POST warnings for the same HTTP status (e.g. 404 when Cloud endpoint isn't live yet)
