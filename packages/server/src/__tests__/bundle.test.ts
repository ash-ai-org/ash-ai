import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createBundle, extractBundle } from '@ash-ai/sandbox';

describe('workspace bundles', () => {
  const dirs: string[] = [];

  function tmpDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'ash-bundle-'));
    dirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('round-trip: createBundle → extractBundle preserves files', () => {
    const src = tmpDir();
    writeFileSync(join(src, 'hello.txt'), 'world');
    mkdirSync(join(src, 'sub'));
    writeFileSync(join(src, 'sub', 'nested.txt'), 'deep');

    const bundle = createBundle(src);
    expect(bundle.length).toBeGreaterThan(0);

    const dest = tmpDir();
    extractBundle(bundle, dest);

    expect(readFileSync(join(dest, 'hello.txt'), 'utf-8')).toBe('world');
    expect(readFileSync(join(dest, 'sub', 'nested.txt'), 'utf-8')).toBe('deep');
  });

  it('createBundle excludes node_modules', () => {
    const src = tmpDir();
    writeFileSync(join(src, 'index.js'), 'console.log("hi")');
    mkdirSync(join(src, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(src, 'node_modules', 'dep', 'index.js'), 'big module');

    const bundle = createBundle(src);
    const dest = tmpDir();
    extractBundle(bundle, dest);

    expect(readFileSync(join(dest, 'index.js'), 'utf-8')).toBe('console.log("hi")');
    // node_modules should be excluded
    expect(existsSync(join(dest, 'node_modules'))).toBe(false);
  });

  it('throws for nonexistent workspace', () => {
    expect(() => createBundle('/nonexistent/path')).toThrow('does not exist');
  });

  it('extractBundle creates target dir if needed', () => {
    const src = tmpDir();
    writeFileSync(join(src, 'file.txt'), 'data');
    const bundle = createBundle(src);

    const dest = join(tmpDir(), 'new', 'nested', 'dir');
    extractBundle(bundle, dest);
    expect(readFileSync(join(dest, 'file.txt'), 'utf-8')).toBe('data');
  });
});
