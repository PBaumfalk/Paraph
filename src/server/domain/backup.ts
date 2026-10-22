// Sicherung und Wiederherstellung (Format paraph-backup/2).
//
// Inhalt: konsistenter SQLite-Snapshot, alle Dokumentdateien (lokal oder aus S3, jeweils bereits verschlüsselt),
// Manifest mit SHA-256 jeder Datei – und, wenn eine Wiederherstellungs-Passphrase eingerichtet ist, der
// Hauptschlüssel selbst. Die gesamte Sicherung ist verschlüsselt (die Datenbank enthält Namen, E-Mail-Adressen
// und Feldwerte im Klartext und darf den Server nie unverschlüsselt verlassen).
//
// Aufbau der Datei:
//   "PRPHBK2\n" | u32 Kopflänge | Kopf (JSON) | Blöcke: u32 Länge | AES-256-GCM-Chiffrat | Tag(16)
// Ein zufälliger Datenschlüssel verschlüsselt die Blöcke. Er ist im Kopf zweifach verpackt:
//   - mit einem aus dem Hauptschlüssel abgeleiteten Schlüssel (laufender Betrieb, Prüfung, Wiederherstellung)
//   - optional mit der Passphrase (scrypt) – damit lässt sich die Sicherung samt Hauptschlüssel auch auf
//     einem neuen Server wiederherstellen, wenn der ursprüngliche Hauptschlüssel verloren ist.
// Jeder Block ist an Kopf, Position und „letzter Block“ gebunden (AAD): Vertauschen, Kürzen oder Anhängen fällt auf.
import yazl from 'yazl';
import yauzl from 'yauzl';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, existsSync, writeFileSync, renameSync, rmSync, openSync, readSync, closeSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual } from 'node:crypto';
import Database from 'better-sqlite3';
import type { Ctx } from '../context.js';
import { schemaVersion } from '../db/index.js';
import { registerJob } from './jobs.js';
import { deriveKey, sha256Hex } from '../lib/crypto.js';
import { migrations } from '../db/migrations.js';
import type { BlobBackend } from '../lib/storage.js';

export interface BackupManifest {
  format: 'paraph-backup/1' | 'paraph-backup/2';
  created_at: string;
  version: string;
  schema: number;
  master_key_check: string; // erlaubt die Prüfung, ob der richtige Schlüssel vorliegt – verrät ihn nicht
  storage: 'local' | 's3';
  includes_master_key?: boolean;
  files: { path: string; sha256: string; size: number }[];
  missing_blobs?: string[];
  counts: Record<string, number>;
}

interface Wrap {
  kind: 'master' | 'passphrase';
  iv: string;
  tag: string;
  ct: string;
  kdf?: { name: 'scrypt'; salt: string; N: number; r: number; p: number };
}

interface Header {
  format: 'paraph-backup/2';
  created_at: string;
  version: string;
  schema: number;
  master_key_check: string;
  includes_master_key: boolean;
  nonce_prefix: string;
  chunk_size: number;
  wraps: Wrap[];
}

const MAGIC = Buffer.from('PRPHBK2\n');
const CHUNK = 1024 * 1024;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };

export function masterKeyCheck(master: Buffer) {
  return sha256Hex(deriveKey(master, 'backup-check')).slice(0, 16);
}

function wrapKey(kek: Buffer, dk: Buffer, kind: Wrap['kind'], kdf?: Wrap['kdf']): Wrap {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', kek, iv);
  c.setAAD(Buffer.from('paraph-backup-wrap:' + kind));
  const ct = Buffer.concat([c.update(dk), c.final()]);
  return { kind, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64'), ...(kdf ? { kdf } : {}) };
}

function unwrapKey(kek: Buffer, w: Wrap): Buffer {
  const d = createDecipheriv('aes-256-gcm', kek, Buffer.from(w.iv, 'base64'));
  d.setAAD(Buffer.from('paraph-backup-wrap:' + w.kind));
  d.setAuthTag(Buffer.from(w.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(w.ct, 'base64')), d.final()]);
}

function passphraseKek(passphrase: string, kdf: NonNullable<Wrap['kdf']>) {
  return scryptSync(passphrase.normalize('NFKC'), Buffer.from(kdf.salt, 'base64'), 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
}

function nonce(prefix: Buffer, i: number) {
  const n = Buffer.alloc(12);
  prefix.copy(n, 0, 0, 8);
  n.writeUInt32BE(i, 8);
  return n;
}

function chunkAad(headerHash: Buffer, i: number, last: boolean) {
  const b = Buffer.alloc(5);
  b.writeUInt32BE(i, 0);
  b[4] = last ? 1 : 0;
  return Buffer.concat([headerHash, b]);
}

/** Verschlüsselt einen Datenstrom blockweise. Der letzte Block wird erst beim Ende geschrieben (Kennzeichen „letzter“). */
function encryptStream(dk: Buffer, header: Header) {
  const headerBytes = Buffer.from(JSON.stringify(header));
  const headerHash = createHash('sha256').update(headerBytes).digest();
  const prefix = Buffer.from(header.nonce_prefix, 'base64');
  let buf = Buffer.alloc(0);
  let i = 0;
  const emit = (t: Transform, data: Buffer, last: boolean) => {
    const c = createCipheriv('aes-256-gcm', dk, nonce(prefix, i));
    c.setAAD(chunkAad(headerHash, i, last));
    const ct = Buffer.concat([c.update(data), c.final()]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(ct.length);
    t.push(Buffer.concat([len, ct, c.getAuthTag()]));
    i++;
  };
  return new Transform({
    construct(cb) {
      const hl = Buffer.alloc(4);
      hl.writeUInt32BE(headerBytes.length);
      this.push(Buffer.concat([MAGIC, hl, headerBytes]));
      cb();
    },
    transform(chunk: Buffer, _enc, cb) {
      buf = Buffer.concat([buf, chunk]);
      // Immer mindestens einen vollen Block zurückhalten, damit der letzte Block korrekt markiert wird
      while (buf.length > CHUNK) {
        emit(this, buf.subarray(0, CHUNK), false);
        buf = buf.subarray(CHUNK);
      }
      cb();
    },
    flush(cb) {
      emit(this, buf, true);
      cb();
    },
  });
}

/** Liest den Kopf einer Sicherung (ohne zu entschlüsseln). */
export function readHeader(file: string): { header: Header; offset: number } | null {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(12);
    if (readSync(fd, head, 0, 12, 0) < 12 || !head.subarray(0, 8).equals(MAGIC)) return null;
    const len = head.readUInt32BE(8);
    if (len > 1_000_000) throw new Error('Sicherungskopf beschädigt');
    const hb = Buffer.alloc(len);
    readSync(fd, hb, 0, len, 12);
    return { header: JSON.parse(hb.toString('utf8')) as Header, offset: 12 + len };
  } finally {
    closeSync(fd);
  }
}

/** Ermittelt den Datenschlüssel: zuerst mit dem Hauptschlüssel, sonst mit der Passphrase. */
function dataKey(header: Header, keys: { masterKey?: Buffer; passphrase?: string }): { dk: Buffer; via: 'master' | 'passphrase' } {
  if (keys.masterKey) {
    const w = header.wraps.find((x) => x.kind === 'master');
    if (w && masterKeyCheck(keys.masterKey) === header.master_key_check) {
      try {
        return { dk: unwrapKey(deriveKey(keys.masterKey, 'backup-wrap'), w), via: 'master' };
      } catch {}
    }
  }
  if (keys.passphrase) {
    const w = header.wraps.find((x) => x.kind === 'passphrase');
    if (!w || !w.kdf) throw new Error('Diese Sicherung wurde ohne Wiederherstellungs-Passphrase erstellt. Sie ist nur mit dem ursprünglichen Hauptschlüssel (MASTER_KEY) lesbar.');
    try {
      return { dk: unwrapKey(passphraseKek(keys.passphrase, w.kdf), w), via: 'passphrase' };
    } catch {
      throw new Error('Die Wiederherstellungs-Passphrase ist falsch.');
    }
  }
  throw new Error(
    header.wraps.some((w) => w.kind === 'passphrase')
      ? 'Der Hauptschlüssel passt nicht zu dieser Sicherung. Mit der Wiederherstellungs-Passphrase (BACKUP_PASSPHRASE_FILE) lässt sie sich dennoch öffnen.'
      : 'Der Hauptschlüssel (MASTER_KEY) passt nicht zu dieser Sicherung. Ohne den richtigen Schlüssel ist sie nicht lesbar.',
  );
}

/** Entschlüsselt den Datenteil einer Sicherung in eine Datei (ZIP). Jeder Block wird authentifiziert. */
async function decryptToFile(file: string, header: Header, offset: number, dk: Buffer, out: string) {
  const headerBytes = Buffer.from(JSON.stringify(header));
  // Der Kopf wird genau so authentifiziert, wie er in der Datei steht
  const fd = openSync(file, 'r');
  const raw = Buffer.alloc(offset - 12);
  readSync(fd, raw, 0, raw.length, 12);
  closeSync(fd);
  const headerHash = createHash('sha256').update(raw).digest();
  void headerBytes;
  const prefix = Buffer.from(header.nonce_prefix, 'base64');
  let buf = Buffer.alloc(0);
  let i = 0;
  let sawLast = false;
  const dec = new Transform({
    transform(chunk: Buffer, _e, cb) {
      buf = Buffer.concat([buf, chunk]);
      try {
        while (buf.length >= 4) {
          const len = buf.readUInt32BE(0);
          if (len > CHUNK + 64) throw new Error('Sicherung beschädigt (Blocklänge)');
          if (buf.length < 4 + len + 16) break;
          if (sawLast) throw new Error('Sicherung beschädigt (Daten nach dem letzten Block)');
          const ct = buf.subarray(4, 4 + len);
          const tag = buf.subarray(4 + len, 4 + len + 16);
          buf = buf.subarray(4 + len + 16);
          // Ob dies der letzte Block ist, verrät erst das Dateiende – beide Varianten prüfen
          let plain: Buffer | null = null;
          for (const last of buf.length === 0 ? [true, false] : [false, true]) {
            try {
              const d = createDecipheriv('aes-256-gcm', dk, nonce(prefix, i));
              d.setAAD(chunkAad(headerHash, i, last));
              d.setAuthTag(tag);
              plain = Buffer.concat([d.update(ct), d.final()]);
              sawLast = last;
              break;
            } catch {}
          }
          if (!plain) throw new Error('Sicherung beschädigt oder manipuliert (Block ' + i + ')');
          i++;
          this.push(plain);
        }
        cb();
      } catch (e) {
        cb(e as Error);
      }
    },
    flush(cb) {
      if (buf.length) return cb(new Error('Sicherung unvollständig (abgeschnitten)'));
      if (!sawLast) return cb(new Error('Sicherung unvollständig (letzter Block fehlt)'));
      cb();
    },
  });
  await pipeline(createReadStream(file, { start: offset }), dec, createWriteStream(out, { mode: 0o600 }));
}

function backupPassphrase(): string | undefined {
  const { BACKUP_PASSPHRASE_FILE, BACKUP_PASSPHRASE } = process.env;
  if (BACKUP_PASSPHRASE_FILE) {
    try {
      return (require_fs().readFileSync(BACKUP_PASSPHRASE_FILE, 'utf8') as string).trim() || undefined;
    } catch {
      throw new Error(`BACKUP_PASSPHRASE_FILE ist nicht lesbar: ${BACKUP_PASSPHRASE_FILE}`);
    }
  }
  return BACKUP_PASSPHRASE || undefined;
}
// fs-Import ohne Zyklus mit dem Modulkopf (readFileSync wird nur hier gebraucht)
import * as fsSync from 'node:fs';
const require_fs = () => fsSync;

/** Liefert alle Blob-Schlüssel der Datenbank (Snapshot) – maßgeblich ist die Datenbank, nicht das Verzeichnis. */
function blobIds(snapshot: string): string[] {
  const db = new Database(snapshot, { readonly: true });
  try {
    return (db.prepare('SELECT id FROM blobs ORDER BY id').all() as { id: string }[]).map((r) => r.id);
  } finally {
    db.close();
  }
}

const blobPath = (id: string) => `blobs/${id.slice(-2)}/${id}`;

export async function createBackup(ctx: Ctx, outDir: string, opts: { passphrase?: string | null } = {}): Promise<{ file: string; manifest: BackupManifest }> {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const ts = ctx.now().toISOString().replace(/[:.]/g, '-');
  const work = join(outDir, `.work-${ts}-${randomBytes(4).toString('hex')}`);
  mkdirSync(work, { mode: 0o700 });
  const passphrase = opts.passphrase === null ? undefined : (opts.passphrase ?? backupPassphrase());
  try {
    const snapshot = join(work, 'paraph.db');
    await ctx.db.backup(snapshot);
    const backend: BlobBackend = ctx.blobs.backend;
    const storage = ctx.cfg.s3 ? 's3' : 'local';
    // Dateien in festgelegter Reihenfolge; Hashes werden beim Schreiben ins Archiv berechnet
    const entries: { path: string; open: () => Promise<Buffer> | Buffer; size?: number }[] = [];
    const missing: string[] = [];
    for (const id of blobIds(snapshot)) entries.push({ path: blobPath(id), open: () => backend.get(id) });
    if (passphrase) entries.push({ path: 'secrets/master.key', open: () => Buffer.from(ctx.cfg.masterKey.toString('base64') + '\n') });
    const files: BackupManifest['files'] = [];
    const count = (t: string) => (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n;

    // ZIP im Stream erzeugen: erst die Datenbank, dann Blobs einzeln (nie alle gleichzeitig im Speicher)
    const zip = new yazl.ZipFile();
    const dbHash = createHash('sha256');
    const dbStream = createReadStream(snapshot);
    dbStream.on('data', (c) => dbHash.update(c));
    let dbSize = 0;
    dbStream.on('data', (c) => (dbSize += c.length));
    zip.addReadStream(dbStream, 'paraph.db', { compress: true });
    const pending: Promise<void>[] = [];
    for (const e of entries) {
      // Lazy: der Inhalt wird erst gelesen, wenn yazl beim Eintrag angekommen ist
      const stream = Readable.from(
        (async function* () {
          let data: Buffer;
          try {
            data = await e.open();
          } catch (err: any) {
            missing.push(`${e.path}: ${String(err?.message ?? err).slice(0, 120)}`);
            data = Buffer.alloc(0);
          }
          files.push({ path: e.path, sha256: sha256Hex(data), size: data.length });
          yield data;
        })(),
        { objectMode: false },
      );
      zip.addReadStream(stream, e.path, { compress: false });
    }
    void pending;
    // Manifest muss im Archiv stehen, kennt aber erst am Ende alle Hashes → als letzter Eintrag
    const manifestReady = new Promise<Buffer>((resolve) => {
      zip.addReadStream(
        Readable.from(
          (async function* () {
            // Warten, bis alle vorherigen Einträge gelesen sind (yazl verarbeitet der Reihe nach)
            const m: BackupManifest = {
              format: 'paraph-backup/2',
              created_at: ctx.now().toISOString(),
              version: ctx.cfg.version,
              schema: schemaVersion(ctx.db),
              master_key_check: masterKeyCheck(ctx.cfg.masterKey),
              storage,
              includes_master_key: !!passphrase,
              files: [{ path: 'paraph.db', sha256: dbHash.digest('hex'), size: dbSize }, ...files.filter((f) => !missing.some((x) => x.startsWith(f.path + ':')))],
              ...(missing.length ? { missing_blobs: missing } : {}),
              counts: { users: count('users'), orgs: count('orgs'), envelopes: count('envelopes'), templates: count('templates'), audit_events: count('audit_events'), blobs: count('blobs') },
            };
            const b = Buffer.from(JSON.stringify(m, null, 2));
            resolve(b);
            yield b;
          })(),
        ),
        'manifest.json',
      );
    });
    zip.end();

    const nonce_prefix = randomBytes(8).toString('base64');
    const dk = randomBytes(32);
    const wraps: Wrap[] = [wrapKey(deriveKey(ctx.cfg.masterKey, 'backup-wrap'), dk, 'master')];
    if (passphrase) {
      const kdf = { name: 'scrypt' as const, salt: randomBytes(16).toString('base64'), ...SCRYPT };
      wraps.push(wrapKey(passphraseKek(passphrase, kdf), dk, 'passphrase', kdf));
    }
    const header: Header = {
      format: 'paraph-backup/2',
      created_at: ctx.now().toISOString(),
      version: ctx.cfg.version,
      schema: schemaVersion(ctx.db),
      master_key_check: masterKeyCheck(ctx.cfg.masterKey),
      includes_master_key: !!passphrase,
      nonce_prefix,
      chunk_size: CHUNK,
      wraps,
    };
    const target = join(outDir, `paraph-backup-${ts}.pbk`);
    const tmp = target + '.part';
    await pipeline(zip.outputStream, encryptStream(dk, header), createWriteStream(tmp, { mode: 0o600 }));
    const manifest = JSON.parse((await manifestReady).toString('utf8')) as BackupManifest;
    renameSync(tmp, target);
    chmodSync(target, 0o600);
    if (missing.length) ctx.log.error({ missing: missing.length }, 'Sicherung unvollständig: Dateien fehlen im Speicher');
    return { file: target, manifest };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Entpackt ein ZIP in ein Verzeichnis, prüft Pfade und berechnet Hashes beim Schreiben. */
function extractZip(file: string, dir: string, opts: { maxEntries?: number; maxBytes?: number } = {}): Promise<Map<string, { sha256: string; size: number }>> {
  const maxEntries = opts.maxEntries ?? 2_000_000;
  const maxBytes = opts.maxBytes ?? 1024 ** 4;
  return new Promise((resolve, reject) => {
    const out = new Map<string, { sha256: string; size: number }>();
    let total = 0;
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('ZIP nicht lesbar'));
      const fail = (e: Error) => {
        zip.close();
        reject(e);
      };
      zip.on('entry', (entry) => {
        // Schutz vor Pfadmanipulation (Zip-Slip) und Zip-Bomben
        if (entry.fileName.includes('..') || entry.fileName.startsWith('/') || !/^[A-Za-z0-9_./-]+$/.test(entry.fileName)) return fail(new Error(`Unzulässiger Pfad im Archiv: ${entry.fileName}`));
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        if (out.size >= maxEntries) return fail(new Error('Zu viele Einträge im Archiv'));
        total += entry.uncompressedSize;
        if (total > maxBytes) return fail(new Error('Archiv zu groß'));
        if (out.has(entry.fileName)) return fail(new Error(`Doppelter Eintrag im Archiv: ${entry.fileName}`));
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return fail(e2 ?? new Error('Eintrag nicht lesbar'));
          const target = join(dir, entry.fileName);
          mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
          const h = createHash('sha256');
          let size = 0;
          stream.on('data', (c: Buffer) => {
            h.update(c);
            size += c.length;
          });
          pipeline(stream, createWriteStream(target, { mode: 0o600 }))
            .then(() => {
              out.set(entry.fileName, { sha256: h.digest('hex'), size });
              zip.readEntry();
            })
            .catch(fail);
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', fail);
      zip.readEntry();
    });
  });
}

export interface OpenedBackup {
  manifest: BackupManifest;
  dir: string; // entpackte, geprüfte Inhalte (Aufräumen mit cleanup)
  problems: string[];
  via: 'master' | 'passphrase' | 'legacy';
  masterKeyFromBackup?: Buffer;
  cleanup: () => void;
}

/** Öffnet und prüft eine Sicherung vollständig (Entschlüsselung, Blockintegrität, Hashes, Schema, Schlüssel). */
export async function openBackup(file: string, keys: { masterKey?: Buffer; passphrase?: string }, workDir: string): Promise<OpenedBackup> {
  mkdirSync(workDir, { recursive: true, mode: 0o700 });
  const dir = join(workDir, `.restore-${Date.now()}-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { mode: 0o700 });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const h = readHeader(file);
    let zipFile = file;
    let via: OpenedBackup['via'] = 'legacy';
    if (h) {
      const k = dataKey(h.header, keys);
      via = k.via;
      zipFile = join(dir, '.payload.zip');
      await decryptToFile(file, h.header, h.offset, k.dk, zipFile);
    }
    const got = await extractZip(zipFile, join(dir, 'content'));
    if (zipFile !== file) unlinkSync(zipFile);
    const mfInfo = got.get('manifest.json');
    if (!mfInfo) throw new Error('manifest.json fehlt – keine Paraph-Sicherung');
    const manifest = JSON.parse(fsSync.readFileSync(join(dir, 'content', 'manifest.json'), 'utf8')) as BackupManifest;
    if (manifest.format !== 'paraph-backup/1' && manifest.format !== 'paraph-backup/2') throw new Error('Unbekanntes Sicherungsformat');
    const problems: string[] = [];
    for (const f of manifest.files) {
      const g = got.get(f.path);
      if (!g) problems.push(`fehlt: ${f.path}`);
      else if (g.sha256 !== f.sha256) problems.push(`beschädigt: ${f.path}`);
    }
    for (const m of manifest.missing_blobs ?? []) problems.push(`beim Sichern nicht lesbar: ${m}`);
    const latest = Math.max(...migrations.map((m) => m.id));
    if (manifest.schema > latest) problems.push(`Sicherung stammt aus neuerer Version (Schema ${manifest.schema} > ${latest}). Bitte zuerst Paraph aktualisieren.`);
    let masterKeyFromBackup: Buffer | undefined;
    if (manifest.includes_master_key && got.has('secrets/master.key')) {
      masterKeyFromBackup = Buffer.from(fsSync.readFileSync(join(dir, 'content', 'secrets/master.key'), 'utf8').trim(), 'base64');
      if (masterKeyCheck(masterKeyFromBackup) !== manifest.master_key_check) problems.push('Der enthaltene Hauptschlüssel passt nicht zum Manifest.');
    }
    if (via === 'legacy' && keys.masterKey && masterKeyCheck(keys.masterKey) !== manifest.master_key_check) {
      problems.push('Der Hauptschlüssel (MASTER_KEY) passt nicht zu dieser Sicherung. Ohne den richtigen Schlüssel sind die Dokumente nicht lesbar.');
    }
    // Datenbank selbst prüfen: lesbar und strukturell intakt
    try {
      const db = new Database(join(dir, 'content', 'paraph.db'), { readonly: true });
      const r = db.prepare('PRAGMA integrity_check').get() as any;
      db.close();
      if (r?.integrity_check !== 'ok') problems.push(`Datenbank beschädigt: ${r?.integrity_check}`);
    } catch (e: any) {
      problems.push(`Datenbank nicht lesbar: ${e.message}`);
    }
    return { manifest, dir: join(dir, 'content'), problems, via, masterKeyFromBackup, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

export async function verifyBackup(file: string, keys: { masterKey?: Buffer; passphrase?: string }, workDir: string) {
  const b = await openBackup(file, keys, workDir);
  b.cleanup();
  return { manifest: b.manifest, problems: b.problems, via: b.via, includesMasterKey: !!b.masterKeyFromBackup };
}

/** Schreibt den in der Sicherung enthaltenen Hauptschlüssel (nur mit Passphrase-Sicherungen). */
export async function extractMasterKey(file: string, passphrase: string, out: string, workDir: string) {
  const b = await openBackup(file, { passphrase }, workDir);
  try {
    if (!b.masterKeyFromBackup) throw new Error('Diese Sicherung enthält keinen Hauptschlüssel.');
    if (existsSync(out)) throw new Error(`${out} existiert bereits – nicht überschrieben.`);
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, b.masterKeyFromBackup.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
    return b.manifest;
  } finally {
    b.cleanup();
  }
}

/**
 * Stellt eine Sicherung wieder her. Datenbank → DATA_DIR, Dokumente → konfigurierte Ablage (lokal oder S3;
 * damit ist auch ein Umzug lokal ↔ S3 möglich). Erst nach vollständiger Prüfung wird etwas ersetzt.
 */
export async function restoreBackup(file: string, target: { dataDir: string; masterKey: Buffer; backend: BlobBackend; passphrase?: string }, opts: { force?: boolean } = {}) {
  const b = await openBackup(file, { masterKey: target.masterKey, passphrase: target.passphrase }, target.dataDir);
  try {
    if (b.problems.length) throw new Error('Sicherung nicht wiederherstellbar:\n- ' + b.problems.join('\n- '));
    if (masterKeyCheck(target.masterKey) !== b.manifest.master_key_check) {
      throw new Error(
        b.masterKeyFromBackup
          ? 'Der eingerichtete Hauptschlüssel gehört nicht zu dieser Sicherung. Zuerst den Schlüssel aus der Sicherung übernehmen: paraph restore-key DATEI --out <Pfad> (siehe Handbuch, Kapitel Sicherung).'
          : 'Der eingerichtete Hauptschlüssel gehört nicht zu dieser Sicherung. Ohne den ursprünglichen Schlüssel sind die Dokumente nicht lesbar.',
      );
    }
    const existing = readdirSync(target.dataDir).filter(
      (f) => !['secrets', 'backups', 'lost+found'].includes(f) && !f.startsWith('.') && !(f === 'blobs' && readdirSync(join(target.dataDir, f)).length === 0),
    );
    if (existing.length && !opts.force) throw new Error(`Zielverzeichnis ${target.dataDir} ist nicht leer (${existing.join(', ')}). Mit --force wird es ersetzt.`);
    // Dokumente zuerst (idempotent), die Datenbank zuletzt: bricht der Vorgang ab, bleibt der alte Stand nutzbar
    let blobs = 0;
    for (const f of b.manifest.files) {
      if (!f.path.startsWith('blobs/')) continue;
      const id = f.path.split('/').pop()!;
      await target.backend.put(id, fsSync.readFileSync(join(b.dir, f.path)));
      blobs++;
    }
    if (opts.force) for (const f of ['paraph.db-wal', 'paraph.db-shm']) rmSync(join(target.dataDir, f), { force: true });
    const tmpDb = join(target.dataDir, '.paraph.db.restore');
    fsSync.copyFileSync(join(b.dir, 'paraph.db'), tmpDb);
    chmodSync(tmpDb, 0o600);
    renameSync(tmpDb, join(target.dataDir, 'paraph.db'));
    return { manifest: b.manifest, blobs };
  } finally {
    b.cleanup();
  }
}

export function pruneBackups(dir: string, keep: number) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => /^paraph-backup-.*\.(zip|pbk)$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const x of files.slice(keep)) unlinkSync(join(dir, x.f));
  // Reste abgebrochener Läufe
  for (const f of readdirSync(dir)) if (f.endsWith('.part') || f.startsWith('.work-')) rmSync(join(dir, f), { recursive: true, force: true });
}

export function backupDir(ctx: Ctx) {
  return process.env.BACKUP_DIR ?? join(ctx.cfg.dataDir, 'backups');
}

export function backupStatus(ctx: Ctx) {
  const last = ctx.db.prepare(`SELECT value FROM meta WHERE key = 'last_backup'`).get() as { value: string } | undefined;
  const parsed = last ? JSON.parse(last.value) : null;
  const ageH = parsed ? (ctx.now().getTime() - new Date(parsed.at).getTime()) / 3600_000 : null;
  return { last: parsed, age_hours: ageH === null ? null : Math.round(ageH * 10) / 10, passphrase: !!safePassphrase(), stale: ctx.cfg.backup.intervalHours > 0 && (ageH === null || ageH > ctx.cfg.backup.intervalHours * 2 + 1) };
}

function safePassphrase() {
  try {
    return backupPassphrase();
  } catch {
    return undefined;
  }
}

/** Gleichzeitig darf nur eine Sicherung laufen (Job und Kommandozeile). */
export async function runBackupJob(ctx: Ctx) {
  const dir = backupDir(ctx);
  const r = await createBackup(ctx, dir);
  pruneBackups(dir, ctx.cfg.backup.keep);
  ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_backup', ?)`).run(
    JSON.stringify({ file: r.file, at: r.manifest.created_at, files: r.manifest.files.length, size: statSync(r.file).size, includes_master_key: !!r.manifest.includes_master_key, missing: r.manifest.missing_blobs?.length ?? 0 }),
  );
  ctx.log.info({ file: r.file }, 'Sicherung erstellt');
  if (r.manifest.missing_blobs?.length) throw new Error(`Sicherung erstellt, aber ${r.manifest.missing_blobs.length} Datei(en) fehlen im Speicher`);
  return r;
}

registerJob('backup_auto', async (ctx) => void (await runBackupJob(ctx)));

export const _internal = { CHUNK, timingSafeEqual, Writable };
