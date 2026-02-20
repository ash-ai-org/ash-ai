/**
 * Reconstructs the current SQLite schema from PRAGMA introspection.
 *
 * Why not just read sqlite_master? Because ALTER TABLE ADD COLUMN
 * doesn't update the original CREATE TABLE statement stored there.
 * We need PRAGMA table_info to get the actual current columns.
 */
import type Database from 'better-sqlite3';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListEntry {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexColumnInfo {
  seqno: number;
  cid: number;
  name: string;
}

interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
}

export function dumpSchema(db: Database.Database): string {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];

  const parts: string[] = [];

  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all() as ColumnInfo[];

    // Find single-column UNIQUE constraints (from column-level UNIQUE declarations)
    const indexList = db.prepare(`PRAGMA index_list("${name}")`).all() as IndexListEntry[];
    const uniqueCols = new Set<string>();
    for (const idx of indexList) {
      if (idx.origin === 'u') {
        const idxCols = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as IndexColumnInfo[];
        if (idxCols.length === 1) {
          uniqueCols.add(idxCols[0].name);
        }
      }
    }

    // Multi-column unique constraints (table-level)
    const uniqueTableConstraints: string[] = [];
    for (const idx of indexList) {
      if (idx.origin === 'u') {
        const idxCols = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as IndexColumnInfo[];
        if (idxCols.length > 1) {
          const colNames = idxCols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name).join(', ');
          uniqueTableConstraints.push(`  UNIQUE(${colNames})`);
        }
      }
    }

    // Foreign keys
    const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as ForeignKeyInfo[];
    const fkGroups = new Map<number, ForeignKeyInfo[]>();
    for (const fk of fks) {
      if (!fkGroups.has(fk.id)) fkGroups.set(fk.id, []);
      fkGroups.get(fk.id)!.push(fk);
    }

    // Build column definitions
    const colDefs = columns.map((col) => {
      let def = `  ${col.name} ${col.type}`;
      if (col.pk) def += ' PRIMARY KEY';
      if (col.notnull && !col.pk) def += ' NOT NULL';
      if (uniqueCols.has(col.name)) def += ' UNIQUE';
      if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
      return def;
    });

    for (const [, fkCols] of fkGroups) {
      const fromCols = fkCols.map((f) => f.from).join(', ');
      const toCols = fkCols.map((f) => f.to).join(', ');
      colDefs.push(`  FOREIGN KEY (${fromCols}) REFERENCES ${fkCols[0].table}(${toCols})`);
    }

    colDefs.push(...uniqueTableConstraints);

    parts.push(`CREATE TABLE ${name} (\n${colDefs.join(',\n')}\n);`);
  }

  // Explicit indexes (skip autoindexes)
  const indexes = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { sql: string }[];

  for (const { sql } of indexes) {
    parts.push(sql + ';');
  }

  return parts.join('\n\n');
}
