---
"@ash-ai/shared": minor
"@ash-ai/bridge": minor
"@ash-ai/server": minor
---

Support file/document attachments in session messages.

- `@ash-ai/shared` — Add `TextContentBlock`, `ImageContentBlock`, `DocumentContentBlock`, and `InputContentBlock` types. `SendMessageRequest.content` now accepts `string | InputContentBlock[]`. `QueryCommand.prompt` updated to match.
- `@ash-ai/server` — Message endpoint accepts structured content blocks (text, image, document). Body limit increased to 50MB for document-heavy use cases. JSON schema validates both string and array-of-blocks formats.
- `@ash-ai/bridge` — Structured prompts converted to `SDKUserMessage` and passed via `AsyncIterable` to the Claude Code SDK's `query()`. Buffer limit increased to 50MB. Mock query handles multimodal content gracefully.
