import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../crypto.js';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';

describe('credential encryption', () => {
  const masterKey = 'test-master-key-for-unit-tests';

  it('round-trips a plaintext key', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag, salt } = encrypt(plain, masterKey);
    expect(salt).toBeDefined();
    const decrypted = decrypt(encrypted, iv, authTag, masterKey, salt);
    expect(decrypted).toBe(plain);
  });

  it('produces different ciphertext for same plaintext (unique IV and salt)', () => {
    const plain = 'sk-ant-abc123xyz';
    const a = encrypt(plain, masterKey);
    const b = encrypt(plain, masterKey);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('fails to decrypt with wrong master key', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag, salt } = encrypt(plain, masterKey);
    expect(() => decrypt(encrypted, iv, authTag, 'wrong-key', salt)).toThrow();
  });

  it('fails to decrypt with tampered authTag', () => {
    const plain = 'sk-ant-abc123xyz';
    const { encrypted, iv, authTag, salt } = encrypt(plain, masterKey);
    const buf = Buffer.from(authTag, 'base64');
    buf[0] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(encrypted, iv, tampered, masterKey, salt)).toThrow();
  });

  it('handles empty string', () => {
    const plain = '';
    const { encrypted, iv, authTag, salt } = encrypt(plain, masterKey);
    const decrypted = decrypt(encrypted, iv, authTag, masterKey, salt);
    expect(decrypted).toBe('');
  });

  it('handles long keys', () => {
    const plain = 'sk-' + 'a'.repeat(1000);
    const { encrypted, iv, authTag, salt } = encrypt(plain, masterKey);
    const decrypted = decrypt(encrypted, iv, authTag, masterKey, salt);
    expect(decrypted).toBe(plain);
  });

  it('decrypts legacy credentials (no salt, SHA-256 derived key)', () => {
    // Simulate legacy encryption: unsalted SHA-256 key derivation
    const plain = 'sk-ant-legacy-key';
    const legacyKey = createHash('sha256').update(masterKey).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
    let encrypted = cipher.update(plain, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Decrypt with salt=null triggers legacy path
    const decrypted = decrypt(
      encrypted,
      iv.toString('base64'),
      authTag.toString('base64'),
      masterKey,
      null,
    );
    expect(decrypted).toBe(plain);
  });

  it('decrypt with salt=undefined also triggers legacy path', () => {
    const plain = 'sk-ant-legacy-key-2';
    const legacyKey = createHash('sha256').update(masterKey).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
    let encrypted = cipher.update(plain, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Omit salt entirely
    const decrypted = decrypt(
      encrypted,
      iv.toString('base64'),
      authTag.toString('base64'),
      masterKey,
    );
    expect(decrypted).toBe(plain);
  });
});
