# Plan 11: Workspace Bundles

## Status: Done
## Priority: Low
## Effort: Medium

## Problem

ash-ai has a `Workspace` + `BundleStore` system for persisting entire workspace states as compressed bundles. This enables:
- Restoring a workspace exactly as it was across sessions
- Cloud-backed workspace storage (Supabase, S3, GCS, R2)
- Workspace templates / cloning

Ash has file-level snapshot persistence but no bundled workspace concept.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/workspace/` — `Workspace` class, `BundleStore` interface, `LocalBundleStore`, `SupabaseBundleStore`, `S3BundleStore`, `GCSBundleStore`, `MemoryBundleStore`
- `harness/packages/ash-ai/src/workspace/` — `WorkspaceConfig`, `WorkspaceLoadResult`, `ManagedWorkspace`, `SandboxConnection`, `LocalSandbox`, `ProviderSandbox`
- `apps/web/src/lib/workspace-manager.ts` — `WorkspaceManager` using `SupabaseBundleStore`, creates `ManagedWorkspace` per session
- `apps/web/src/lib/services/session-restore.integration.test.ts` — integration tests for backup/restore with `restoreSessionState`, `backupSessionState`

## Current ash-ai Behavior

```typescript
interface BundleStore {
  upload(workspaceId: string, bundle: Buffer): Promise<void>
  download(workspaceId: string): Promise<Buffer | null>
  delete(workspaceId: string): Promise<void>
}

class Workspace {
  async load(): Promise<WorkspaceLoadResult>   // Download + extract bundle
  async save(message: string): Promise<WorkspaceSaveResult>  // Compress + upload
}

// Multiple backends
class LocalBundleStore { }
class SupabaseBundleStore { }
class S3BundleStore { }
class GCSBundleStore { }
```

## Approach

### Build on existing snapshot infrastructure

Ash already has `SnapshotStore` and `persistSessionState`/`restoreSessionState`. Bundles are essentially compressed snapshots.

1. **Add `BundleStore` interface** to `@ash-ai/sandbox`:
   ```typescript
   interface BundleStore {
     upload(id: string, bundle: Buffer): Promise<void>
     download(id: string): Promise<Buffer | null>
     delete(id: string): Promise<void>
     exists(id: string): Promise<boolean>
   }
   ```

2. **Bundle = tar.gz of workspace**:
   ```typescript
   function createBundle(workspaceDir: string): Promise<Buffer>
   function extractBundle(bundle: Buffer, targetDir: string): Promise<void>
   ```

3. **Implementations**:
   - `LocalBundleStore` — writes to `data/bundles/`
   - `S3BundleStore` — writes to S3 (depends on plan 07)

4. **Integrate with session lifecycle**:
   - On session end/pause: `createBundle()` → `bundleStore.upload()`
   - On session resume/fork: `bundleStore.download()` → `extractBundle()`
   - Replace or complement existing file-level snapshot persistence

5. **API endpoints** (optional):
   - `GET /api/sessions/:id/workspace` — download workspace bundle
   - `POST /api/sessions/:id/workspace` — upload/restore workspace bundle

## Implementation Steps

1. Implement `createBundle` / `extractBundle` using tar + gzip
2. Add BundleStore interface + LocalBundleStore
3. Add S3BundleStore
4. Integrate into pause/resume flow as alternative to file-level snapshots
5. Add optional API endpoints

## Open Questions

- Should bundles replace or complement the existing file-level snapshot system?
- Bundle size limits? Compression strategy?
- Should there be a workspace versioning/history system?
- Is this distinct enough from SnapshotStore to warrant a separate abstraction?
