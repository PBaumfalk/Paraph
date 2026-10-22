import Database from 'better-sqlite3';
import { join } from 'node:path';
import { migrations } from './migrations.js';

export type DB = Database.Database;

export function openDb(dataDir: string, file = 'paraph.db'): DB {
  const db = new Database(join(dataDir, file));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);`);
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r: any) => r.id as number));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
    })();
  }
}

export function schemaVersion(db: DB): number {
  const r = db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get() as { v: number | null };
  return r.v ?? 0;
}

/** Führt fn in einer IMMEDIATE-Transaktion aus: Schreibsperre sofort, keine verlorenen Updates. */
export function tx<T>(db: DB, fn: () => T): T {
  return db.transaction(fn).immediate();
}
