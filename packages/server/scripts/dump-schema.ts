#!/usr/bin/env tsx
/**
 * Dumps the current database schema to src/db/schema.sql.
 *
 * Creates a temp SQLite DB, runs all migrations (via SqliteDb constructor),
 * then introspects the result to produce a canonical schema file.
 *
 * Usage: tsx scripts/dump-schema.ts
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { SqliteDb } from '../src/db/sqlite.js';
import { dumpSchema } from '../src/db/dump-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tempDir = mkdtempSync(join(tmpdir(), 'ash-schema-'));
try {
  // SqliteDb constructor runs all CREATE TABLE + migrations
  const sqliteDb = new SqliteDb(tempDir);

  // Open a read-only connection to introspect
  const raw = new Database(join(tempDir, 'ash.db'), { readonly: true });
  const schema = dumpSchema(raw);
  raw.close();
  await sqliteDb.close();

  const header = [
    '-- Auto-generated schema. Do not edit manually.',
    "-- Regenerate with: pnpm --filter '@ash-ai/server' run dump-schema",
    '--',
    '-- This file represents the canonical current state of the database.',
    '-- It is reconstructed from PRAGMA introspection after running all migrations.',
    '',
    '',
  ].join('\n');

  const outPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql');
  writeFileSync(outPath, header + schema + '\n');
  console.log(`Wrote ${outPath}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
