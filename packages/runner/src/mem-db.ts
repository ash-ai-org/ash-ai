import type { SandboxState, SandboxRecord } from '@ash-ai/shared';
import type { SandboxDb } from '@ash-ai/sandbox';

/**
 * Lightweight in-memory implementation of SandboxDb for the runner process.
 * The runner doesn't persist sandbox state across restarts — the coordinator
 * handles that. This is just for pool tracking during the runner's lifetime.
 */
export class InMemorySandboxDb implements SandboxDb {
  private sandboxes = new Map<string, SandboxRecord>();

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string): Promise<void> {
    const now = new Date().toISOString();
    this.sandboxes.set(id, {
      id,
      sessionId: sessionId ?? null,
      agentName,
      state: 'warming',
      workspaceDir,
      createdAt: now,
      lastUsedAt: now,
    });
  }

  async updateSandboxState(id: string, state: SandboxState): Promise<void> {
    const record = this.sandboxes.get(id);
    if (record) record.state = state;
  }

  async updateSandboxSession(id: string, sessionId: string | null): Promise<void> {
    const record = this.sandboxes.get(id);
    if (record) record.sessionId = sessionId;
  }

  async touchSandbox(id: string): Promise<void> {
    const record = this.sandboxes.get(id);
    if (record) record.lastUsedAt = new Date().toISOString();
  }

  async getSandbox(id: string): Promise<SandboxRecord | null> {
    return this.sandboxes.get(id) ?? null;
  }

  async countSandboxes(): Promise<number> {
    return this.sandboxes.size;
  }

  async getBestEvictionCandidate(): Promise<SandboxRecord | null> {
    const statePriority: Record<string, number> = { cold: 0, warm: 1, waiting: 2 };
    let best: SandboxRecord | null = null;
    let bestPriority = Infinity;

    for (const record of this.sandboxes.values()) {
      const priority = statePriority[record.state];
      if (priority === undefined) continue; // running — not evictable
      if (priority < bestPriority || (priority === bestPriority && best && record.lastUsedAt < best.lastUsedAt)) {
        best = record;
        bestPriority = priority;
      }
    }

    return best;
  }

  async getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]> {
    const result: SandboxRecord[] = [];
    for (const record of this.sandboxes.values()) {
      if (record.state === 'waiting' && record.lastUsedAt < olderThan) {
        result.push(record);
      }
    }
    return result.sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt));
  }

  async deleteSandbox(id: string): Promise<void> {
    this.sandboxes.delete(id);
  }

  async markAllSandboxesCold(): Promise<number> {
    let count = 0;
    for (const record of this.sandboxes.values()) {
      if (record.state !== 'cold') {
        record.state = 'cold';
        count++;
      }
    }
    return count;
  }
}
