---
"@ash-ai/server": patch
---

Return 422 instead of 500 when agent directory is missing from disk during session creation.

- `@ash-ai/server` — Validate agent directory exists before attempting sandbox creation in POST /api/sessions, POST /api/sessions/:id/resume, and POST /api/sessions/:id/fork. Returns a clear 422 error with re-deploy instructions instead of an opaque 500 ENOENT.
