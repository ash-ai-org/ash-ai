/**
 * FileStore — interface for individual file operations (put/get/delete/list).
 *
 * Unlike SnapshotStore (whole-workspace tarballs), FileStore handles single files.
 * Useful for attachments, user uploads, and per-file access without full workspace restore.
 *
 * Config via ASH_FILE_STORE_URL:
 *   - Not set → null (no file store)
 *   - s3://bucket/prefix/ → S3
 *   - file:///path/to/dir → Local filesystem
 */

export interface FileMetadata {
  key: string;
  size: number;
  lastModified: string;
}

export interface FileStore {
  put(key: string, content: Buffer, metadata?: Record<string, string>): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<FileMetadata[]>;
  exists(key: string): Promise<boolean>;
}

/**
 * Parse a file store URL and return the appropriate implementation.
 */
export async function createFileStore(url: string): Promise<FileStore> {
  if (url.startsWith('s3://')) {
    const rest = url.slice('s3://'.length);
    const slashIdx = rest.indexOf('/');
    const bucket = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const prefix = slashIdx === -1 ? '' : rest.slice(slashIdx + 1);
    if (!bucket) throw new Error('Invalid S3 URL: missing bucket name');

    try {
      const { S3FileStore } = await import('./file-store-s3.js');
      return new S3FileStore(bucket, prefix);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as any).code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error('Install @aws-sdk/client-s3 to use S3 file store');
      }
      throw err;
    }
  }

  if (url.startsWith('file://')) {
    const dir = url.slice('file://'.length);
    if (!dir) throw new Error('Invalid file:// URL: missing directory path');
    const { LocalFileStore } = await import('./file-store-local.js');
    return new LocalFileStore(dir);
  }

  throw new Error(`Unsupported file store URL scheme: ${url} (expected s3:// or file://)`);
}

let storePromise: Promise<FileStore | null> | undefined;

/**
 * Module-level singleton. Returns null if ASH_FILE_STORE_URL is not set.
 * Caches the promise itself to prevent concurrent double-initialization.
 */
export async function getFileStore(): Promise<FileStore | null> {
  if (storePromise !== undefined) return storePromise;
  const url = process.env.ASH_FILE_STORE_URL;
  if (!url) {
    storePromise = Promise.resolve(null);
    return null;
  }
  storePromise = createFileStore(url);
  return storePromise;
}

/**
 * Reset the singleton (for testing).
 */
export function resetFileStore(): void {
  storePromise = undefined;
}
