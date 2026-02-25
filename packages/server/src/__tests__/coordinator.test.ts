import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initDb, closeDb, insertSession, updateSessionStatus, updateSessionRunner } from '../db/index.js';
import { RunnerCoordinator } from '../runner/coordinator.js';

const TEST_DIR = join(import.meta.dirname ?? '.', '..', '..', '.test-coordinator-' + process.pid);

describe('RunnerCoordinator (DB-backed)', () => {
  let coordinator: RunnerCoordinator;

  beforeEach(async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    await initDb({ dataDir: TEST_DIR });
    coordinator = new RunnerCoordinator({});
  });

  afterEach(async () => {
    coordinator.stopLivenessSweep();
    await closeDb();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('registerRunner', () => {
    it('registers a new runner and persists to DB', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      const info = await coordinator.getRunnerInfoFromDb();
      expect(info).toHaveLength(1);
      expect(info[0].runnerId).toBe('runner-1');
      expect(info[0].host).toBe('host-1');
      expect(info[0].port).toBe(4200);
      expect(info[0].max).toBe(50);
    });

    it('re-registers an existing runner with updated connection info', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'old-host',
        port: 4200,
        maxSandboxes: 50,
      });

      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'new-host',
        port: 4201,
        maxSandboxes: 100,
      });

      const info = await coordinator.getRunnerInfoFromDb();
      expect(info).toHaveLength(1);
      expect(info[0].host).toBe('new-host');
      expect(info[0].port).toBe(4201);
      expect(info[0].max).toBe(100);
    });
  });

  describe('heartbeat', () => {
    it('updates runner stats in DB', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      await coordinator.heartbeat('runner-1', {
        total: 10, cold: 0, warming: 2, warm: 3, waiting: 3, running: 5,
        maxCapacity: 50, resumeWarmHits: 0, resumeColdHits: 0, resumeColdLocalHits: 0, resumeColdCloudHits: 0, resumeColdFreshHits: 0, preWarmHits: 0,
      });

      const info = await coordinator.getRunnerInfoFromDb();
      expect(info[0].active).toBe(5);  // running count
    });
  });

  describe('selectBackend', () => {
    it('throws when no runners available and no local backend', async () => {
      await expect(coordinator.selectBackend()).rejects.toThrow('No runners available');
    });

    it('falls back to local backend when no remote runners', async () => {
      const localBackend = {
        createSandbox: vi.fn(),
        destroySandbox: vi.fn(),
        destroyAll: vi.fn(),
        sendCommand: vi.fn(),
        interrupt: vi.fn(),
        getSandbox: vi.fn(),
        isSandboxAlive: vi.fn(),
        markRunning: vi.fn(),
        markWaiting: vi.fn(),
        recordWarmHit: vi.fn(),
        recordColdHit: vi.fn(),
        recordColdLocalHit: vi.fn(),
        recordColdCloudHit: vi.fn(),
        recordColdFreshHit: vi.fn(),
        persistState: vi.fn(),
        getLogs: vi.fn().mockReturnValue([]),
        getStats: vi.fn(),
        activeCount: 0,
      };

      const coordWithLocal = new RunnerCoordinator({ localBackend });
      const result = await coordWithLocal.selectBackend();
      expect(result.runnerId).toBe('__local__');
      expect(result.backend).toBe(localBackend);
    });

    it('selects runner with most available capacity', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      await coordinator.registerRunner({
        runnerId: 'runner-2',
        host: 'host-2',
        port: 4201,
        maxSandboxes: 100,
      });

      // runner-1 has 40 active sandboxes (10 available)
      await coordinator.heartbeat('runner-1', {
        total: 50, cold: 0, warming: 5, warm: 0, waiting: 5, running: 40,
        maxCapacity: 50, resumeWarmHits: 0, resumeColdHits: 0, resumeColdLocalHits: 0, resumeColdCloudHits: 0, resumeColdFreshHits: 0, preWarmHits: 0,
      });

      // runner-2 has 10 active sandboxes (90 available)
      await coordinator.heartbeat('runner-2', {
        total: 100, cold: 0, warming: 0, warm: 0, waiting: 0, running: 10,
        maxCapacity: 100, resumeWarmHits: 0, resumeColdHits: 0, resumeColdLocalHits: 0, resumeColdCloudHits: 0, resumeColdFreshHits: 0, preWarmHits: 0,
      });

      const result = await coordinator.selectBackend();
      expect(result.runnerId).toBe('runner-2');
    });
  });

  describe('handleDeadRunner', () => {
    it('marks active sessions on dead runner as paused and removes runner', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-dead',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      // Create a session on this runner
      const sessionId = randomUUID();
      await insertSession(sessionId, 'test-agent', sessionId);
      await updateSessionRunner(sessionId, 'runner-dead');
      await updateSessionStatus(sessionId, 'active');

      await coordinator.handleDeadRunner('runner-dead');

      // Session should be paused
      const { getSession } = await import('../db/index.js');
      const session = await getSession(sessionId);
      expect(session?.status).toBe('paused');

      // Runner should be removed from DB
      const info = await coordinator.getRunnerInfoFromDb();
      expect(info).toHaveLength(0);
    });

    it('does not re-pause already paused sessions', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-dead',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      const sessionId = randomUUID();
      await insertSession(sessionId, 'test-agent', sessionId);
      await updateSessionRunner(sessionId, 'runner-dead');
      await updateSessionStatus(sessionId, 'paused');

      // Should not throw
      await coordinator.handleDeadRunner('runner-dead');

      const { getSession } = await import('../db/index.js');
      const session = await getSession(sessionId);
      expect(session?.status).toBe('paused');
    });
  });

  describe('getRunnerInfoFromDb', () => {
    it('returns all runners visible to any coordinator', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-1',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      await coordinator.registerRunner({
        runnerId: 'runner-2',
        host: 'host-2',
        port: 4201,
        maxSandboxes: 100,
      });

      // A second coordinator can see both runners (same DB)
      const coordinator2 = new RunnerCoordinator({});
      const info = await coordinator2.getRunnerInfoFromDb();
      expect(info).toHaveLength(2);

      const runnerIds = info.map((r) => r.runnerId).sort();
      expect(runnerIds).toEqual(['runner-1', 'runner-2']);
    });
  });

  describe('deregisterRunner', () => {
    it('immediately pauses sessions and removes runner from DB', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-shutting-down',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      // Create two sessions: one active, one ended
      const activeId = randomUUID();
      const endedId = randomUUID();
      await insertSession(activeId, 'test-agent', activeId);
      await updateSessionRunner(activeId, 'runner-shutting-down');
      await updateSessionStatus(activeId, 'active');

      await insertSession(endedId, 'test-agent', endedId);
      await updateSessionRunner(endedId, 'runner-shutting-down');
      await updateSessionStatus(endedId, 'ended');

      await coordinator.deregisterRunner('runner-shutting-down');

      const { getSession } = await import('../db/index.js');
      // Active session should be paused
      const active = await getSession(activeId);
      expect(active?.status).toBe('paused');

      // Ended session should remain ended (not re-paused)
      const ended = await getSession(endedId);
      expect(ended?.status).toBe('ended');

      // Runner should be gone
      const info = await coordinator.getRunnerInfoFromDb();
      expect(info).toHaveLength(0);
    });
  });

  describe('bulkPauseSessionsByRunner', () => {
    it('pauses multiple active sessions in a single operation', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-bulk',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      // Create 5 sessions: 3 active, 1 paused, 1 ended
      const ids = Array.from({ length: 5 }, () => randomUUID());
      for (const id of ids) {
        await insertSession(id, 'test-agent', id);
        await updateSessionRunner(id, 'runner-bulk');
      }
      await updateSessionStatus(ids[0], 'active');
      await updateSessionStatus(ids[1], 'active');
      await updateSessionStatus(ids[2], 'active');
      await updateSessionStatus(ids[3], 'paused');
      await updateSessionStatus(ids[4], 'ended');

      await coordinator.handleDeadRunner('runner-bulk');

      const { getSession } = await import('../db/index.js');
      // All 3 active sessions should be paused
      for (const id of ids.slice(0, 3)) {
        const session = await getSession(id);
        expect(session?.status).toBe('paused');
      }
      // Already paused stays paused
      expect((await getSession(ids[3]))?.status).toBe('paused');
      // Ended stays ended
      expect((await getSession(ids[4]))?.status).toBe('ended');
    });
  });

  describe('multi-coordinator consistency', () => {
    it('second coordinator can select runner registered by first', async () => {
      // First coordinator registers a runner
      await coordinator.registerRunner({
        runnerId: 'runner-shared',
        host: 'shared-host',
        port: 4200,
        maxSandboxes: 100,
      });

      // Second coordinator should be able to select it
      const coordinator2 = new RunnerCoordinator({});
      const result = await coordinator2.selectBackend();
      expect(result.runnerId).toBe('runner-shared');
    });

    it('dead runner handling is idempotent across coordinators', async () => {
      await coordinator.registerRunner({
        runnerId: 'runner-dying',
        host: 'host-1',
        port: 4200,
        maxSandboxes: 50,
      });

      const sessionId = randomUUID();
      await insertSession(sessionId, 'test-agent', sessionId);
      await updateSessionRunner(sessionId, 'runner-dying');
      await updateSessionStatus(sessionId, 'active');

      const coordinator2 = new RunnerCoordinator({});

      // Both coordinators handle the dead runner — should be idempotent
      await coordinator.handleDeadRunner('runner-dying');
      await coordinator2.handleDeadRunner('runner-dying');

      const { getSession } = await import('../db/index.js');
      const session = await getSession(sessionId);
      expect(session?.status).toBe('paused');
    });
  });
});
