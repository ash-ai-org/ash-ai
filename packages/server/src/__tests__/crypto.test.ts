import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../crypto.js';

describe('credential encryption', () => {
  const masterKey = 'test-master-key-for-unit-tests';

  it('round-trips a plaintext key', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag } = encrypt(plain, masterKey);
    const decrypted = decrypt(encrypted, iv, authTag, masterKey);
    expect(decrypted).toBe(plain);
  });

  it('produces different ciphertext for same plaintext (unique IV)', () => {
    const plain = 'sk-ant-abc123xyz';
    const a = encrypt(plain, masterKey);
    const b = encrypt(plain, masterKey);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails to decrypt with wrong master key', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag } = encrypt(plain, masterKey);
    expect(() => decrypt(encrypted, iv, authTag, 'wrong-key')).toThrow();
  });

  it('fails to decrypt with tampered authTag', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag } = encrypt(plain, masterKey);
    // Flip bits in the auth tag — guaranteed to fail GCM authentication
    const buf = Buffer.from(authTag, 'base64');
    buf[0] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(encrypted, iv, tampered, masterKey)).toThrow();
  });

  it('handles empty string', () => {
    const plain = '';
    const { encrypted, iv, authTag } = encrypt(plain, masterKey);
    const decrypted = decrypt(encrypted, iv, authTag, masterKey);
    expect(decrypted).toBe('');
  });

  it('handles long keys', () => {
    const plain = 'sk-' + 'a'.repeat(1000);
    const { encrypted, iv, authTag } = encrypt(plain, masterKey);
    const decrypted = decrypt(encrypted, iv, authTag, masterKey);
    expect(decrypted).toBe(plain);
  });
});
