# Plan 09: Attachments

## Status: Done
## Priority: Medium
## Effort: Medium

## Problem

ash-ai supports file attachments on messages — users can upload files alongside their prompts, and attachments are stored with metadata and linked to messages. Ash has no attachment concept; files only exist in the sandbox workspace.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/attachment/` — `AttachmentStorage` class, `attachmentToDataUrl()`, `dataUrlToBuffer()`, `isImageMimeType()`, `isDocumentMimeType()`
- `harness/packages/ash-ai/src/types/index.ts` — `Attachment` interface, `AttachmentId` type
- `harness/packages/ash-ai/src/storage/` — `SessionStorage` interface includes `saveAttachment`, `getAttachment`, `deleteAttachment`, `getMessageAttachments`
- `apps/web/src/app/api/v1/sessions/[sessionId]/files/route.ts` — file operations, creates `CreateSessionEventOptions` for timeline events

## Current ash-ai Behavior

```typescript
interface Attachment {
  id: AttachmentId
  messageId: MessageId
  filename: string
  mimeType: string
  size: number
  storagePath: string
  createdAt: Date
}

class AttachmentStorage {
  async storeFromBuffer(messageId, filename, content, mimeType): Promise<Attachment>
  async retrieveAsBuffer(attachmentId): Promise<Buffer>
  async delete(attachmentId): Promise<void>
}
```

Attachments are:
- Uploaded as part of `sendMessage` options
- Written to sandbox filesystem for the agent to access
- Stored in FileStore (S3) for persistence
- Linked to the message in the DB

## Approach

1. **New `attachments` table**:
   ```sql
   CREATE TABLE attachments (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     message_id TEXT NOT NULL,
     session_id TEXT NOT NULL,
     filename TEXT NOT NULL,
     mime_type TEXT NOT NULL,
     size INTEGER NOT NULL,
     storage_path TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   ```

2. **Attachment storage backend** — pluggable:
   - `LocalAttachmentStore` — writes to `data/attachments/`
   - `S3AttachmentStore` — writes to S3 (depends on plan 07)

3. **Update message send flow**:
   - `POST /api/sessions/:id/messages` accepts `multipart/form-data` or base64 in JSON
   - Files are stored → attachment records created → files written to sandbox
   - Agent can read uploaded files from workspace

4. **API endpoints**:
   - Attachment upload is part of message send
   - `GET /api/sessions/:id/messages/:msgId/attachments` — list attachments
   - `GET /api/attachments/:id` — download attachment content

5. **Update SDK client**:
   ```typescript
   async sendMessage(sessionId, content, opts?: {
     attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>
   }): Promise<Response>
   ```

## Implementation Steps

1. Add attachments table + Db methods
2. Implement LocalAttachmentStore
3. Update message send route to handle file uploads
4. Write uploaded files into sandbox workspace
5. Add attachment retrieval endpoints
6. Implement S3AttachmentStore (after plan 07)
7. Update SDK client

## Open Questions

- Max file size limit? (ash-ai doesn't seem to enforce one in the harness)
- Should attachments be stored inline in the message content or as separate records?
- Do we need image preview/thumbnail generation?
