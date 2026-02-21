# Plan 06: Credential Management

## Status: Done
## Priority: High
## Effort: Medium

## Problem

ash-ai has a `CredentialManager` that encrypts and stores per-user API keys (Anthropic, OpenAI, custom). The cloud layer uses this so users can bring their own API keys. Ash currently only supports a single `ANTHROPIC_API_KEY` env var or a global `ASH_API_KEY`.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/credentials/` — `CredentialManager` class, `EncryptedCredential` type, `MemoryCredentialStorage`
- `apps/web/src/lib/services/agent-execution.ts` — passes `credentialId` during session creation, decrypts and injects into sandbox env
- `harness/packages/ash-ai/src/types/index.ts` — `CreateSessionOptions.credentialId`

## Current ash-ai Behavior

```typescript
class CredentialManager {
  async storeCredential(ownerId, type, plainKey, label?): Promise<string>
  async getDecryptedKey(credentialId): Promise<string | null>
  async listCredentials(ownerId): Promise<EncryptedCredential[]>
  async deleteCredential(credentialId): Promise<void>
}
```

Credentials are encrypted at rest (AES-GCM with per-credential IV). The cloud passes a `credentialId` when creating sessions, and the harness decrypts and injects the key into the sandbox env.

## Approach

### Add credential storage to Ash server

1. **New `credentials` table**:
   ```sql
   CREATE TABLE credentials (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     owner_id TEXT NOT NULL,
     type TEXT NOT NULL,          -- 'anthropic' | 'openai' | 'custom'
     encrypted_key TEXT NOT NULL,
     iv TEXT NOT NULL,
     auth_tag TEXT NOT NULL,
     label TEXT DEFAULT '',
     active INTEGER DEFAULT 1,
     created_at TEXT NOT NULL,
     last_used_at TEXT
   );
   ```

2. **Encryption module** in `@ash-ai/server`:
   ```typescript
   function encrypt(plaintext: string, masterKey: string): { encrypted: string; iv: string; authTag: string }
   function decrypt(encrypted: string, iv: string, authTag: string, masterKey: string): string
   ```
   Master key from env: `ASH_CREDENTIAL_KEY`

3. **API endpoints**:
   - `POST /api/credentials` — store new credential
   - `GET /api/credentials` — list (no plaintext returned)
   - `DELETE /api/credentials/:id` — remove
   - No GET-by-id endpoint that returns plaintext (security)

4. **Session creation integration**:
   - `CreateSessionRequest` gains optional `credentialId` field
   - Server decrypts credential and passes as env var to sandbox bridge

5. **Add to SDK client**:
   ```typescript
   async storeCredential(type, key, label?): Promise<Credential>
   async listCredentials(): Promise<Credential[]>
   async deleteCredential(id): Promise<void>
   async createSession(agent, opts?: { credentialId?: string }): Promise<Session>
   ```

## Implementation Steps

1. Add credentials table + Db methods
2. Implement encrypt/decrypt module
3. Add API routes
4. Integrate into session creation (inject decrypted key into sandbox env)
5. Update SDK client
6. Add tests (encryption round-trip, API CRUD)

## Security Considerations

- Master key must be provided via env var, never stored in DB
- Never log or return plaintext keys in API responses
- Credential access scoped by `tenantId` + `ownerId`
- Consider key rotation support (re-encrypt all credentials with new master key)

## Open Questions

- Should we support key rotation from day one?
- Should credentials be scoped to tenant only, or tenant + owner?
- Do we need credential types beyond API keys (e.g. OAuth tokens)?
