import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { initDb, closeDb, insertQueueItem, getQueueItem, getNextPendingQueueItem, claimQueueItem, updateQueueItemStatus, incrementQueueItemRetry, listQueueItems, getQueueStats } from '../db/index.js';
import { QueueProcessor } from '../queue/processor.js';

const tenant = 'queue-test';
let n = 0;
const uid = () => `q-${Date.now()}-${++n}`;

describe('queue', () => {
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ash-queue-'));
    await initDb({ dataDir: dir });
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('db operations', () => {
    it('inserts and retrieves a queue item', async () => {
      const id = uid();
      const item = await insertQueueItem(id, tenant, 'my-agent', 'hello world');
      expect(item.id).toBe(id);
      expect(item.status).toBe('pending');
      expect(item.agentName).toBe('my-agent');
      expect(item.prompt).toBe('hello world');
      expect(item.retryCount).toBe(0);
      expect(item.maxRetries).toBe(3);

      const got = await getQueueItem(id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(id);
    });

    it('getNextPendingQueueItem returns highest-priority item', async () => {
      const a = uid(), b = uid();
      await insertQueueItem(a, tenant, 'agent', 'low priority', undefined, 0);
      await insertQueueItem(b, tenant, 'agent', 'high priority', undefined, 10);

      const next = await getNextPendingQueueItem(tenant);
      expect(next).not.toBeNull();
      expect(next!.id).toBe(b); // highest priority wins
    });

    it('getNextPendingQueueItem skips non-pending items', async () => {
      const a = uid(), b = uid();
      await insertQueueItem(a, tenant, 'agent', 'processing');
      await updateQueueItemStatus(a, 'processing');
      await insertQueueItem(b, tenant, 'agent', 'pending');

      const next = await getNextPendingQueueItem(tenant);
      expect(next!.id).toBe(b);
    });

    it('updateQueueItemStatus sets timestamps', async () => {
      const id = uid();
      await insertQueueItem(id, tenant, 'agent', 'test');

      await updateQueueItemStatus(id, 'processing');
      let item = await getQueueItem(id);
      expect(item!.status).toBe('processing');
      expect(item!.startedAt).not.toBeNull();

      await updateQueueItemStatus(id, 'completed');
      item = await getQueueItem(id);
      expect(item!.status).toBe('completed');
      expect(item!.completedAt).not.toBeNull();
    });

    it('updateQueueItemStatus records error', async () => {
      const id = uid();
      await insertQueueItem(id, tenant, 'agent', 'test');
      await updateQueueItemStatus(id, 'failed', 'something broke');
      const item = await getQueueItem(id);
      expect(item!.status).toBe('failed');
      expect(item!.error).toBe('something broke');
    });

    it('incrementQueueItemRetry bumps retry count', async () => {
      const id = uid();
      await insertQueueItem(id, tenant, 'agent', 'test');
      await incrementQueueItemRetry(id);
      await incrementQueueItemRetry(id);
      const item = await getQueueItem(id);
      expect(item!.retryCount).toBe(2);
    });

    it('listQueueItems filters by tenant and status', async () => {
      const a = uid(), b = uid(), c = uid();
      await insertQueueItem(a, tenant, 'agent', 'test1');
      await insertQueueItem(b, tenant, 'agent', 'test2');
      await insertQueueItem(c, 'other-tenant', 'agent', 'test3');
      await updateQueueItemStatus(b, 'completed');

      const all = await listQueueItems(tenant);
      expect(all.length).toBe(2);

      const pending = await listQueueItems(tenant, 'pending');
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(a);
    });

    it('getQueueStats groups by status', async () => {
      const a = uid(), b = uid(), c = uid();
      await insertQueueItem(a, tenant, 'agent', 'p1');
      await insertQueueItem(b, tenant, 'agent', 'p2');
      await insertQueueItem(c, tenant, 'agent', 'p3');
      await updateQueueItemStatus(b, 'processing');
      await updateQueueItemStatus(c, 'completed');

      const stats = await getQueueStats(tenant);
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.cancelled).toBe(0);
    });
  });

  describe('QueueProcessor', () => {
    it('processes pending items', async () => {
      const id = uid();
      await insertQueueItem(id, tenant, 'agent', 'process me', undefined, 0, 3);

      const processed: string[] = [];
      const processor = new QueueProcessor({
        process: async (item) => { processed.push(item.id); },
      }, { pollIntervalMs: 50, tenantId: tenant });

      processor.start();
      // Wait for poll cycle
      await new Promise(r => setTimeout(r, 200));
      processor.stop();

      expect(processed).toContain(id);
      const item = await getQueueItem(id);
      expect(item!.status).toBe('completed');
    });

    it('retries on failure and eventually marks failed', async () => {
      const id = uid();
      await insertQueueItem(id, tenant, 'agent', 'fail me', undefined, 0, 2);

      let attempts = 0;
      const failedItems: string[] = [];
      const processor = new QueueProcessor({
        process: async () => { attempts++; throw new Error('boom'); },
        onFailed: (item) => { failedItems.push(item.id); },
      }, { pollIntervalMs: 50, retryDelayMs: 50, tenantId: tenant });

      processor.start();
      await new Promise(r => setTimeout(r, 600));
      processor.stop();

      // Should have attempted at least twice (initial + retry)
      expect(attempts).toBeGreaterThanOrEqual(2);
      const item = await getQueueItem(id);
      expect(item!.status).toBe('failed');
      expect(item!.error).toBe('boom');
      expect(failedItems).toContain(id);
    });

    it('start and stop are idempotent', () => {
      const processor = new QueueProcessor({
        process: async () => {},
      });
      processor.start();
      processor.start(); // no-op
      expect(processor.isRunning).toBe(true);
      processor.stop();
      processor.stop(); // no-op
      expect(processor.isRunning).toBe(false);
    });
  });
});
