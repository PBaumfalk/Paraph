import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync, chmodSync, readdirSync, unlinkSync } from 'node:fs';
import { migrations } from './migrations.js';

export type DB = Database.Database;

export function openDb(dataDir: string, file = 'paraph.db'): DB {
  const db = new Database(join(dataDir, file));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db, { snapshotDir: join(dataDir, 'backups', 'migrations') });
  return db;
}

export function migrate(db: DB, opts: { snapshotDir?: string } = {}): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);`);
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r: any) => r.id as number));
  const latest = Math.max(...migrations.map((m) => m.id));
  const newest = Math.max(0, ...applied);
  // Kein Betrieb mit älterem Programm auf neuerer Datenbank (Rückstufung würde Daten falsch deuten)
  if (newest > latest) {
    throw new Error(`Die Datenbank stammt aus einer neueren Paraph-Version (Schema ${newest}, dieses Programm kennt bis ${latest}). Bitte die neuere Version starten oder eine passende Sicherung wiederherstellen.`);
  }
  const pending = migrations.filter((m) => !applied.has(m.id));
  if (!pending.length) return;
  // Vor jeder Migration einer bestehenden Datenbank: konsistente Kopie (VACUUM INTO), höchstens drei aufbewahrt
  if (applied.size > 0 && opts.snapshotDir) {
    mkdirSync(opts.snapshotDir, { recursive: true, mode: 0o700 });
    const file = join(opts.snapshotDir, `pre-migration-schema${newest}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    chmodSync(file, 0o600);
    const old = readdirSync(opts.snapshotDir).filter((f) => f.startsWith('pre-migration-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 3))) unlinkSync(join(opts.snapshotDir, f));
  }
  for (const m of pending) {
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
