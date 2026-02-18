/**
 * SnapshotStore — interface for uploading/downloading workspace tarballs to cloud storage.
 *
 * Config via ASH_SNAPSHOT_URL:
 *   - Not set → local-only (default, zero config)
 *   - s3://bucket/prefix/ → S3
 *   - gs://bucket/prefix/ → GCS
 */

export interface SnapshotStore {
  upload(sessionId: string, tarPath: string): Promise<boolean>;
  download(sessionId: string, destPath: string): Promise<boolean>;
  exists(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<void>;
}

/**
 * Parse a snapshot URL and return the appropriate store implementation.
 * Throws on unrecognized scheme.
 */
export async function createSnapshotStore(url: string): Promise<SnapshotStore> {
  if (url.startsWith('s3://')) {
    const rest = url.slice('s3://'.length);
    const slashIdx = rest.indexOf('/');
    const bucket = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const prefix = slashIdx === -1 ? '' : rest.slice(slashIdx + 1);
    if (!bucket) throw new Error('Invalid S3 URL: missing bucket name');

    try {
      const { S3SnapshotStore } = await import('./snapshot-s3.js');
      return new S3SnapshotStore(bucket, prefix);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as any).code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('Install @aws-sdk/client-s3 to use S3 snapshots');
      }
      throw err;
    }
  }

  if (url.startsWith('gs://')) {
    const rest = url.slice('gs://'.length);
    const slashIdx = rest.indexOf('/');
    const bucket = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const prefix = slashIdx === -1 ? '' : rest.slice(slashIdx + 1);
    if (!bucket) throw new Error('Invalid GCS URL: missing bucket name');

    try {
      const { GcsSnapshotStore } = await import('./snapshot-gcs.js');
      return new GcsSnapshotStore(bucket, prefix);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as any).code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('Install @google-cloud/storage to use GCS snapshots');
      }
      throw err;
    }
  }

  throw new Error(`Unsupported snapshot URL scheme: ${url} (expected s3:// or gs://)`);
}

let store: SnapshotStore | null | undefined;

/**
 * Module-level singleton. Returns null if ASH_SNAPSHOT_URL is not set.
 * Caches the store instance after first call.
 */
export async function getSnapshotStore(): Promise<SnapshotStore | null> {
  if (store !== undefined) return store;
  const url = process.env.ASH_SNAPSHOT_URL;
  if (!url) {
    store = null;
    return null;
  }
  store = await createSnapshotStore(url);
  return store;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSnapshotStore(): void {
  store = undefined;
}
