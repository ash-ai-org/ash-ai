import { describe, it, expect } from 'vitest';
import { SANDBOX_ENV_ALLOWLIST } from '@ash-ai/shared';

/**
 * Security invariant: sandbox processes must NOT receive host secrets.
 * The allowlist is the enforcement mechanism — test that it doesn't
 * contain dangerous keys, and that the manager respects it.
 */
describe('sandbox environment isolation', () => {
  const DANGEROUS_KEYS = [
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SESSION_TOKEN',
    'SSH_AUTH_SOCK',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'NPM_TOKEN',
    'DATABASE_URL',
    'PGPASSWORD',
    'REDIS_URL',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'DOCKER_HOST',
  ];

  it('allowlist does not contain any dangerous keys', () => {
    for (const key of DANGEROUS_KEYS) {
      expect(
        SANDBOX_ENV_ALLOWLIST,
        `SANDBOX_ENV_ALLOWLIST must not contain ${key}`,
      ).not.toContain(key);
    }
  });

  it('allowlist contains only expected keys', () => {
    // If someone adds a key, this test forces them to think about it
    const expected = new Set([
      'PATH', 'NODE_PATH', 'HOME', 'LANG', 'TERM',
      'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS',
      'ASH_DEBUG_TIMING', 'ASH_REAL_SDK', 'ASH_PERMISSION_MODE',
      'CLAUDE_CODE_EXECUTABLE',
    ]);
    const actual = new Set(SANDBOX_ENV_ALLOWLIST);
    expect(actual).toEqual(expected);
  });

  it('ANTHROPIC_API_KEY is the only secret in the allowlist', () => {
    const secrets = SANDBOX_ENV_ALLOWLIST.filter((k) =>
      k.includes('KEY') || k.includes('TOKEN') || k.includes('SECRET') || k.includes('PASSWORD'),
    );
    expect(secrets).toEqual(['ANTHROPIC_API_KEY']);
  });
});
