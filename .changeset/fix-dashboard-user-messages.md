---
"@ash-ai/dashboard": patch
---

Fix empty user messages and add expandable raw JSON view in session detail.

- Fix user messages appearing empty — user message content stored as `{type: "user", content: "..."}` was not being extracted
- Add "Raw JSON" toggle to every message for debugging — shows the full JSON payload, system prompt, and metadata
