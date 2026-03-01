---
"@ash-ai/server": patch
---

Regenerate OpenAPI spec with all SDK parity fields and add SSE streaming + high-level client to Python SDK.

- `@ash-ai/server` — Regenerated `openapi.json` to include session creation fields (`model`, `systemPrompt`, `mcpServers`, `permissionMode`, `allowedTools`, `disallowedTools`, `betas`, `subagents`, `initialAgent`) and per-message options (`maxTurns`, `maxBudgetUsd`, `effort`, `thinking`, `outputFormat`)
- `ash-ai-sdk` (Python) — Regenerated models from updated spec, added `AshClient` with `send_message_stream()` / `asend_message_stream()` for SSE streaming, added typed event classes (`MessageEvent`, `TextDeltaEvent`, `ToolUseEvent`, `ErrorEvent`, `DoneEvent`, etc.), updated `generate.sh` to preserve hand-written modules
