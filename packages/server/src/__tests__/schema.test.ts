import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SqliteDb } from '../db/sqlite.js';
import { dumpSchema } from '../db/dump-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '..', 'db', 'schema.sql');

describe('schema.sql', () => {
  let tempDir: string;
  let sqliteDb: SqliteDb;

  afterEach(async () => {
    await sqliteDb?.close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('matches the checked-in schema.sql (run `pnpm dump-schema` to regenerate)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ash-schema-test-'));
    sqliteDb = new SqliteDb(tempDir);

    const raw = new Database(join(tempDir, 'ash.db'), { readonly: true });
    const generated = dumpSchema(raw);
    raw.close();

    const checkedIn = readFileSync(SCHEMA_PATH, 'utf-8');
    // Strip the header comments to compare just the schema body
    const bodyFromFile = checkedIn.replace(/^--.*\n/gm, '').trim();

    expect(generated.trim()).toBe(bodyFromFile);
  });
});
