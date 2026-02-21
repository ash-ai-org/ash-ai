import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const SKIP_DIRS = ['node_modules', '.git', '__pycache__', '.cache', '.npm', '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp'];
const TAR_EXCLUDE = SKIP_DIRS.map(d => `--exclude=${d}`).join(' ');

/**
 * Create a compressed tar.gz bundle from a workspace directory.
 * Excludes node_modules, .git, and other reproducible/ephemeral dirs.
 * Returns the bundle as a Buffer.
 */
export function createBundle(workspaceDir: string): Buffer {
  if (!existsSync(workspaceDir)) {
    throw new Error(`Workspace directory does not exist: ${workspaceDir}`);
  }

  const tmpPath = join(tmpdir(), `ash-bundle-${randomUUID()}.tar.gz`);
  try {
    execSync(
      `tar czf ${JSON.stringify(tmpPath)} ${TAR_EXCLUDE} -C ${JSON.stringify(workspaceDir)} .`,
      { stdio: 'pipe', timeout: 120_000 },
    );
    return readFileSync(tmpPath);
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

/**
 * Extract a compressed tar.gz bundle into a target directory.
 * Creates the target directory if it doesn't exist.
 */
export function extractBundle(bundle: Buffer, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });

  const tmpPath = join(tmpdir(), `ash-bundle-${randomUUID()}.tar.gz`);
  try {
    writeFileSync(tmpPath, bundle);
    execSync(
      `tar xzf ${JSON.stringify(tmpPath)} -C ${JSON.stringify(targetDir)}`,
      { stdio: 'pipe', timeout: 120_000 },
    );
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
