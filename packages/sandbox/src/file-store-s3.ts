import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { FileStore, FileMetadata } from './file-store.js';

export class S3FileStore implements FileStore {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(bucket: string, prefix: string, region?: string) {
    this.bucket = bucket;
    this.prefix = prefix;
    this.client = new S3Client({ region: region || process.env.ASH_S3_REGION || 'us-east-1' });
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async put(key: string, content: Buffer, metadata?: Record<string, string>): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(key),
      Body: content,
      Metadata: metadata,
    }));
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const resp = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.fullKey(key),
      }));
      if (!resp.Body) return null;
      return Buffer.from(await resp.Body.transformToByteArray());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(key),
    }));
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    const fullPrefix = this.fullKey(prefix ?? '');
    const results: FileMetadata[] = [];
    let continuationToken: string | undefined;

    do {
      const resp = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: fullPrefix,
        ContinuationToken: continuationToken,
      }));

      for (const obj of resp.Contents ?? []) {
        if (!obj.Key) continue;
        // Strip the store prefix to return relative keys
        const relKey = obj.Key.startsWith(this.prefix) ? obj.Key.slice(this.prefix.length) : obj.Key;
        results.push({
          key: relKey,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString() ?? new Date().toISOString(),
        });
      }

      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);

    return results;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.fullKey(key),
      }));
      return true;
    } catch {
      return false;
    }
  }
}
