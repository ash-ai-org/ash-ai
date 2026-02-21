# Plan 07: FileStore Interface (individual file ops)

## Status: Partially Done
## Priority: Medium (downgraded — snapshot storage already works)
## Effort: Small

## What Ash Already Has

Ash has **production-ready cloud snapshot storage**. This was initially mischaracterized as stubs:

- **`S3SnapshotStore`** (`packages/sandbox/src/snapshot-s3.ts`) — full AWS SDK: `PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `DeleteObjectCommand`
- **`GcsSnapshotStore`** (`packages/sandbox/src/snapshot-gcs.ts`) — full Google Cloud Storage SDK
- **`createSnapshotStore()`** (`packages/sandbox/src/snapshot-store.ts`) — parses `ASH_SNAPSHOT_URL` (`s3://bucket/prefix/` or `gs://bucket/prefix/`), dynamically imports SDK
- **`syncStateToCloud()`** / **`restoreStateFromCloud()`** / **`deleteCloudState()`** (`packages/sandbox/src/state-persistence.ts`) — real implementations that tar+gzip workspace and upload/download
- Already wired into session lifecycle: eviction → cloud sync, resume → cloud restore

Config: `ASH_SNAPSHOT_URL=s3://my-bucket/prefix/`

## Remaining Gap

The **SnapshotStore** operates on whole-workspace tarballs (tar.gz up, tar.gz down). ash-ai also has a **FileStore** for individual file operations:

```typescript
// ash-ai's FileStore — put/get/delete/list individual files
interface FileStore {
  put(key: string, content: Buffer, metadata?: Record<string, string>): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<FileMetadata[]>
}
```

The cloud uses this for:
- Storing individual file uploads (attachments, user-uploaded files)
- Per-tenant S3 buckets with STS assume role
- File operations that don't involve the whole workspace

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/workspace/` — `S3FileStore`, `createS3FileStore()`, `FileStore` interface
- `apps/web/src/lib/file-store.ts` — wraps `createS3FileStore`, `createSandboxFileSync`, `createSandboxFileOperations`
- `apps/web/src/lib/tenant-s3.ts` — per-tenant S3 config with STS assume role

## Approach

Add a `FileStore` interface alongside the existing `SnapshotStore` for individual file ops:

1. **Define `FileStore` interface** in `@ash-ai/sandbox`:
   ```typescript
   interface FileStore {
     put(key: string, content: Buffer, metadata?: Record<string, string>): Promise<void>
     get(key: string): Promise<Buffer | null>
     delete(key: string): Promise<void>
     list(prefix?: string): Promise<FileMetadata[]>
   }
   ```

2. **`S3FileStore`** — reuses the S3 client pattern from `S3SnapshotStore`
3. **`LocalFileStore`** — filesystem-backed for dev/testing

This is a smaller lift than originally scoped since the S3 client setup, config patterns, and dynamic imports already exist in the snapshot code.

## Open Questions

- Is individual file storage an Ash concern or a platform concern? The platform could implement its own `FileStore` using the same S3 credentials.
- Do we need per-tenant bucket/prefix support at the Ash level, or handle that in the cloud adapter?
