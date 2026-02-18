import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { SnapshotStore } from './snapshot-store.js';

export class S3SnapshotStore implements SnapshotStore {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(bucket: string, prefix: string, region?: string) {
    this.bucket = bucket;
    this.prefix = prefix;
    this.client = new S3Client({ region: region || process.env.ASH_S3_REGION || 'us-east-1' });
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}/workspace.tar.gz`;
  }

  async upload(sessionId: string, tarPath: string): Promise<boolean> {
    try {
      const stream = createReadStream(tarPath);
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(sessionId),
        Body: stream,
        ContentType: 'application/gzip',
      }));
      return true;
    } catch (err) {
      console.error(`[snapshot-s3] Upload failed for ${sessionId}:`, err);
      return false;
    }
  }

  async download(sessionId: string, destPath: string): Promise<boolean> {
    try {
      const resp = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(sessionId),
      }));
      if (!resp.Body) return false;
      const ws = createWriteStream(destPath);
      await pipeline(resp.Body as Readable, ws);
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NoSuchKey') return false;
      console.error(`[snapshot-s3] Download failed for ${sessionId}:`, err);
      return false;
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key(sessionId),
      }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key(sessionId),
      }));
    } catch (err) {
      console.error(`[snapshot-s3] Delete failed for ${sessionId}:`, err);
    }
  }
}
