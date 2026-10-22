// Sicherung und Wiederherstellung.
// Inhalt: konsistenter SQLite-Snapshot (Online-Backup-API), alle Dokumentdateien (bereits verschlüsselt),
// Manifest mit SHA-256 jeder Datei. Der Hauptschlüssel ist NICHT enthalten und muss getrennt gesichert werden.
import yazl from 'yazl';
import yauzl from 'yauzl';
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, existsSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Ctx } from '../context.js';
import { schemaVersion } from '../db/index.js';
import { registerJob } from './jobs.js';
import { deriveKey, sha256Hex } from '../lib/crypto.js';
import { migrations } from '../db/migrations.js';

export interface BackupManifest {
  format: 'paraph-backup/1';
  created_at: string;
  version: string;
  schema: number;
  master_key_check: string; // erlaubt die Prüfung, ob der richtige Schlüssel vorliegt – verrät ihn nicht
  storage: 'local' | 's3';
  files: { path: string; sha256: string; size: number }[];
  counts: Record<string, number>;
}

export function masterKeyCheck(master: Buffer) {
  return sha256Hex(deriveKey(master, 'backup-check')).slice(0, 16);
}

export async function createBackup(ctx: Ctx, outDir: string): Promise<{ file: string; manifest: BackupManifest }> {
  mkdirSync(outDir, { recursive: true });
  const ts = ctx.now().toISOString().replace(/[:.]/g, '-');
  const snapshot = join(outDir, `.snapshot-${ts}.db`);
  await ctx.db.backup(snapshot);
  const files: { path: string; abs: string }[] = [{ path: 'paraph.db', abs: snapshot }];
  const blobDir = join(ctx.cfg.dataDir, 'blobs');
  const storage = ctx.cfg.s3 ? 's3' : 'local';
  if (!ctx.cfg.s3 && existsSync(blobDir)) {
    for (const sub of readdirSync(blobDir)) {
      for (const f of readdirSync(join(blobDir, sub))) if (!f.endsWith('.tmp')) files.push({ path: `blobs/${sub}/${f}`, abs: join(blobDir, sub, f) });
    }
  }
  const manifestFiles = files.map((f) => {
    const data = readFileSync(f.abs);
    return { path: f.path, sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
  });
  const count = (t: string) => (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n;
  const manifest: BackupManifest = {
    format: 'paraph-backup/1',
    created_at: ctx.now().toISOString(),
    version: ctx.cfg.version,
    schema: schemaVersion(ctx.db),
    master_key_check: masterKeyCheck(ctx.cfg.masterKey),
    storage,
    files: manifestFiles,
    counts: { users: count('users'), orgs: count('orgs'), envelopes: count('envelopes'), templates: count('templates'), audit_events: count('audit_events'), blobs: count('blobs') },
  };
  const target = join(outDir, `paraph-backup-${ts}.zip`);
  const tmp = target + '.part';
  await new Promise<void>((resolve, reject) => {
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');
    for (const f of files) z.addFile(f.abs, f.path, { compress: f.path === 'paraph.db' });
    z.end();
    const out = createWriteStream(tmp, { mode: 0o600 });
    z.outputStream.pipe(out).on('close', resolve).on('error', reject);
  });
  renameSync(tmp, target);
  unlinkSync(snapshot);
  return { file: target, manifest };
}

function readZip(file: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('ZIP nicht lesbar'));
      zip.on('entry', (entry) => {
        // Schutz vor Pfadmanipulation
        if (entry.fileName.includes('..') || entry.fileName.startsWith('/') || !/^[A-Za-z0-9_./-]+$/.test(entry.fileName)) return reject(new Error(`Unzulässiger Pfad im Archiv: ${entry.fileName}`));
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return reject(e2);
          const chunks: Buffer[] = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

export async function verifyBackup(file: string, masterKey?: Buffer) {
  const entries = await readZip(file);
  const mf = entries.get('manifest.json');
  if (!mf) throw new Error('manifest.json fehlt – keine Paraph-Sicherung');
  const manifest = JSON.parse(mf.toString('utf8')) as BackupManifest;
  if (manifest.format !== 'paraph-backup/1') throw new Error('Unbekanntes Sicherungsformat');
  const problems: string[] = [];
  for (const f of manifest.files) {
    const data = entries.get(f.path);
    if (!data) problems.push(`fehlt: ${f.path}`);
    else if (createHash('sha256').update(data).digest('hex') !== f.sha256) problems.push(`beschädigt: ${f.path}`);
  }
  const latest = Math.max(...migrations.map((m) => m.id));
  if (manifest.schema > latest) problems.push(`Sicherung stammt aus neuerer Version (Schema ${manifest.schema} > ${latest}). Bitte zuerst Paraph aktualisieren.`);
  if (masterKey && masterKeyCheck(masterKey) !== manifest.master_key_check) problems.push('Der Hauptschlüssel (MASTER_KEY) passt nicht zu dieser Sicherung. Ohne den richtigen Schlüssel sind die Dokumente nicht lesbar.');
  return { manifest, entries, problems };
}

/** Stellt eine Sicherung in ein leeres Datenverzeichnis wieder her. */
export async function restoreBackup(file: string, dataDir: string, masterKey: Buffer, opts: { force?: boolean } = {}) {
  const { manifest, entries, problems } = await verifyBackup(file, masterKey);
  if (problems.length) throw new Error('Sicherung nicht wiederherstellbar:\n- ' + problems.join('\n- '));
  mkdirSync(dataDir, { recursive: true });
  const existing = readdirSync(dataDir).filter((f) => !['secrets', 'backups', 'lost+found'].includes(f) && !f.startsWith('.'));
  if (existing.length && !opts.force) throw new Error(`Zielverzeichnis ${dataDir} ist nicht leer (${existing.join(', ')}). Mit --force wird es ersetzt.`);
  if (opts.force) {
    for (const f of ['paraph.db', 'paraph.db-wal', 'paraph.db-shm', 'blobs']) rmSync(join(dataDir, f), { recursive: true, force: true });
  }
  for (const f of manifest.files) {
    const target = join(dataDir, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entries.get(f.path)!, { mode: 0o600 });
  }
  return manifest;
}

export function pruneBackups(dir: string, keep: number) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => /^paraph-backup-.*\.zip$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const x of files.slice(keep)) unlinkSync(join(dir, x.f));
}

export function backupDir(ctx: Ctx) {
  return process.env.BACKUP_DIR ?? join(ctx.cfg.dataDir, 'backups');
}

registerJob('backup_auto', async (ctx) => {
  const dir = backupDir(ctx);
  const r = await createBackup(ctx, dir);
  pruneBackups(dir, ctx.cfg.backup.keep);
  ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_backup', ?)`).run(JSON.stringify({ file: r.file, at: r.manifest.created_at, files: r.manifest.files.length }));
  ctx.log.info({ file: r.file }, 'Automatische Sicherung erstellt');
});
