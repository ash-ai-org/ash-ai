import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  persistSessionState,
  restoreSessionState,
  hasPersistedState,
  deleteSessionState,
  getStateMetadata,
} from '@ash-ai/sandbox';

describe('state-persistence', () => {
  let dataDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'ash-test-state-'));
    workspaceDir = mkdtempSync(join(tmpdir(), 'ash-test-workspace-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function populateWorkspace(dir: string): void {
    // .claude session state
    mkdirSync(join(dir, '.claude', 'projects', 'abc123'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'projects', 'abc123', 'session.jsonl'), 'session-data');
    // Agent files
    writeFileSync(join(dir, 'CLAUDE.md'), '# My Agent');
    // Files created by the agent during session
    mkdirSync(join(dir, 'output'), { recursive: true });
    writeFileSync(join(dir, 'output', 'result.json'), '{"answer": 42}');
  }

  it('persists and restores entire workspace roundtrip', () => {
    populateWorkspace(workspaceDir);

    const persisted = persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');
    expect(persisted).toBe(true);
    expect(hasPersistedState(dataDir, 'sess-1')).toBe(true);

    // Wipe workspace entirely and restore
    rmSync(workspaceDir, { recursive: true });
    expect(existsSync(workspaceDir)).toBe(false);

    const restored = restoreSessionState(dataDir, 'sess-1', workspaceDir);
    expect(restored).toBe(true);

    // Verify all files restored
    expect(readFileSync(join(workspaceDir, '.claude', 'projects', 'abc123', 'session.jsonl'), 'utf-8')).toBe('session-data');
    expect(readFileSync(join(workspaceDir, 'CLAUDE.md'), 'utf-8')).toBe('# My Agent');
    expect(readFileSync(join(workspaceDir, 'output', 'result.json'), 'utf-8')).toBe('{"answer": 42}');
  });

  it('returns false when no persisted state exists', () => {
    expect(hasPersistedState(dataDir, 'nonexistent')).toBe(false);
    expect(restoreSessionState(dataDir, 'nonexistent', workspaceDir)).toBe(false);
  });

  it('returns false when workspace does not exist', () => {
    rmSync(workspaceDir, { recursive: true });
    const result = persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');
    expect(result).toBe(false);
    expect(hasPersistedState(dataDir, 'sess-1')).toBe(false);
  });

  it('overwrites previous state on re-persist', () => {
    populateWorkspace(workspaceDir);
    persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');

    // Update a file and add a new one, then re-persist
    writeFileSync(join(workspaceDir, 'output', 'result.json'), '{"answer": 99}');
    writeFileSync(join(workspaceDir, 'new-file.txt'), 'hello');
    persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');

    // Restore and verify updated content
    rmSync(workspaceDir, { recursive: true });
    restoreSessionState(dataDir, 'sess-1', workspaceDir);

    expect(readFileSync(join(workspaceDir, 'output', 'result.json'), 'utf-8')).toBe('{"answer": 99}');
    expect(readFileSync(join(workspaceDir, 'new-file.txt'), 'utf-8')).toBe('hello');
  });

  it('deletes persisted state', () => {
    populateWorkspace(workspaceDir);
    persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');
    expect(hasPersistedState(dataDir, 'sess-1')).toBe(true);

    deleteSessionState(dataDir, 'sess-1');
    expect(hasPersistedState(dataDir, 'sess-1')).toBe(false);
  });

  it('writes and reads metadata', () => {
    populateWorkspace(workspaceDir);
    persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');

    const meta = getStateMetadata(dataDir, 'sess-1');
    expect(meta).not.toBeNull();
    expect(meta!.sessionId).toBe('sess-1');
    expect(meta!.agentName).toBe('my-agent');
    expect(meta!.persistedAt).toBeTruthy();
  });

  it('returns null metadata for nonexistent session', () => {
    expect(getStateMetadata(dataDir, 'ghost')).toBeNull();
  });

  it('delete is idempotent for nonexistent state', () => {
    // Should not throw
    deleteSessionState(dataDir, 'nonexistent');
  });

  it('skips node_modules, .git, and other filtered dirs during persist', () => {
    populateWorkspace(workspaceDir);

    // Add dirs/files that should be filtered out
    mkdirSync(join(workspaceDir, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(join(workspaceDir, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');
    mkdirSync(join(workspaceDir, '.git', 'objects'), { recursive: true });
    writeFileSync(join(workspaceDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    mkdirSync(join(workspaceDir, '__pycache__'), { recursive: true });
    writeFileSync(join(workspaceDir, '__pycache__', 'mod.pyc'), 'bytecode');
    writeFileSync(join(workspaceDir, 'bridge.sock'), 'socket');
    writeFileSync(join(workspaceDir, 'app.pid'), '12345');

    persistSessionState(dataDir, 'sess-1', workspaceDir, 'my-agent');

    // Restore into a fresh dir
    const restoreDir = mkdtempSync(join(tmpdir(), 'ash-test-restore-'));
    restoreSessionState(dataDir, 'sess-1', restoreDir);

    // Agent files and .claude state should be there
    expect(existsSync(join(restoreDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(restoreDir, '.claude'))).toBe(true);
    expect(existsSync(join(restoreDir, 'output', 'result.json'))).toBe(true);

    // Filtered dirs/files should NOT be there
    expect(existsSync(join(restoreDir, 'node_modules'))).toBe(false);
    expect(existsSync(join(restoreDir, '.git'))).toBe(false);
    expect(existsSync(join(restoreDir, '__pycache__'))).toBe(false);
    expect(existsSync(join(restoreDir, 'bridge.sock'))).toBe(false);
    expect(existsSync(join(restoreDir, 'app.pid'))).toBe(false);

    rmSync(restoreDir, { recursive: true, force: true });
  });
});
