import { join, basename } from 'node:path';
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { getSnapshotStore } from './snapshot-store.js';

const SESSIONS_SUBDIR = 'sessions';
const WORKSPACE_DIR = 'workspace';
const METADATA_FILE = 'metadata.json';

// Directory/file names to skip during workspace persistence.
// These are large, reproducible, or ephemeral — no value in backing up.
const SKIP_NAMES = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.yarn',
  '.venv',
  'venv',
  '.tmp',
  'tmp',
]);

// File extensions to skip (temp files, sockets, lock files from running processes)
const SKIP_EXTENSIONS = new Set([
  '.sock',
  '.lock',
  '.pid',
]);

/**
 * Filter for cpSync — skips large reproducible dirs and ephemeral files.
 */
function copyFilter(src: string): boolean {
  const name = basename(src);
  if (SKIP_NAMES.has(name)) return false;
  for (const ext of SKIP_EXTENSIONS) {
    if (name.endsWith(ext)) return false;
  }
  return true;
}

interface StateMetadata {
  sessionId: string;
  agentName: string;
  persistedAt: string;
}

function sessionStateDir(dataDir: string, sessionId: string): string {
  return join(dataDir, SESSIONS_SUBDIR, sessionId);
}

/**
 * Copy entire workspace to data/sessions/<id>/workspace/.
 * Preserves all files the agent created plus .claude session state.
 * Best-effort: logs errors but does not throw.
 */
export function persistSessionState(
  dataDir: string,
  sessionId: string,
  workspaceDir: string,
  agentName: string,
): boolean {
  try {
    if (!existsSync(workspaceDir)) {
      return false;
    }

    const destDir = sessionStateDir(dataDir, sessionId);
    const destWorkspace = join(destDir, WORKSPACE_DIR);

    // Remove previous backup, then copy fresh (skipping node_modules, .git, etc.)
    rmSync(destWorkspace, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    cpSync(workspaceDir, destWorkspace, { recursive: true, filter: copyFilter });

    const metadata: StateMetadata = {
      sessionId,
      agentName,
      persistedAt: new Date().toISOString(),
    };
    writeFileSync(join(destDir, METADATA_FILE), JSON.stringify(metadata, null, 2));

    return true;
  } catch (err) {
    console.error(`[state-persistence] Failed to persist state for session ${sessionId}:`, err);
    return false;
  }
}

/**
 * Restore entire workspace from data/sessions/<id>/workspace/ into the target directory.
 * Returns true if state was restored, false if no persisted state exists.
 */
export function restoreSessionState(
  dataDir: string,
  sessionId: string,
  workspaceDir: string,
): boolean {
  try {
    const srcDir = sessionStateDir(dataDir, sessionId);
    const srcWorkspace = join(srcDir, WORKSPACE_DIR);

    if (!existsSync(srcWorkspace)) {
      return false;
    }

    mkdirSync(workspaceDir, { recursive: true });
    cpSync(srcWorkspace, workspaceDir, { recursive: true });

    return true;
  } catch (err) {
    console.error(`[state-persistence] Failed to restore state for session ${sessionId}:`, err);
    return false;
  }
}

/**
 * Check if persisted state exists for a session.
 */
export function hasPersistedState(dataDir: string, sessionId: string): boolean {
  const srcWorkspace = join(sessionStateDir(dataDir, sessionId), WORKSPACE_DIR);
  return existsSync(srcWorkspace);
}

/**
 * Delete persisted state for a session.
 */
export function deleteSessionState(dataDir: string, sessionId: string): void {
  const dir = sessionStateDir(dataDir, sessionId);
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Read metadata for a persisted session state.
 */
export function getStateMetadata(dataDir: string, sessionId: string): StateMetadata | null {
  try {
    const metaPath = join(sessionStateDir(dataDir, sessionId), METADATA_FILE);
    if (!existsSync(metaPath)) return null;
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as StateMetadata;
  } catch {
    return null;
  }
}

// --- Cloud-backed persistence ---

/**
 * Tar.gz the local persisted workspace and upload to cloud storage.
 * Returns true on success, false if no store configured or upload fails.
 * Best-effort: logs errors, doesn't throw.
 */
export async function syncStateToCloud(dataDir: string, sessionId: string): Promise<boolean> {
  try {
    const store = await getSnapshotStore();
    if (!store) return false;

    const srcDir = join(sessionStateDir(dataDir, sessionId), WORKSPACE_DIR);
    if (!existsSync(srcDir)) return false;

    const tarPath = join(sessionStateDir(dataDir, sessionId), 'workspace.tar.gz');
    try {
      execSync(`tar czf ${JSON.stringify(tarPath)} -C ${JSON.stringify(srcDir)} .`, {
        stdio: 'pipe',
        timeout: 60_000,
      });
      const uploaded = await store.upload(sessionId, tarPath);
      return uploaded;
    } finally {
      // Clean up tar regardless of upload result
      try { unlinkSync(tarPath); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error(`[state-persistence] Cloud sync failed for ${sessionId}:`, err);
    return false;
  }
}

/**
 * Download workspace tarball from cloud storage and extract into the local persist directory.
 * Returns true if state was restored, false if store not configured or key not found.
 */
export async function restoreStateFromCloud(dataDir: string, sessionId: string): Promise<boolean> {
  try {
    const store = await getSnapshotStore();
    if (!store) return false;

    const stateDir = sessionStateDir(dataDir, sessionId);
    const tarPath = join(stateDir, 'workspace.tar.gz');
    const destDir = join(stateDir, WORKSPACE_DIR);

    mkdirSync(stateDir, { recursive: true });

    const downloaded = await store.download(sessionId, tarPath);
    if (!downloaded) return false;

    try {
      mkdirSync(destDir, { recursive: true });
      execSync(`tar xzf ${JSON.stringify(tarPath)} -C ${JSON.stringify(destDir)}`, {
        stdio: 'pipe',
        timeout: 60_000,
      });
      return true;
    } finally {
      try { unlinkSync(tarPath); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error(`[state-persistence] Cloud restore failed for ${sessionId}:`, err);
    return false;
  }
}

/**
 * Delete cloud snapshot for a session. Best-effort.
 */
export async function deleteCloudState(sessionId: string): Promise<void> {
  try {
    const store = await getSnapshotStore();
    if (!store) return;
    await store.delete(sessionId);
  } catch (err) {
    console.error(`[state-persistence] Cloud delete failed for ${sessionId}:`, err);
  }
}
