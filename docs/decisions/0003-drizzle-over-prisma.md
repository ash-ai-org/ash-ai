# 0003: Drizzle ORM over Prisma for DB Unification

**Date:** 2026-02-20
**Status:** Accepted

## Context

`sqlite.ts` (479 lines) and `pg.ts` (460 lines) duplicated ~90% of their logic. The plan called for unifying them behind an ORM. The two candidates were Prisma and Drizzle.

## Decision

Use Drizzle ORM.

## Why Drizzle

1. **No binary engine.** Prisma bundles a ~15-30MB Rust query engine. Drizzle is pure TypeScript — no codegen, no binary, no postinstall step. This matters for Docker image size and CI speed.

2. **No codegen step.** Prisma requires `prisma generate` before every build. Drizzle schemas are plain TypeScript files — import them directly.

3. **Dialect-native schemas.** Drizzle uses `sqliteTable` and `pgTable` with the actual SQL column types. Prisma uses a custom DSL that abstracts over dialects, which makes it harder to verify the generated SQL matches the existing schema.

4. **SQL-close query API.** Drizzle's `select().from().where(eq(...))` maps 1:1 to SQL. Easy to audit, easy to drop to raw SQL for edge cases (like the `CASE WHEN` eviction ordering or `COALESCE(SELECT MAX(...))` atomic sequence assignment).

5. **Plain SQL migrations.** `drizzle-kit generate` produces `.sql` files. They're readable, diffable, and reviewable. Prisma migrations are also SQL but require the Prisma CLI to apply.

## Trade-offs

- **Two schema files.** Drizzle requires separate `sqliteTable` vs `pgTable` definitions. This is ~80 lines each, structurally identical but in separate files. Prisma's single `schema.prisma` handles both dialects.

- **Less automatic.** Prisma auto-generates a type-safe client with relation loading. Drizzle requires manual row-to-object mapping (which we were already doing).

- **Smaller ecosystem.** Prisma has more documentation and tooling. Drizzle is newer but sufficient for our needs (basic CRUD, migrations, transactions).

## Consequences

- Single `DrizzleDb` class replaces `SqliteDb` and `PgDb`
- Net reduction: ~940 lines of duplicated SQL replaced by ~510 lines of Drizzle + generated migrations
- All existing tests pass unchanged
- Migration path for existing databases is handled by Drizzle's journal tracking
