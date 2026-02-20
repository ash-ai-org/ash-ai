# Unify SQLite and PG Database Backends with Prisma

## Status: Planned

## Problem

`packages/server/src/db/sqlite.ts` and `packages/server/src/db/pg.ts` are ~300 lines each with ~90% identical logic. The only real differences are:

- Placeholder syntax (`?` vs `$1, $2`)
- Sync vs async query execution
- Date defaults (`datetime('now')` vs `now()::TEXT`)
- Migration syntax (try/catch vs `IF NOT EXISTS` for ALTER TABLE)

All SQL queries and row-to-object mapping are duplicated verbatim. Migrations are inline and fragile.

## Proposed Solution: Prisma

Replace both hand-rolled DB implementations with Prisma ORM.

### Why Prisma

- **Single schema definition** (`schema.prisma`) replaces the scattered `CREATE TABLE` + inline migrations in both files
- **Generated type-safe client** eliminates all manual row-to-object mapping
- **Built-in migration system** replaces the ad-hoc ALTER TABLE + try/catch approach
- **Multi-provider support** — one codebase for SQLite and PostgreSQL/CockroachDB
- **Schema is the source of truth** — replaces the `dump-schema.ts` script we built

### Schema

```prisma
datasource db {
  provider = "postgresql" // or "sqlite" via env switch
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Agent {
  id        String   @id @default(uuid())
  tenantId  String   @default("default") @map("tenant_id")
  name      String
  version   Int      @default(1)
  path      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([tenantId, name])
  @@index([tenantId])
  @@map("agents")
}

model Session {
  id           String   @id
  tenantId     String   @default("default") @map("tenant_id")
  agentName    String   @map("agent_name")
  sandboxId    String   @map("sandbox_id")
  status       String   @default("starting")
  runnerId     String?  @map("runner_id")
  createdAt    DateTime @default(now()) @map("created_at")
  lastActiveAt DateTime @default(now()) @map("last_active_at")

  @@index([tenantId])
  @@map("sessions")
}

model Sandbox {
  id           String   @id
  tenantId     String   @default("default") @map("tenant_id")
  sessionId    String?  @map("session_id")
  agentName    String   @map("agent_name")
  state        String   @default("warming")
  workspaceDir String   @map("workspace_dir")
  createdAt    DateTime @default(now()) @map("created_at")
  lastUsedAt   DateTime @default(now()) @map("last_used_at")

  @@index([state])
  @@index([sessionId])
  @@index([lastUsedAt])
  @@index([tenantId])
  @@map("sandboxes")
}

model ApiKey {
  id        String   @id
  tenantId  String   @map("tenant_id")
  keyHash   String   @unique @map("key_hash")
  label     String   @default("")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([tenantId])
  @@map("api_keys")
}
```

### What Gets Deleted

- `packages/server/src/db/sqlite.ts` — replaced by Prisma client
- `packages/server/src/db/pg.ts` — replaced by Prisma client
- `packages/server/src/db/dump-schema.ts` — Prisma schema is the source of truth
- `packages/server/scripts/dump-schema.ts` — no longer needed
- `packages/server/src/db/schema.sql` — replaced by `schema.prisma`
- `packages/server/src/__tests__/schema.test.ts` — Prisma manages schema consistency
- Inline migrations (ALTER TABLE hacks) — replaced by `prisma migrate`

### What Changes

- `packages/server/src/db/index.ts` — `Db` interface stays, single implementation wraps `PrismaClient`
- `packages/server/package.json` — add `prisma`, `@prisma/client` deps; add `prisma generate` to build
- Add `packages/server/prisma/schema.prisma`

### Migration Path

1. Add Prisma deps and `schema.prisma` matching the current DB shape
2. Run `prisma migrate diff` to baseline existing databases
3. Rewrite `Db` implementation as a single class wrapping `PrismaClient`
4. Delete `sqlite.ts`, `pg.ts`, and dump-schema tooling
5. Update tests to use Prisma's test utilities

### Trade-offs

- **Adds ~15-30MB** (Rust query engine binary) to the deployment
- **Codegen step** — `prisma generate` must run before builds
- **SQLite + Prisma** — Prisma's SQLite support works but is less battle-tested than its PG support; verify migration behavior
- **Runtime overhead** — queries go through the Prisma engine rather than direct DB calls; measure before/after latency
