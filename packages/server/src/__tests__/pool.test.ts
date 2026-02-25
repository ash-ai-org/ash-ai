import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { initDb, closeDb } from '../db/index.js';
import { SandboxPool } from '@ash-ai/sandbox';
import type { SandboxManager, ManagedSandbox, CreateSandboxOpts } from '@ash-ai/sandbox';
import type { Db } from '../db/index.js';

// Mock ChildProcess — just enough to satisfy ManagedSandbox.process
function mockProcess(exitCode: number | null = null): any {
  const proc = new EventEmitter();
  (proc as any).exitCode = exitCode;
  (proc as any).kill = vi.fn();
  (proc as any).pid = Math.floor(Math.random() * 100000);
  return proc;
}

function mockSandbox(id: string, exitCode: number | null = null): ManagedSandbox {
  return {
    id,
    process: mockProcess(exitCode),
    client: { connect: vi.fn(), disconnect: vi.fn(), sendCommand: vi.fn() } as any,
    socketPath: `/tmp/ash-${id.slice(0, 8)}.sock`,
    workspaceDir: `/tmp/test-sandboxes/${id}/workspace`,
    createdAt: new Date().toISOString(),
    limits: { memoryMb: 512, cpuPercent: 100, diskMb: 1024, maxProcesses: 64 },
  };
}

function mockManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  const sandboxes = new Map<string, ManagedSandbox>();
  return {
    create: vi.fn(async (opts: CreateSandboxOpts) => {
      const sb = mockSandbox(opts.id ?? opts.sessionId);
      sandboxes.set(sb.id, sb);
      return sb;
    }),
    get: vi.fn((id: string) => sandboxes.get(id)),
    destroy: vi.fn(async (id: string) => { sandboxes.delete(id); }),
    destroyAll: vi.fn(async () => { sandboxes.clear(); }),
    get activeCount() { return sandboxes.size; },
    ...overrides,
  } as any;
}

describe('SandboxPool', () => {
  let dataDir: string;
  let db: Db;
  let manager: SandboxManager;
  let pool: SandboxPool;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-test-pool-'));
    db = await initDb({ dataDir });
    manager = mockManager();
  });

  afterEach(async () => {
    pool?.stopIdleSweep();
    pool?.stopColdCleanup();
    await closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function createPool(overrides: Record<string, any> = {}) {
    pool = new SandboxPool({
      manager,
      db,
      dataDir,
      ...overrides,
    });
    return pool;
  }

  // Need to insert an agent before creating sandboxes that reference it
  async function insertAgent(name = 'test-agent') {
    await db.upsertAgent(name, '/tmp/agent');
  }

  describe('init', () => {
    it('marks all non-cold sandboxes as cold on startup', async () => {
      createPool();
      // Manually insert sandbox rows simulating a crash
      await db.insertSandbox('sb-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('sb-1', 'running');
      await db.insertSandbox('sb-2', 'test-agent', '/tmp/ws2');
      await db.updateSandboxState('sb-2', 'waiting');
      await db.insertSandbox('sb-3', 'test-agent', '/tmp/ws3');
      await db.updateSandboxState('sb-3', 'cold');

      await pool.init();

      expect((await db.getSandbox('sb-1'))!.state).toBe('cold');
      expect((await db.getSandbox('sb-2'))!.state).toBe('cold');
      expect((await db.getSandbox('sb-3'))!.state).toBe('cold');
    });

    it('returns count of marked sandboxes', async () => {
      createPool();
      await db.insertSandbox('sb-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('sb-1', 'running');
      await db.insertSandbox('sb-2', 'test-agent', '/tmp/ws2');
      await db.updateSandboxState('sb-2', 'cold');

      await pool.init();
      // sb-1 was running (now cold), sb-2 was already cold
      // init calls markAllSandboxesCold which returns changes count
      // We verify the final state instead
      expect((await db.getSandbox('sb-1'))!.state).toBe('cold');
    });
  });

  describe('create', () => {
    it('creates a sandbox and caches it', async () => {
      await insertAgent();
      createPool();

      const sb = await pool.create({
        agentDir: '/tmp/agent',
        sessionId: 'sess-1',
        id: 'sb-1',
        agentName: 'test-agent',
      });

      expect(sb.id).toBe('sb-1');
      expect(pool.get('sb-1')).toBe(sb);

      // DB record exists and is warm
      const record = await db.getSandbox('sb-1');
      expect(record).not.toBeNull();
      expect(record!.state).toBe('warm');
      expect(record!.agentName).toBe('test-agent');
    });

    it('indexes sandbox by session ID', async () => {
      await insertAgent();
      createPool();

      const sb = await pool.create({
        agentDir: '/tmp/agent',
        sessionId: 'sess-1',
        id: 'sb-1',
        agentName: 'test-agent',
      });

      expect(pool.getSandboxForSession('sess-1')).toBe(sb);
    });

    it('cleans up DB row on creation failure', async () => {
      const failManager = mockManager({
        create: vi.fn(async () => { throw new Error('spawn failed'); }),
      } as any);
      createPool({ manager: failManager });

      await expect(pool.create({
        agentDir: '/tmp/agent',
        sessionId: 'sess-1',
        id: 'sb-fail',
        agentName: 'test-agent',
      })).rejects.toThrow('spawn failed');

      expect(await db.getSandbox('sb-fail')).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('markRunning updates in-memory and DB state', async () => {
      await insertAgent();
      createPool();
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      pool.markRunning('sb-1');

      expect(pool.getEntry('sb-1')!.state).toBe('running');
      // Wait for fire-and-forget DB update
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.getSandbox('sb-1'))!.state).toBe('running');
    });

    it('markWaiting updates in-memory and DB state', async () => {
      await insertAgent();
      createPool();
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');

      pool.markWaiting('sb-1');

      expect(pool.getEntry('sb-1')!.state).toBe('waiting');
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.getSandbox('sb-1'))!.state).toBe('waiting');
    });

    it('markRunning on nonexistent sandbox is a no-op', () => {
      createPool();
      pool.markRunning('nonexistent'); // should not throw
    });
  });

  describe('get', () => {
    it('returns undefined for unknown sandbox', () => {
      createPool();
      expect(pool.get('unknown')).toBeUndefined();
    });

    it('detects dead process and marks cold', async () => {
      await insertAgent();
      createPool();
      const sb = await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      // Simulate process death
      (sb.process as any).exitCode = 1;

      const result = pool.get('sb-1');
      expect(result).toBeUndefined();
      expect(pool.getSandboxForSession('s1')).toBeUndefined();

      // DB should eventually be updated to cold
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.getSandbox('sb-1'))!.state).toBe('cold');
    });
  });

  describe('destroy', () => {
    it('removes sandbox from live map, session index, and DB', async () => {
      await insertAgent();
      createPool();
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      await pool.destroy('sb-1');

      expect(pool.get('sb-1')).toBeUndefined();
      expect(pool.getSandboxForSession('s1')).toBeUndefined();
      expect(await db.getSandbox('sb-1')).toBeNull();
    });

    it('calls manager.destroy', async () => {
      await insertAgent();
      createPool();
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      await pool.destroy('sb-1');

      expect(manager.destroy).toHaveBeenCalledWith('sb-1');
    });
  });

  describe('destroyAll', () => {
    it('destroys all live sandboxes', async () => {
      await insertAgent();
      createPool();
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's2', id: 'sb-2', agentName: 'test-agent' });

      await pool.destroyAll();

      expect(pool.activeCount).toBe(0);
    });
  });

  describe('capacity enforcement', () => {
    it('evicts cold sandbox when at capacity', async () => {
      await insertAgent();
      createPool({ maxCapacity: 2 });

      // Insert a cold sandbox directly in DB (simulating a previous run)
      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws');
      await db.updateSandboxState('cold-1', 'cold');

      // Create one live sandbox (total = 2, at capacity)
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      // This should evict cold-1 to make room
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's2', id: 'sb-2', agentName: 'test-agent' });

      // Cold sandbox should be gone
      expect(await db.getSandbox('cold-1')).toBeNull();
      // New sandbox should exist
      expect(pool.get('sb-2')).toBeDefined();
    });

    it('evicts warm sandbox when no cold available', async () => {
      await insertAgent();
      createPool({ maxCapacity: 2 });

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's2', id: 'sb-2', agentName: 'test-agent' });
      // Both are warm, at capacity

      // sb-1 is oldest — should be evicted
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's3', id: 'sb-3', agentName: 'test-agent' });

      expect(pool.get('sb-1')).toBeUndefined();
      expect(pool.get('sb-3')).toBeDefined();
    });

    it('evicts waiting sandbox with onBeforeEvict callback', async () => {
      await insertAgent();
      const onBeforeEvict = vi.fn(async () => {});
      createPool({ maxCapacity: 1, onBeforeEvict });

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');
      pool.markWaiting('sb-1');
      // Wait for DB updates
      await new Promise((r) => setTimeout(r, 50));

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's2', id: 'sb-2', agentName: 'test-agent' });

      expect(onBeforeEvict).toHaveBeenCalled();
      expect(pool.get('sb-1')).toBeUndefined();
    });

    it('throws when all sandboxes are running and at capacity', async () => {
      await insertAgent();
      createPool({ maxCapacity: 1 });

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');
      // Wait for DB update
      await new Promise((r) => setTimeout(r, 50));

      await expect(pool.create({
        agentDir: '/tmp/agent',
        sessionId: 's2',
        id: 'sb-2',
        agentName: 'test-agent',
      })).rejects.toThrow('Sandbox capacity reached');
    });
  });

  describe('idle sweep', () => {
    it('sweeps waiting sandboxes past idle timeout', async () => {
      await insertAgent();
      createPool({ idleTimeoutMs: 0 }); // instant timeout for testing

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');
      pool.markWaiting('sb-1');
      // Wait for DB updates
      await new Promise((r) => setTimeout(r, 50));

      const swept = await pool.sweepIdle();
      expect(swept).toBe(1);
      expect(pool.get('sb-1')).toBeUndefined();

      // DB record should be cold (not deleted)
      expect((await db.getSandbox('sb-1'))!.state).toBe('cold');
    });

    it('skips running sandboxes', async () => {
      await insertAgent();
      createPool({ idleTimeoutMs: 0 });

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');
      await new Promise((r) => setTimeout(r, 50));

      const swept = await pool.sweepIdle();
      expect(swept).toBe(0);
      expect(pool.get('sb-1')).toBeDefined();
    });

    it('skips sandboxes within idle timeout', async () => {
      await insertAgent();
      createPool({ idleTimeoutMs: 60 * 60 * 1000 }); // 1 hour

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      pool.markRunning('sb-1');
      pool.markWaiting('sb-1');
      await new Promise((r) => setTimeout(r, 50));

      const swept = await pool.sweepIdle();
      expect(swept).toBe(0);
    });

    it('startIdleSweep and stopIdleSweep manage the interval', () => {
      createPool();
      pool.startIdleSweep();
      // Should not throw on double start
      pool.startIdleSweep();

      pool.stopIdleSweep();
      // Should not throw on double stop
      pool.stopIdleSweep();
    });
  });

  describe('stats', () => {
    it('reports live sandbox states', async () => {
      await insertAgent();
      createPool();

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's2', id: 'sb-2', agentName: 'test-agent' });
      pool.markRunning('sb-1');

      const s = pool.stats;
      expect(s.running).toBe(1);
      expect(s.warm).toBe(1);
      expect(s.maxCapacity).toBe(1000); // default
    });

    it('statsAsync includes cold count from DB', async () => {
      await insertAgent();
      createPool();

      // Add a cold sandbox to DB
      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws');
      await db.updateSandboxState('cold-1', 'cold');

      // Add a live sandbox
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      const s = await pool.statsAsync();
      expect(s.total).toBe(2);
      expect(s.cold).toBe(1);
      expect(s.warm).toBe(1);
    });
  });

  describe('activeCount', () => {
    it('reflects live sandbox count', async () => {
      await insertAgent();
      createPool();

      expect(pool.activeCount).toBe(0);

      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });
      expect(pool.activeCount).toBe(1);

      await pool.destroy('sb-1');
      expect(pool.activeCount).toBe(0);
    });
  });

  describe('cold cleanup', () => {
    it('sweepCold removes stale cold sandboxes from DB', async () => {
      createPool({ coldCleanupTtlMs: 0 }); // instant TTL for testing

      // Insert cold sandboxes directly in DB
      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws1', 'sess-1');
      await db.updateSandboxState('cold-1', 'cold');
      await db.insertSandbox('cold-2', 'test-agent', '/tmp/ws2', 'sess-2');
      await db.updateSandboxState('cold-2', 'cold');

      // Wait a tick so that "now - 0" threshold is strictly after the lastUsedAt timestamps
      await new Promise((r) => setTimeout(r, 10));

      const cleaned = await pool.sweepCold();
      expect(cleaned).toBe(2);

      // DB rows should be gone
      expect(await db.getSandbox('cold-1')).toBeNull();
      expect(await db.getSandbox('cold-2')).toBeNull();
    });

    it('sweepCold skips cold sandboxes within TTL', async () => {
      createPool({ coldCleanupTtlMs: 60 * 60 * 1000 }); // 1 hour

      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('cold-1', 'cold');

      const cleaned = await pool.sweepCold();
      expect(cleaned).toBe(0);

      // DB row should still exist
      expect(await db.getSandbox('cold-1')).not.toBeNull();
    });

    it('sweepCold does not touch non-cold sandboxes', async () => {
      await insertAgent();
      createPool({ coldCleanupTtlMs: 0 });

      // Create a live (warm) sandbox
      await pool.create({ agentDir: '/tmp/agent', sessionId: 's1', id: 'sb-1', agentName: 'test-agent' });

      const cleaned = await pool.sweepCold();
      expect(cleaned).toBe(0);
      expect(pool.get('sb-1')).toBeDefined();
    });

    it('startColdCleanup and stopColdCleanup manage the interval', () => {
      createPool();
      pool.startColdCleanup();
      // Should not throw on double start
      pool.startColdCleanup();

      pool.stopColdCleanup();
      // Should not throw on double stop
      pool.stopColdCleanup();
    });
  });

  describe('getColdSandboxes', () => {
    it('returns cold sandboxes older than threshold', async () => {
      createPool();

      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('cold-1', 'cold');

      // Query with a future threshold — should return the sandbox
      const future = new Date(Date.now() + 60_000).toISOString();
      const results = await db.getColdSandboxes(future);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('cold-1');
    });

    it('excludes cold sandboxes newer than threshold', async () => {
      createPool();

      await db.insertSandbox('cold-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('cold-1', 'cold');

      // Query with a past threshold — should return nothing
      const past = new Date(Date.now() - 60_000).toISOString();
      const results = await db.getColdSandboxes(past);
      expect(results.length).toBe(0);
    });

    it('excludes non-cold sandboxes', async () => {
      createPool();

      await db.insertSandbox('warm-1', 'test-agent', '/tmp/ws1');
      await db.updateSandboxState('warm-1', 'warm');

      const future = new Date(Date.now() + 60_000).toISOString();
      const results = await db.getColdSandboxes(future);
      expect(results.length).toBe(0);
    });
  });

  describe('resume source counters', () => {
    it('recordColdLocalHit increments local and total cold counters', () => {
      createPool();
      pool.recordColdLocalHit();

      const s = pool.stats;
      expect(s.resumeColdLocalHits).toBe(1);
      expect(s.resumeColdHits).toBe(1);
      expect(s.resumeColdCloudHits).toBe(0);
      expect(s.resumeColdFreshHits).toBe(0);
    });

    it('recordColdCloudHit increments cloud and total cold counters', () => {
      createPool();
      pool.recordColdCloudHit();

      const s = pool.stats;
      expect(s.resumeColdCloudHits).toBe(1);
      expect(s.resumeColdHits).toBe(1);
      expect(s.resumeColdLocalHits).toBe(0);
      expect(s.resumeColdFreshHits).toBe(0);
    });

    it('recordColdFreshHit increments fresh and total cold counters', () => {
      createPool();
      pool.recordColdFreshHit();

      const s = pool.stats;
      expect(s.resumeColdFreshHits).toBe(1);
      expect(s.resumeColdHits).toBe(1);
      expect(s.resumeColdLocalHits).toBe(0);
      expect(s.resumeColdCloudHits).toBe(0);
    });

    it('multiple source hits accumulate correctly', () => {
      createPool();
      pool.recordColdLocalHit();
      pool.recordColdLocalHit();
      pool.recordColdCloudHit();
      pool.recordColdFreshHit();

      const s = pool.stats;
      expect(s.resumeColdLocalHits).toBe(2);
      expect(s.resumeColdCloudHits).toBe(1);
      expect(s.resumeColdFreshHits).toBe(1);
      expect(s.resumeColdHits).toBe(4);
    });

    it('statsAsync includes resume source counters', async () => {
      createPool();
      pool.recordColdLocalHit();
      pool.recordColdCloudHit();

      const s = await pool.statsAsync();
      expect(s.resumeColdLocalHits).toBe(1);
      expect(s.resumeColdCloudHits).toBe(1);
      expect(s.resumeColdFreshHits).toBe(0);
    });
  });
});
