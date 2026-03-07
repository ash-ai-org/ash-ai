# Security Audit — 2026-03-06

Comprehensive security audit of the Ash repository. Findings organized by severity with actionable fixes.

---

## CRITICAL

### 1. Command injection in gVisor cleanup

**File:** `packages/sandbox/src/gvisor.ts:257`
**Type:** Command Injection

`sandboxId` is interpolated directly into an `execSync()` shell command. Custom IDs are allowed via `opts.id`, so a caller could inject shell commands.

```typescript
// VULNERABLE
execSync(`runsc --root=${RUNSC_ROOT} --ignore-cgroups --host-uds=all delete --force ${sandboxOpts.sandboxId}`, {
  timeout: 5000,
  stdio: 'ignore',
});
```

**Fix:** Replace with `execFileSync` using an arguments array:

```typescript
execFileSync('runsc', [
  '--root', RUNSC_ROOT,
  '--ignore-cgroups',
  '--host-uds=all',
  'delete',
  '--force',
  sandboxOpts.sandboxId,
], { timeout: 5000, stdio: 'ignore' });
```

---

### 2. Command injection in disk monitoring

**File:** `packages/sandbox/src/resource-limits.ts:367`
**Type:** Command Injection

`getDirSizeKb()` uses `execSync` with string interpolation. Paths containing single quotes can break out of the quoting.

```typescript
// VULNERABLE
const output = execSync(`du -sk '${dir}'`, { timeout: 5000 }).toString().trim();
```

**Fix:**

```typescript
const output = execFileSync('du', ['-sk', dir], { timeout: 5000 }).toString().trim();
```

---

### 3. Auto-generated API key printed to stdout

**File:** `packages/server/src/server.ts:166-175`
**Type:** Information Disclosure

Plaintext API key is logged on server startup. Visible in CI logs, container logs, process output.

```typescript
// VULNERABLE
console.log(`  ${plainKey}`);
```

**Fix:** Remove the console output of the key entirely. It's already saved to file with `0o600` permissions — that's sufficient.

---

## HIGH

### 4. Unsafe chown with shell interpolation

**File:** `packages/sandbox/src/manager.ts:184`
**Type:** Command Injection / Privilege Escalation

`execSync` with interpolated UID/GID and path. No range validation on UID/GID.

```typescript
// VULNERABLE
execSync(`chown -R ${sandboxUid}:${sandboxGid ?? sandboxUid} '${sandboxDir}'`);
```

**Fix:**

```typescript
const uid = sandboxUid;
const gid = sandboxGid ?? sandboxUid;
if (!Number.isInteger(uid) || uid < 0 || uid > 65535) throw new Error(`Invalid UID: ${uid}`);
if (!Number.isInteger(gid) || gid < 0 || gid > 65535) throw new Error(`Invalid GID: ${gid}`);
execFileSync('chown', ['-R', `${uid}:${gid}`, sandboxDir]);
```

---

### 5. No validation on custom sandboxId

**File:** `packages/sandbox/src/manager.ts:95`
**Type:** Path Traversal

`opts.id` is used directly in `join(this.sandboxesDir, id)`. Path traversal possible with `../../`.

```typescript
// VULNERABLE
const id = opts.id ?? randomUUID();
const sandboxDir = join(this.sandboxesDir, id);
```

**Fix:**

```typescript
const id = opts.id ?? randomUUID();
if (!/^[a-f0-9-]+$/i.test(id)) {
  throw new Error(`Invalid sandbox ID: ${id}`);
}
const sandboxDir = join(this.sandboxesDir, id);
const resolved = resolve(sandboxDir);
if (!resolved.startsWith(resolve(this.sandboxesDir) + sep)) {
  throw new Error('Sandbox directory escapes sandboxes root');
}
```

---

### 6. JSON deserialization without runtime validation

**File:** `packages/shared/src/protocol.ts:117`
**Type:** Unsafe Deserialization

`decode()` does `JSON.parse(line)` with no schema validation — prototype pollution risk.

```typescript
// VULNERABLE
export function decode(line: string): BridgeCommand | BridgeEvent {
  return JSON.parse(line.trim());
}
```

**Fix:** Add runtime schema validation (zod or manual check) before returning the parsed object. At minimum, validate the `cmd`/`ev` discriminator field and reject unknown shapes.

---

### 7. Unix socket symlink attack on macOS

**File:** `packages/sandbox/src/manager.ts:101-103`
**Type:** Symlink Attack / Socket Hijacking

Socket placed in `/tmp/ash-XXXX.sock` with no explicit permissions. Any local user can connect or pre-create a symlink.

```typescript
// VULNERABLE
const socketPath = process.platform === 'linux'
  ? join(sandboxDir, 'bridge.sock')
  : join(tmpdir(), `ash-${shortId}.sock`);
```

**Fix:** Place socket inside `sandboxDir` on all platforms. After binding, `chmodSync(socketPath, 0o600)`.

---

### 8. Vulnerable dependencies

**Type:** Known CVEs in transitive dependencies

From `pnpm audit` — 20 vulnerabilities total:

| Package | Current | Issue | Fix Version |
|---------|---------|-------|-------------|
| `fastify` | `5.7.4` | Content-Type validation bypass | `>=5.8.1` |
| `rollup` | `4.57.1` | Path traversal (arbitrary file write) | `>=4.59.0` |
| `minimatch` | `3.1.2` | ReDoS | `>=3.1.3` |
| `dompurify` | `3.3.1` | XSS | `>=3.3.2` |
| `fast-xml-parser` | `5.3.6` | Stack overflow | `>=5.3.8` |

**Fix:** Update `fastify` in server/runner. Run `pnpm update` for transitive deps. Run `pnpm audit` to verify.

---

### 9. No rate limiting on any API endpoint

**Type:** Denial of Service

Session creation, message sending, file uploads — all unbounded. An attacker can exhaust server resources.

**Fix:** Register `@fastify/rate-limit`:

```typescript
import rateLimit from '@fastify/rate-limit';
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});
```

Apply stricter limits on expensive endpoints (session creation, file uploads).

---

### 10. No CORS configuration

**File:** `packages/server/src/server.ts`
**Type:** Missing Access Control

Default Fastify allows all origins. Any browser page can call the API.

**Fix:**

```typescript
import cors from '@fastify/cors';
await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
});
```

---

### 11. ASH_INTERNAL_SECRET fallback to open

**Files:** `packages/server/src/routes/api-keys.ts:9`, `packages/server/src/routes/runners.ts:14`
**Type:** Authentication Bypass

When `ASH_INTERNAL_SECRET` is unset, internal endpoints accept all requests.

```typescript
// VULNERABLE
if (!internalSecret) return true;
```

**Fix:** Require the secret in production. Throw at startup if `NODE_ENV === 'production'` and secret is missing. Use `crypto.timingSafeEqual()` for comparison.

---

## MEDIUM

### 12. Process group not killed on sandbox cleanup

**File:** `packages/sandbox/src/manager.ts:389-398`
**Type:** Resource Leak / Process Escape

Only the bridge process is killed. Children spawned by Claude Code (via Bash tool) survive.

```typescript
// VULNERABLE — only kills bridge, not children
sandbox.process.kill('SIGTERM');
```

**Fix:** Kill the entire process group:

```typescript
try {
  process.kill(-sandbox.process.pid, 'SIGTERM');
} catch {
  sandbox.process.kill('SIGTERM');
}
// ... timeout ...
try {
  process.kill(-sandbox.process.pid, 'SIGKILL');
} catch {
  sandbox.process.kill('SIGKILL');
}
```

---

### 13. Incomplete cleanup on bridge connect failure

**File:** `packages/sandbox/src/manager.ts:280-317`
**Type:** Resource Leak

If `client.connect()` fails after the bridge process is spawned, the child process and cgroups are leaked.

**Fix:** Wrap the connect phase in try/catch. On failure, kill the child process and call `resourceCleanup()`.

---

### 14. Path prefix collision in agent file upload

**File:** `packages/server/src/routes/agents.ts:120`
**Type:** Path Traversal

Uses `fileDest.startsWith(resolvedPath)` which is vulnerable to prefix collisions (e.g., `/opt/ash/agents/foo` matches `/opt/ash/agents/foobar/...`).

```typescript
// VULNERABLE
if (!fileDest.startsWith(resolvedPath)) continue;
```

**Fix:**

```typescript
const resolved = resolve(fileDest);
const resolvedBase = resolve(resolvedPath);
if (!resolved.startsWith(resolvedBase + sep)) continue;
```

---

### 15. Tar extraction path traversal risk

**File:** `packages/server/src/routes/workspace.ts:118,125`
**Type:** Path Traversal

`extractBundle()` extracts tar.gz content. Must validate no `../` entries escape the target directory.

**Fix:** Verify the `extractBundle` implementation rejects entries with `..` path components. Add a check that every extracted file resolves inside the target directory.

---

### 16. No bridge buffer size limit

**File:** `packages/bridge/src/index.ts:238-251`
**Type:** Denial of Service (Memory Exhaustion)

`buffer += chunk.toString()` with no cap. A single giant line without a newline exhausts memory.

**Fix:**

```typescript
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
conn.on('data', (chunk) => {
  buffer += chunk.toString();
  if (buffer.length > MAX_BUFFER_SIZE) {
    conn.destroy();
    return;
  }
  // ... rest of parsing
});
```

---

### 17. CLI credentials stored in plaintext

**File:** `packages/cli/src/config.ts`
**Type:** Credential Exposure

API keys saved unencrypted in `~/.ash/credentials.json`.

**Fix:** Use system keychain (macOS Keychain, Linux Secret Service). At minimum, set file permissions to `0o600` when writing.

---

### 18. GitHub Actions not pinned to SHAs

**Files:** `.github/workflows/*.yml`
**Type:** Supply Chain Attack

Actions use version tags (`@v4`) instead of commit SHAs. Tags can be force-pushed by maintainers or compromised accounts.

**Fix:** Pin to full commit SHA:

```yaml
# Before
- uses: actions/checkout@v4
# After
- uses: actions/checkout@<full-sha>
```

Use `pin-github-action` tool or Dependabot to keep SHAs updated.

---

### 19. Missing input size constraints on API schemas

**Files:** `packages/server/src/routes/sessions.ts:385-400`, `packages/server/src/routes/agents.ts:64`
**Type:** Input Validation

String body fields (`content`, `model`, `systemPrompt`, agent `name`) have no `maxLength` constraints in Fastify schemas.

**Fix:** Add explicit limits:

```typescript
content: { type: 'string', maxLength: 100_000 },
model: { type: 'string', maxLength: 100 },
systemPrompt: { type: 'string', maxLength: 1_000_000 },
name: { type: 'string', minLength: 1, maxLength: 255, pattern: '^[a-zA-Z0-9_-]+$' },
```

---

## LOW

### 20. Error responses may leak internal details

**File:** `packages/bridge/src/index.ts:247-248`
**Type:** Information Disclosure

Error messages are stringified directly and may include file paths or stack traces.

**Fix:** Sanitize error messages before sending. Log full error server-side.

---

### 21. Swagger UI publicly accessible

**File:** `packages/server/src/server.ts`
**Type:** Information Disclosure

`/docs` endpoint exposes the full API surface without authentication.

**Fix:** Gate behind auth, or disable in production (`if (process.env.NODE_ENV !== 'production')`).

---

### 22. No HTTPS enforcement

**Type:** Transport Security

Server binds HTTP on `0.0.0.0:4100`. Must be behind a reverse proxy for TLS in production.

**Fix:** Document that direct exposure is not supported. Consider adding a startup warning if `NODE_ENV=production` and no TLS is configured.

---

### 23. du may hang on symlink loops

**File:** `packages/sandbox/src/resource-limits.ts:366-387`
**Type:** Denial of Service

`du -sk` can hang on circular symlinks inside a sandbox workspace.

**Fix:** The existing 5s timeout mitigates this, but treat timeout as "exceeding disk limit" rather than silently ignoring:

```typescript
if (err.message?.includes('TIMEOUT')) {
  return Number.MAX_SAFE_INTEGER; // treat as over-limit
}
```

---

## Positive Findings

These areas are already well-implemented:

- Sandbox env allowlist properly restricts host variable leakage
- API keys are HMAC-SHA256 hashed in the database
- Credentials encrypted at rest with AES-256-GCM + PBKDF2 (100k iterations)
- Path traversal defense in file-serving routes uses belt-and-suspenders (blacklist + whitelist)
- SQL injection prevented by consistent Drizzle ORM usage with parameterized queries
- Tenant isolation checks are consistent across all API routes
- `execFileSync` (not `execSync`) used for bridge process spawning

---

## Fix Priority

| Priority | Items | Estimated Effort |
|----------|-------|------------------|
| **Immediate** | #1, #2, #3 (command injection, key in stdout) | 1-2 hrs |
| **This week** | #4-#7 (chown, sandboxId, protocol, socket) | 3-4 hrs |
| **This week** | #8, #9, #10, #11 (deps, rate limit, CORS, internal auth) | 3-4 hrs |
| **Next sprint** | #12-#16 (process cleanup, path traversal, buffer limit) | 4-5 hrs |
| **Next sprint** | #17-#19 (CLI creds, GHA pinning, schema limits) | 2-3 hrs |
| **Backlog** | #20-#23 (error sanitization, swagger, HTTPS, symlinks) | 2-3 hrs |
