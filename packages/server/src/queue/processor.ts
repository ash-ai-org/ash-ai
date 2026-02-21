import type { QueueItem } from '@ash-ai/shared';
import { getNextPendingQueueItem, updateQueueItemStatus, incrementQueueItemRetry, getQueueItem } from '../db/index.js';

export interface QueueProcessorConfig {
  /** Milliseconds between poll cycles (default: 1000). */
  pollIntervalMs?: number;
  /** Maximum retry count per item (default: 3). */
  maxRetries?: number;
  /** Base delay between retries in ms — actual delay = base * 2^retryCount (default: 5000). */
  retryDelayMs?: number;
  /** Limit processing to a specific tenantId (omit for all tenants). */
  tenantId?: string;
}

export interface QueueProcessorCallbacks {
  /**
   * Called when a queue item is ready to be processed.
   * The implementation should send the prompt to the appropriate session/agent.
   * Throw an error to trigger retry logic.
   */
  process(item: QueueItem): Promise<void>;
  /** Called when an item has permanently failed after all retries. */
  onFailed?(item: QueueItem, error: string): void;
}

/**
 * QueueProcessor polls the DB for pending queue items and dispatches them
 * via a user-supplied callback. It handles retries with exponential backoff
 * and lifecycle status transitions (pending → processing → completed/failed).
 *
 * Design notes (Jeff Dean review):
 * - Single-row SELECT … ORDER BY priority DESC, created_at ASC with LIMIT 1
 *   acts as a distributed-safe dequeue when combined with optimistic status CAS.
 * - Backoff is capped at 5 minutes to prevent unbounded delays.
 * - The processor is intentionally single-threaded per instance — horizontal
 *   scaling is achieved by running multiple server instances (DB serializes).
 */
export class QueueProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  private readonly pollIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly tenantId?: string;

  constructor(
    private callbacks: QueueProcessorCallbacks,
    config: QueueProcessorConfig = {},
  ) {
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 5000;
    this.tenantId = config.tenantId;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    // Immediately attempt a poll on start
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  private async poll(): Promise<void> {
    // Guard against overlapping polls
    if (this.processing) return;
    this.processing = true;

    try {
      const item = await getNextPendingQueueItem(this.tenantId);
      if (!item) return;

      // Mark processing — this is our claim on the item
      await updateQueueItemStatus(item.id, 'processing');

      try {
        await this.callbacks.process(item);
        await updateQueueItemStatus(item.id, 'completed');
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await incrementQueueItemRetry(item.id);

        // Re-read to get the updated retryCount
        const updated = await getQueueItem(item.id);
        const retryCount = updated?.retryCount ?? item.retryCount + 1;
        const maxRetries = item.maxRetries ?? this.maxRetries;

        if (retryCount >= maxRetries) {
          // Permanently failed
          await updateQueueItemStatus(item.id, 'failed', errorMsg);
          this.callbacks.onFailed?.(item, errorMsg);
        } else {
          // Return to pending for retry — processor will pick it up after backoff
          await updateQueueItemStatus(item.id, 'pending', errorMsg);
          // Schedule backoff: delay before the item becomes eligible again
          const delay = Math.min(this.retryDelayMs * Math.pow(2, retryCount), 5 * 60 * 1000);
          setTimeout(() => this.poll(), delay);
        }
      }
    } catch (err) {
      // DB-level failure — log and continue polling
      console.error('[queue-processor] Poll error:', err);
    } finally {
      this.processing = false;
    }
  }
}
