import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha256';

/** Derive a 32-byte key using PBKDF2 with a random salt. */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, 32, PBKDF2_DIGEST);
}

/** Legacy key derivation — unsalted SHA-256. Used only for decrypting old credentials. */
function deriveKeyLegacy(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest();
}

export interface EncryptedData {
  encrypted: string; // base64
  iv: string;        // base64
  authTag: string;   // base64
  salt: string;      // base64 — PBKDF2 salt
}

export function encrypt(plaintext: string, masterKey: string): EncryptedData {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * Decrypt credential data. If salt is provided, uses PBKDF2 key derivation.
 * If salt is null/undefined, falls back to legacy SHA-256 derivation for
 * backward compatibility with credentials encrypted before the PBKDF2 migration.
 */
export function decrypt(encrypted: string, iv: string, authTag: string, masterKey: string, salt?: string | null): string {
  const key = salt
    ? deriveKey(masterKey, Buffer.from(salt, 'base64'))
    : deriveKeyLegacy(masterKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
