# Plan 01: Structured Message Content

## Status: Done
## Priority: Critical
## Effort: Medium

## Problem

Ash stores messages as raw SDK JSON blobs (`content: string` — a JSON-stringified SDK message). The cloud UI and `@ash-cloud/shared` expect structured `MessageContent[]` arrays with discriminated types:

```typescript
type MessageContent = TextContent | ToolUseContent | ToolResultContent | ImageContent | FileContent | RawContent

interface TextContent { type: 'text'; text: string }
interface ToolUseContent { type: 'tool_use'; id: string; name: string; input: unknown }
interface ToolResultContent { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
interface ImageContent { type: 'image'; source: { type: string; media_type: string; data: string } }
interface FileContent { type: 'file'; filename: string; mimeType: string; size: number; storagePath: string }
interface RawContent { type: 'raw'; raw: Record<string, unknown> }
```

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

Type definitions consumed by the cloud:
- `harness/packages/ash-ai/src/types/index.ts` — `TextContent`, `ToolUseContent`, `ToolResultContent`, `ImageContent`, `FileContent`, `MessageContent` union type
- `packages/shared/src/index.ts` — re-exports all content types for client consumption

Cloud files that depend on structured messages:
- `apps/web/src/lib/services/agent-execution.ts` — builds and processes messages with typed content
- `apps/web/src/lib/openapi/schemas.ts` — OpenAPI schemas for message content types

## Current State

- `@ash-ai/shared` already has `classifyBridgeMessage()` and `extractDisplayItems()` which partially parse SDK messages
- Messages table stores: `id, sessionId, role, content (JSON string), sequence, createdAt`
- The bridge emits raw SDK `Message` objects as `{ ev: 'message', data: <sdk-message> }`

## Design Principle: Assist, Don't Obstruct

The parser must never swallow or drop data. If Claude's SDK starts returning a new content block type we don't recognize, we wrap it as `RawContent` and pass it through. Clients always get the full picture — we add structure where we can, and stay out of the way where we can't.

## Approach

### Option A: Parse on read (adapter layer) — Recommended

Keep Ash's storage as-is (raw JSON). Add a parsing/normalization layer:

1. **Add `parseMessageContent(rawContent: string): MessageContent[]`** to `@ash-ai/shared`
   - Takes the raw SDK JSON blob
   - Returns structured `MessageContent[]` array
   - Handles all known SDK message shapes (text blocks, tool_use blocks, tool_result blocks, images)
   - **Any unrecognized block becomes `RawContent`** — the original JSON preserved as-is under `raw`
   - Never throws on unknown shapes, never drops data

2. **`RawContent` — the catch-all type**
   ```typescript
   interface RawContent {
     type: 'raw'
     raw: Record<string, unknown>  // The original block, untouched
   }
   ```
   This ensures forward compatibility. When the SDK adds new block types (citations, audio, structured outputs, etc.), they flow through immediately. Clients that know about the new type can inspect `raw` and handle it. Clients that don't can skip or display a generic fallback.

3. **Add optional `parsed` field to `Message` type**
   ```typescript
   interface Message {
     // ... existing fields
     parsed?: MessageContent[]  // Lazily populated on read
   }
   ```

4. **Add `listMessagesParsed()` to Db interface** (or a wrapper) that returns messages with `parsed` populated

5. **Export the structured content types from `@ash-ai/shared`**

### Option B: Store structured at write time

Parse SDK messages into structured content at persistence time. This means changing the bridge's message handling to normalize before insert.

**Tradeoff:** More work, breaks the "raw passthrough" design, but queries/reads are simpler.

### Recommendation

**Option A.** It preserves Ash's passthrough design and is purely additive. The cloud adapter can call `parseMessageContent()` when it needs structured data. The raw JSON stays available for clients that want it.

## Implementation Steps

1. Define `MessageContent` types in `@ash-ai/shared` (TextContent, ToolUseContent, RawContent, etc.)
2. Implement `parseMessageContent()` — known types get parsed, everything else becomes `RawContent`
3. Add unit tests with real SDK message samples, including unknown/future block types
4. Export from `@ash-ai/shared` index
5. Optionally add a `listMessagesParsed()` convenience method to server

## Open Questions

- Should `parseMessageContent` live in shared (for both SDK and server) or just server?
- Do we need to handle `thinking` blocks (extended thinking / reasoning)?
- Should the parsed content be cached or always computed on read?
