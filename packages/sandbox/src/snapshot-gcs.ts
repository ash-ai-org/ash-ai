import { Storage } from '@google-cloud/storage';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { SnapshotStore } from './snapshot-store.js';

export class GcsSnapshotStore implements SnapshotStore {
  private storage: Storage;
  private bucket: string;
  private prefix: string;

  constructor(bucket: string, prefix: string) {
    this.bucket = bucket;
    this.prefix = prefix;
    this.storage = new Storage(); // Uses ADC (Application Default Credentials)
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}/workspace.tar.gz`;
  }

  async upload(sessionId: string, tarPath: string): Promise<boolean> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.key(sessionId));
      const stream = createReadStream(tarPath);
      await pipeline(stream, file.createWriteStream({ contentType: 'application/gzip' }));
      return true;
    } catch (err) {
      console.error(`[snapshot-gcs] Upload failed for ${sessionId}:`, err);
      return false;
    }
  }

  async download(sessionId: string, destPath: string): Promise<boolean> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.key(sessionId));
      const [exists] = await file.exists();
      if (!exists) return false;
      const ws = createWriteStream(destPath);
      await pipeline(file.createReadStream(), ws);
      return true;
    } catch (err) {
      console.error(`[snapshot-gcs] Download failed for ${sessionId}:`, err);
      return false;
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.key(sessionId));
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  async delete(sessionId: string): Promise<void> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.key(sessionId));
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      console.error(`[snapshot-gcs] Delete failed for ${sessionId}:`, err);
    }
  }
}
