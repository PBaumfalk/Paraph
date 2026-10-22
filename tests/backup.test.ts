// Sicherung v2: verschlüsselt, blockweise authentisiert, optional mit Hauptschlüssel (Passphrase).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startTestServer, setupAdmin, Client, Signer, lastMail, jobs, type TestServer } from './helpers/server.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { createBackup, verifyBackup, restoreBackup, extractMasterKey, readHeader } from '../src/server/domain/backup.js';
import { LocalBackend } from '../src/server/lib/storage.js';
import { sha256Hex } from '../src/server/lib/crypto.js';

let s: TestServer;
let admin: Client;
let envId: string;
let finalSha: string;
const out = mkdtempSync(join(tmpdir(), 'paraph-bk-'));
const PASS = 'korrekt pferd batterie heftklammer';

beforeAll(async () => {
  s = await startTestServer();
  admin = await setupAdmin(s);
  const env = await admin.post('/api/v1/envelopes', { title: 'Sicherungstest Mandat' });
  envId = env.json.id;
  await admin.upload(`/api/v1/envelopes/${envId}/documents`, 'v.pdf', await makePdf({ pages: 2, title: 'Sicherung' }));
  const recs = await admin.put(`/api/v1/envelopes/${envId}/recipients`, [{ ref: 'a', name: 'Berta', email: 'berta@example.org' }]);
  await admin.put(`/api/v1/envelopes/${envId}/fields`, [{ type: 'signature', document: 0, recipient: recs.json.refs.a, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
  await admin.post(`/api/v1/envelopes/${envId}/send`);
  const signer = new Signer(s);
  const view = (await signer.open(lastMail(s, 'berta@example.org')!.link!)).json.view;
  const sig = (await signer.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() })).json.id;
  const key = view.fields.find((f: any) => f.mine).key;
  await signer.req('POST', '/api/sign/complete', { values: {}, signatures: { [key]: sig }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: view.documents.map((d: any) => d.sha256), completion_key: 'ck_backup_1' });
  await jobs(s);
  const e = await admin.get(`/api/v1/envelopes/${envId}`);
  expect(e.json.status).toBe('completed');
  finalSha = e.json.result.final_sha256;
});
afterAll(async () => s.close());

describe('Sicherung v2', () => {
  it('ist vollständig verschlüsselt: kein Klartext der Datenbank, keine PDF-Signatur, keine E-Mail-Adresse', async () => {
    const r = await createBackup(s.ctx, out, { passphrase: null });
    const raw = readFileSync(r.file);
    expect(raw.subarray(0, 8).toString()).toBe('PRPHBK2\n');
    expect(raw.includes(Buffer.from('SQLite format'))).toBe(false);
    expect(raw.includes(Buffer.from('berta@example.org'))).toBe(false);
    expect(raw.includes(Buffer.from('Sicherungstest Mandat'))).toBe(false);
    expect(r.manifest.includes_master_key).toBe(false);
    expect(r.manifest.files.filter((f) => f.path.startsWith('blobs/')).length).toBe((s.ctx.db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as any).n);
    const v = await verifyBackup(r.file, { masterKey: s.ctx.cfg.masterKey }, out);
    expect(v.problems).toEqual([]);
    expect(v.via).toBe('master');
  });

  it('erkennt Manipulation, Abschneiden und falsche Schlüssel', async () => {
    const r = await createBackup(s.ctx, out, { passphrase: PASS });
    const raw = readFileSync(r.file);
    const flipped = Buffer.from(raw);
    flipped[flipped.length - 100] ^= 0x01;
    writeFileSync(join(out, 'flip.pbk'), flipped);
    await expect(verifyBackup(join(out, 'flip.pbk'), { masterKey: s.ctx.cfg.masterKey }, out)).rejects.toThrow(/beschädigt|manipuliert/);
    // Letzten Block abschneiden: muss als unvollständig auffallen (nicht stillschweigend kürzer)
    const h = readHeader(r.file)!;
    let pos = h.offset;
    let lastStart = pos;
    while (pos < raw.length) {
      lastStart = pos;
      pos += 4 + raw.readUInt32BE(pos) + 16;
    }
    writeFileSync(join(out, 'cut.pbk'), raw.subarray(0, lastStart));
    await expect(verifyBackup(join(out, 'cut.pbk'), { masterKey: s.ctx.cfg.masterKey }, out)).rejects.toThrow(/unvollständig|beschädigt/);
    await expect(verifyBackup(r.file, { masterKey: randomBytes(32) }, out)).rejects.toThrow(/Passphrase/);
    await expect(verifyBackup(r.file, { masterKey: randomBytes(32), passphrase: 'falsch' }, out)).rejects.toThrow(/Passphrase ist falsch/);
    const ok = await verifyBackup(r.file, { passphrase: PASS }, out);
    expect(ok.problems).toEqual([]);
    expect(ok.via).toBe('passphrase');
    expect(ok.includesMasterKey).toBe(true);
  });

  it('Katastrophenfall: neuer Server ohne alten Schlüssel – Schlüssel per Passphrase übernehmen, wiederherstellen, alles lesbar', async () => {
    const r = await createBackup(s.ctx, out, { passphrase: PASS });
    const fresh = mkdtempSync(join(tmpdir(), 'paraph-new-'));
    // Ohne Passphrase und mit fremdem Schlüssel: verweigert
    await expect(restoreBackup(r.file, { dataDir: fresh, masterKey: randomBytes(32), backend: new LocalBackend(join(fresh, 'blobs')) })).rejects.toThrow(/Hauptschlüssel/);
    const keyFile = join(fresh, 'secrets', 'master.key');
    await extractMasterKey(r.file, PASS, keyFile, fresh);
    const key = Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'base64');
    expect(key.equals(s.ctx.cfg.masterKey)).toBe(true);
    await expect(extractMasterKey(r.file, PASS, keyFile, fresh)).rejects.toThrow(/existiert bereits/);
    const res = await restoreBackup(r.file, { dataDir: fresh, masterKey: key, backend: new LocalBackend(join(fresh, 'blobs')) });
    expect(res.blobs).toBeGreaterThan(3);
    expect(readdirSync(fresh).filter((f) => f.startsWith('.restore-'))).toEqual([]);
    // Wiederhergestellte Instanz starten und das finale PDF abrufen
    const s2 = await startTestServer({}, fresh, key);
    try {
      const c = new Client(s2);
      const login = await c.post('/api/auth/login', { email: 'admin@kanzlei.test', password: 'sehr-sicheres-passwort-1' });
      expect(login.status).toBe(200);
      await c.refreshCsrf();
      const pdf = await c.get(`/api/v1/envelopes/${envId}/files/final`);
      expect(pdf.status).toBe(200);
      expect(sha256Hex(Buffer.from(pdf.body))).toBe(finalSha);
      const audit = await c.get(`/api/v1/envelopes/${envId}/audit`);
      expect(audit.status).toBe(200);
    } finally {
      await s2.close();
    }
  });

  it('überschreibt kein belegtes Datenverzeichnis ohne --force', async () => {
    const r = await createBackup(s.ctx, out, { passphrase: null });
    await expect(restoreBackup(r.file, { dataDir: s.dir, masterKey: s.ctx.cfg.masterKey, backend: new LocalBackend(join(s.dir, 'blobs')) })).rejects.toThrow(/nicht leer/);
    expect(existsSync(join(s.dir, 'paraph.db'))).toBe(true);
  });
});
