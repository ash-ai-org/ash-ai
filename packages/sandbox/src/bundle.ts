import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, basename, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const SKIP_DIRS = ['node_modules', '.git', '__pycache__', '.cache', '.npm', '.pnpm-store', '.yarn', '.venv', 'venv', '.tmp', 'tmp'];
const SKIP_FILES = ['.env', '.env.local', '.env.production', '.env.development', '.DS_Store'];
const TAR_EXCLUDE = [
  ...SKIP_DIRS.map(d => `--exclude=${d}`),
  ...SKIP_FILES.map(f => `--exclude=${f}`),
].join(' ');

/** Maximum bundle size (100 MB). */
const MAX_BUNDLE_SIZE = 100 * 1024 * 1024;

/**
 * Create a compressed tar.gz bundle from a workspace directory.
 * Excludes node_modules, .git, .env, and other reproducible/ephemeral dirs.
 * Dereferences symlinks (-h) to prevent symlink attacks.
 * Returns the bundle as a Buffer.
 */
export function createBundle(workspaceDir: string): Buffer {
  if (!existsSync(workspaceDir)) {
    throw new Error(`Workspace directory does not exist: ${workspaceDir}`);
  }

  const tmpPath = join(tmpdir(), `ash-bundle-${randomUUID()}.tar.gz`);
  try {
    execSync(
      `tar czf ${JSON.stringify(tmpPath)} -h ${TAR_EXCLUDE} -C ${JSON.stringify(workspaceDir)} .`,
      { stdio: 'pipe', timeout: 120_000 },
    );
    const bundle = readFileSync(tmpPath);
    if (bundle.length > MAX_BUNDLE_SIZE) {
      throw new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_SIZE} bytes`);
    }
    return bundle;
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

/**
 * Validate that all entries in the extracted directory are inside the target.
 * Protects against path traversal (../), absolute paths, and symlink escapes.
 * Uses path.relative() for comparison to avoid symlink resolution inconsistencies.
 */
function validateExtractedPaths(targetDir: string): void {
  const canonicalTarget = realpathSync(targetDir);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const stat = lstatSync(fullPath);
      // Check for symlinks that point outside targetDir
      if (stat.isSymbolicLink()) {
        const real = realpathSync(fullPath);
        const rel = relative(canonicalTarget, real);
        if (rel.startsWith('..') || rel.startsWith('/')) {
          unlinkSync(fullPath);
          continue;
        }
      }
      // Verify the resolved canonical path is inside the target
      const canonicalPath = realpathSync(fullPath);
      const rel = relative(canonicalTarget, canonicalPath);
      if (rel.startsWith('..') || rel.startsWith('/')) {
        throw new Error(`Extracted file escapes target directory: ${canonicalPath}`);
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  };
  walk(targetDir);
}

/**
 * Extract a compressed tar.gz bundle into a target directory.
 * Creates the target directory if it doesn't exist.
 * Validates that no extracted files escape the target directory.
 */
export function extractBundle(bundle: Buffer, targetDir: string): void {
  if (bundle.length > MAX_BUNDLE_SIZE) {
    throw new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_SIZE} bytes`);
  }
  // Validate gzip magic bytes
  if (bundle.length < 2 || bundle[0] !== 0x1f || bundle[1] !== 0x8b) {
    throw new Error('Invalid bundle: not a gzip file');
  }

  mkdirSync(targetDir, { recursive: true });

  const tmpPath = join(tmpdir(), `ash-bundle-${randomUUID()}.tar.gz`);
  try {
    writeFileSync(tmpPath, bundle);
    execSync(
      `tar xzf ${JSON.stringify(tmpPath)} --no-same-owner --no-same-permissions -C ${JSON.stringify(targetDir)}`,
      { stdio: 'pipe', timeout: 120_000 },
    );
    // Post-extraction validation: remove symlinks that escape, reject path traversal
    validateExtractedPaths(targetDir);
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
