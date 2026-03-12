---
"@ash-ai/server": patch
"@ash-ai/dashboard": patch
---

Show ASH_API_KEY environment variable in dashboard API Keys page.

- `@ash-ai/server` — Include the `ASH_API_KEY` env var as a synthetic entry in `GET /api/api-keys` so the dashboard shows it exists
- `@ash-ai/dashboard` — Display env var keys with an `env` badge, hide the delete button for them
