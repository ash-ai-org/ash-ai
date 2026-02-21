import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalFileStore } from '../../../sandbox/src/file-store-local.js';
import { createFileStore } from '../../../sandbox/src/file-store.js';

describe('LocalFileStore', () => {
  let dir: string;
  let store: LocalFileStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ash-filestore-'));
    store = new LocalFileStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('put and get round-trip', async () => {
    const content = Buffer.from('hello world');
    await store.put('test.txt', content);
    const got = await store.get('test.txt');
    expect(got).not.toBeNull();
    expect(got!.toString()).toBe('hello world');
  });

  it('get returns null for missing key', async () => {
    const got = await store.get('nonexistent.txt');
    expect(got).toBeNull();
  });

  it('exists returns true for existing file', async () => {
    await store.put('exists.txt', Buffer.from('data'));
    expect(await store.exists('exists.txt')).toBe(true);
    expect(await store.exists('nope.txt')).toBe(false);
  });

  it('delete removes a file', async () => {
    await store.put('to-delete.txt', Buffer.from('data'));
    expect(await store.exists('to-delete.txt')).toBe(true);
    await store.delete('to-delete.txt');
    expect(await store.exists('to-delete.txt')).toBe(false);
  });

  it('delete is a no-op for missing file', async () => {
    // Should not throw
    await store.delete('nonexistent.txt');
  });

  it('put creates nested directories', async () => {
    await store.put('a/b/c/deep.txt', Buffer.from('deep'));
    const got = await store.get('a/b/c/deep.txt');
    expect(got!.toString()).toBe('deep');
  });

  it('list returns all files', async () => {
    await store.put('file1.txt', Buffer.from('1'));
    await store.put('dir/file2.txt', Buffer.from('2'));
    await store.put('dir/sub/file3.txt', Buffer.from('3'));

    const files = await store.list();
    const keys = files.map(f => f.key).sort();
    expect(keys).toEqual(['dir/file2.txt', 'dir/sub/file3.txt', 'file1.txt']);
  });

  it('list with prefix filters to subdirectory', async () => {
    await store.put('a/1.txt', Buffer.from('1'));
    await store.put('a/2.txt', Buffer.from('2'));
    await store.put('b/3.txt', Buffer.from('3'));

    const files = await store.list('a');
    const keys = files.map(f => f.key).sort();
    expect(keys).toEqual(['a/1.txt', 'a/2.txt']);
  });

  it('list returns empty array for missing prefix', async () => {
    const files = await store.list('nonexistent');
    expect(files).toEqual([]);
  });

  it('rejects path traversal', async () => {
    await expect(store.put('../escape.txt', Buffer.from('bad'))).rejects.toThrow('path traversal');
  });

  it('list includes file metadata', async () => {
    await store.put('meta.txt', Buffer.from('some content'));
    const files = await store.list();
    expect(files).toHaveLength(1);
    expect(files[0].key).toBe('meta.txt');
    expect(files[0].size).toBe(12); // 'some content'.length
    expect(files[0].lastModified).toBeTruthy();
  });
});

describe('createFileStore', () => {
  it('creates LocalFileStore for file:// URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ash-fs-factory-'));
    const store = await createFileStore(`file://${dir}`);
    await store.put('hello.txt', Buffer.from('world'));
    const got = await store.get('hello.txt');
    expect(got!.toString()).toBe('world');
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws for unsupported scheme', async () => {
    await expect(createFileStore('ftp://bad')).rejects.toThrow('Unsupported file store URL scheme');
  });

  it('throws for s3:// without AWS SDK installed', async () => {
    // S3FileStore requires @aws-sdk/client-s3 — this test verifies error handling
    // In CI without the SDK, it should give a helpful error
    // (If SDK IS installed, this would succeed, so we just verify it doesn't crash unexpectedly)
    try {
      await createFileStore('s3://test-bucket/prefix/');
      // If it doesn't throw, the SDK is available — that's fine
    } catch (err: unknown) {
      expect((err as Error).message).toMatch(/aws-sdk|S3/i);
    }
  });
});
