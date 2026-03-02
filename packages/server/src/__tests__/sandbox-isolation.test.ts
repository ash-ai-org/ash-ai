import { describe, it, expect, afterEach } from 'vitest';
import { buildBwrapArgs, generateOciSpec, hasBwrap } from '@ash-ai/sandbox';
import type { SandboxSpawnOpts } from '@ash-ai/sandbox';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Security invariant: sandboxed processes must NOT be able to see other
 * tenants' agents, sessions, or sandbox metadata. The data directory
 * (parent of sandboxesDir) must be hidden with a tmpfs overlay, with
 * only the current sandbox's own directory restored via bind mount.
 */

function makeSandboxOpts(dataDir: string, sandboxId = 'test-sandbox-1'): SandboxSpawnOpts {
  const sandboxesDir = join(dataDir, 'sandboxes');
  const sandboxDir = join(sandboxesDir, sandboxId);
  const workspaceDir = join(sandboxDir, 'workspace');
  return {
    sandboxId,
    workspaceDir,
    agentDir: join(dataDir, 'agents', 'test-agent'),
    sandboxDir,
    sandboxesDir,
  };
}

describe('sandbox filesystem isolation', () => {
  // ---------------------------------------------------------------------------
  // Unit tests — verify mount args/spec hide the entire data directory
  // ---------------------------------------------------------------------------

  describe('buildBwrapArgs', () => {
    it('hides the entire data directory, not just sandboxesDir', () => {
      const opts = makeSandboxOpts('/data');
      const args = buildBwrapArgs(opts);

      // Should contain --tmpfs /data (the parent of sandboxesDir)
      const tmpfsIndex = args.indexOf('--tmpfs');
      const tmpfsMounts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--tmpfs') tmpfsMounts.push(args[i + 1]);
      }

      expect(tmpfsMounts).toContain('/data');
      // Should NOT have a separate --tmpfs for just /data/sandboxes
      // (the parent tmpfs at /data already covers it)
      expect(tmpfsMounts).not.toContain('/data/sandboxes');
    });

    it('restores only the current sandbox directory', () => {
      const opts = makeSandboxOpts('/data', 'abc-123');
      const args = buildBwrapArgs(opts);

      // Should have --bind for this sandbox's dir
      const bindMounts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--bind') bindMounts.push(args[i + 1]);
      }

      expect(bindMounts).toContain('/data/sandboxes/abc-123');
    });

    it('creates sandboxes parent dir on tmpfs before bind mount', () => {
      const opts = makeSandboxOpts('/data', 'abc-123');
      const args = buildBwrapArgs(opts);

      // --dir /data/sandboxes must appear between --tmpfs /data and --bind
      const tmpfsIdx = args.findIndex((a, i) => a === '--tmpfs' && args[i + 1] === '/data');
      const dirIdx = args.findIndex((a, i) => a === '--dir' && args[i + 1] === '/data/sandboxes');
      const bindIdx = args.findIndex((a, i) => a === '--bind' && args[i + 1] === '/data/sandboxes/abc-123');

      expect(dirIdx).toBeGreaterThan(tmpfsIdx);
      expect(dirIdx).toBeLessThan(bindIdx);
    });

    it('does not expose agents or sessions directories', () => {
      const opts = makeSandboxOpts('/data');
      const args = buildBwrapArgs(opts);

      // No bind mount for agents/ or sessions/
      const bindMounts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--bind' || args[i] === '--ro-bind') {
          const target = args[i + 1];
          // Skip the root bind (/ → /) which is overridden by tmpfs
          if (target !== '/') bindMounts.push(target);
        }
      }

      for (const mount of bindMounts) {
        expect(mount).not.toContain('/data/agents');
        expect(mount).not.toContain('/data/sessions');
      }
    });

    it('works with non-standard data directory paths', () => {
      const opts = makeSandboxOpts('/var/ash/data');
      const args = buildBwrapArgs(opts);

      const tmpfsMounts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--tmpfs') tmpfsMounts.push(args[i + 1]);
      }

      expect(tmpfsMounts).toContain('/var/ash/data');
    });
  });

  describe('generateOciSpec', () => {
    it('hides the entire data directory, not just sandboxesDir', () => {
      const opts = makeSandboxOpts('/data');
      const spec = generateOciSpec(opts, 'node', ['bridge.js'], { PATH: '/usr/bin' });

      const tmpfsMounts = spec.mounts
        .filter((m) => m.type === 'tmpfs')
        .map((m) => m.destination);

      expect(tmpfsMounts).toContain('/data');
      expect(tmpfsMounts).not.toContain('/data/sandboxes');
    });

    it('restores only the current sandbox directory', () => {
      const opts = makeSandboxOpts('/data', 'abc-123');
      const spec = generateOciSpec(opts, 'node', ['bridge.js'], { PATH: '/usr/bin' });

      const bindMounts = spec.mounts
        .filter((m) => m.type === 'bind')
        .map((m) => m.destination);

      expect(bindMounts).toContain('/data/sandboxes/abc-123');
    });

    it('does not expose agents or sessions directories', () => {
      const opts = makeSandboxOpts('/data');
      const spec = generateOciSpec(opts, 'node', ['bridge.js'], { PATH: '/usr/bin' });

      const bindMounts = spec.mounts
        .filter((m) => m.type === 'bind')
        .map((m) => m.destination);

      for (const mount of bindMounts) {
        expect(mount).not.toContain('/data/agents');
        expect(mount).not.toContain('/data/sessions');
      }
    });

    it('mount order: tmpfs for data dir comes before bind for sandbox dir', () => {
      const opts = makeSandboxOpts('/data', 'sandbox-1');
      const spec = generateOciSpec(opts, 'node', ['bridge.js'], { PATH: '/usr/bin' });

      const dataTmpfsIdx = spec.mounts.findIndex(
        (m) => m.type === 'tmpfs' && m.destination === '/data',
      );
      const sandboxBindIdx = spec.mounts.findIndex(
        (m) => m.type === 'bind' && m.destination === '/data/sandboxes/sandbox-1',
      );

      expect(dataTmpfsIdx).toBeGreaterThan(-1);
      expect(sandboxBindIdx).toBeGreaterThan(-1);
      // tmpfs must come before bind so the bind overrides it for the specific path
      expect(dataTmpfsIdx).toBeLessThan(sandboxBindIdx);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration test — actually runs bwrap (Linux only)
  // ---------------------------------------------------------------------------

  if (process.platform === 'linux' && hasBwrap()) {
    describe('bwrap integration', () => {
      let dataDir: string;

      afterEach(() => {
        if (dataDir) rmSync(dataDir, { recursive: true, force: true });
      });

      it('sandbox cannot see agents/, sessions/, or other sandboxes', () => {
        // Set up a fake data directory with sensitive content
        dataDir = mkdtempSync(join(tmpdir(), 'ash-isolation-test-'));
        const agentsDir = join(dataDir, 'agents');
        const sessionsDir = join(dataDir, 'sessions');
        const sandboxesDir = join(dataDir, 'sandboxes');
        const sandboxDir = join(sandboxesDir, 'my-sandbox');
        const otherSandboxDir = join(sandboxesDir, 'other-sandbox');
        const workspaceDir = join(sandboxDir, 'workspace');

        // Create directories and sentinel files
        mkdirSync(join(agentsDir, 'secret-agent'), { recursive: true });
        writeFileSync(join(agentsDir, 'secret-agent', 'CLAUDE.md'), 'secret agent config');
        mkdirSync(join(sessionsDir, 'session-abc'), { recursive: true });
        writeFileSync(join(sessionsDir, 'session-abc', 'meta.json'), '{"tenant":"other"}');
        mkdirSync(otherSandboxDir, { recursive: true });
        writeFileSync(join(otherSandboxDir, 'bridge.sock'), 'other sandbox socket');
        mkdirSync(workspaceDir, { recursive: true });
        writeFileSync(join(workspaceDir, 'hello.txt'), 'my workspace file');

        const opts = makeSandboxOpts(dataDir, 'my-sandbox');
        const args = buildBwrapArgs(opts);

        // Run a probe inside bwrap that checks what's visible
        const probe = [
          // Check: own workspace file should be readable
          `test -f ${workspaceDir}/hello.txt && echo "OWN_WORKSPACE=visible" || echo "OWN_WORKSPACE=hidden"`,
          // Check: agents dir should be hidden
          `test -d ${agentsDir} && echo "AGENTS=visible" || echo "AGENTS=hidden"`,
          // Check: sessions dir should be hidden
          `test -d ${sessionsDir} && echo "SESSIONS=visible" || echo "SESSIONS=hidden"`,
          // Check: other sandbox should be hidden
          `test -d ${otherSandboxDir} && echo "OTHER_SANDBOX=visible" || echo "OTHER_SANDBOX=hidden"`,
          // Check: parent data dir should appear empty (just the tmpfs)
          `ls ${dataDir} 2>/dev/null | wc -l | xargs -I{} echo "DATA_DIR_ENTRIES={}"`,
        ].join(' ; ');

        const result = execSync(
          `bwrap ${args.map((a) => `'${a}'`).join(' ')} -- /bin/sh -c '${probe}'`,
          { timeout: 10_000 },
        ).toString();

        expect(result).toContain('OWN_WORKSPACE=visible');
        expect(result).toContain('AGENTS=hidden');
        expect(result).toContain('SESSIONS=hidden');
        expect(result).toContain('OTHER_SANDBOX=hidden');
        // Data dir should be empty (tmpfs) except for the sandboxes/my-sandbox bind mount
        // The bind mount creates the intermediate sandboxes/ dir, so we may see 1 entry
        expect(result).toMatch(/DATA_DIR_ENTRIES=[01]/);
      });
    });
  }
});
