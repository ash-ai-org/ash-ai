import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import type { FileStore, FileMetadata } from './file-store.js';

/**
 * Filesystem-backed FileStore for local development and testing.
 * Stores files under a root directory using the key as the relative path.
 */
export class LocalFileStore implements FileStore {
  constructor(private rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private resolve(key: string): string {
    // Prevent path traversal
    const resolved = join(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error('Invalid key: path traversal detected');
    }
    return resolved;
  }

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.resolve(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  async get(key: string): Promise<Buffer | null> {
    const path = this.resolve(key);
    try {
      return readFileSync(path);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as any).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolve(key);
    try {
      unlinkSync(path);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as any).code === 'ENOENT') return;
      throw err;
    }
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    const dir = prefix ? this.resolve(prefix) : this.rootDir;
    if (!existsSync(dir)) return [];

    const results: FileMetadata[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const fullPath = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const stat = statSync(fullPath);
          results.push({
            key: relative(this.rootDir, fullPath),
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
          });
        }
      }
    };
    walk(dir);
    return results;
  }

  async exists(key: string): Promise<boolean> {
    const path = this.resolve(key);
    return existsSync(path);
  }
}
