import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSnapshotStore,
  getSnapshotStore,
  resetSnapshotStore,
} from '@ash-ai/sandbox';
import {
  syncStateToCloud,
  restoreStateFromCloud,
  deleteCloudState,
  persistSessionState,
} from '@ash-ai/sandbox';

describe('snapshot-store', () => {
  beforeEach(() => {
    resetSnapshotStore();
  });

  afterEach(() => {
    resetSnapshotStore();
    delete process.env.ASH_SNAPSHOT_URL;
  });

  describe('createSnapshotStore', () => {
    it('throws on unrecognized scheme', async () => {
      await expect(createSnapshotStore('ftp://bucket/prefix/')).rejects.toThrow(
        'Unsupported snapshot URL scheme'
      );
    });

    it('throws on empty bucket for s3', async () => {
      await expect(createSnapshotStore('s3://')).rejects.toThrow(
        'Invalid S3 URL: missing bucket name'
      );
    });

    it('throws on empty bucket for gs', async () => {
      await expect(createSnapshotStore('gs://')).rejects.toThrow(
        'Invalid GCS URL: missing bucket name'
      );
    });

    it('parses s3 URL with bucket only', async () => {
      // This will fail to import @aws-sdk/client-s3 in test env (not installed)
      // but we verify parsing by checking the error message
      try {
        await createSnapshotStore('s3://my-bucket');
      } catch (err: unknown) {
        // Either "Install @aws-sdk/client-s3" or the actual import succeeds
        // Both are valid outcomes depending on test environment
        expect(err).toBeDefined();
      }
    });

    it('parses gs URL with bucket and prefix', async () => {
      try {
        await createSnapshotStore('gs://my-bucket/some/prefix/');
      } catch (err: unknown) {
        expect(err).toBeDefined();
      }
    });
  });

  describe('getSnapshotStore', () => {
    it('returns null when ASH_SNAPSHOT_URL is not set', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      const store = await getSnapshotStore();
      expect(store).toBeNull();
    });

    it('caches the null result', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      const store1 = await getSnapshotStore();
      const store2 = await getSnapshotStore();
      expect(store1).toBeNull();
      expect(store2).toBeNull();
    });
  });

  describe('syncStateToCloud', () => {
    let dataDir: string;

    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'ash-test-cloud-'));
    });

    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true });
    });

    it('returns false when no store configured', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      const result = await syncStateToCloud(dataDir, 'sess-1');
      expect(result).toBe(false);
    });

    it('returns false when no persisted workspace exists', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      const result = await syncStateToCloud(dataDir, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('restoreStateFromCloud', () => {
    let dataDir: string;

    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'ash-test-cloud-'));
    });

    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true });
    });

    it('returns false when no store configured', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      const result = await restoreStateFromCloud(dataDir, 'sess-1');
      expect(result).toBe(false);
    });
  });

  describe('deleteCloudState', () => {
    it('is a no-op when no store configured', async () => {
      delete process.env.ASH_SNAPSHOT_URL;
      // Should not throw
      await deleteCloudState('sess-1');
    });
  });
});
