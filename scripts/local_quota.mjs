// A local stand-in for the Worker's D1 binding, backed by Node's built-in
// SQLite and the same migrations as production (drizzle/*.sql). Used by
// `npm run dev` and the Worker tests.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));

export function createLocalDb(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(migrations, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement.replace(/CREATE TABLE `/g, 'CREATE TABLE IF NOT EXISTS `'));
    }
  }
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      const bound = (args = []) => ({
        // D1 returns plain objects; node:sqlite rows have a null prototype.
        async first() { const row = statement.get(...args); return row ? {...row} : null; },
        async all() { return {results: statement.all(...args).map(row => ({...row})), success: true}; },
        async run() { const info = statement.run(...args); return {success: true, meta: {changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid)}}; },
      });
      return {...bound(), bind: (...args) => bound(args)};
    },
  };
}

// Kept for existing imports.
export const createLocalQuotaDb = createLocalDb;
