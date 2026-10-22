// Regressionstests zur unabhängigen Sicherheitsprüfung und zur Betriebsfähigkeit.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { PNG } from 'pngjs';
import { startTestServer, setupAdmin, Client, Signer, lastMail, jobs, type TestServer } from './helpers/server.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { listAudit } from '../src/server/domain/audit.js';
import { classifyMailError, smtpTransportOptions, createSmtpTransport } from '../src/server/domain/mail.js';
import { migrate, openDb } from '../src/server/db/index.js';
import { migrations } from '../src/server/db/migrations.js';
import { trustProxySetting } from '../src/server/config.js';
import { sanitizePng } from '../src/server/domain/signing.js';

let s: TestServer;
let admin: Client;

beforeAll(async () => {
  s = await startTestServer({ metricsToken: 'metrics-geheim-123' });
  admin = await setupAdmin(s);
});
afterAll(async () => s.close());

async function envelope(title: string, recipients: { ref: string; name: string; email: string; auth_method?: string; access_code?: string }[], fields: (refs: Record<string, string>) => any[]) {
  const env = await admin.post('/api/v1/envelopes', { title });
  await admin.upload(`/api/v1/envelopes/${env.json.id}/documents`, 'v.pdf', await makePdf({ title }));
  const recs = await admin.put(`/api/v1/envelopes/${env.json.id}/recipients`, recipients);
  expect(recs.status).toBe(200);
  const f = await admin.put(`/api/v1/envelopes/${env.json.id}/fields`, fields(recs.json.refs));
  expect(f.status).toBe(200);
  expect((await admin.post(`/api/v1/envelopes/${env.json.id}/send`)).status).toBe(200);
  return { id: env.json.id as string, refs: recs.json.refs as Record<string, string> };
}

describe('Befunde der Sicherheitsprüfung', () => {
  it('Zugangscode: Fehlversuche werden gezählt, gesperrt und im Audit-Trail festgehalten', async () => {
    const e = await envelope('Bruteforce', [{ ref: 'a', name: 'Ada', email: 'ada@example.org', auth_method: 'access_code', access_code: 'geheim-42' }], (r) => [{ type: 'signature', document: 0, recipient: r.a, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
    const signer = new Signer(s);
    expect((await signer.open(lastMail(s, 'ada@example.org')!.link!)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await signer.req('POST', '/api/sign/verify', { code: 'falsch-' + i })).status).toBe(401);
    // Auch der richtige Code wird jetzt abgewiesen (Sperre)
    expect((await signer.req('POST', '/api/sign/verify', { code: 'geheim-42' })).status).toBe(429);
    const events = listAudit(s.ctx.db, e.id);
    expect(events.filter((x) => x.type === 'recipient.auth_failed')).toHaveLength(5);
    expect(events.some((x) => x.type === 'recipient.auth_locked')).toBe(true);
    // Nach Ablauf der Sperre funktioniert der richtige Code
    const realNow = s.ctx.now;
    s.ctx.now = () => new Date(Date.now() + 16 * 60_000);
    try {
      expect((await signer.req('POST', '/api/sign/verify', { code: 'geheim-42' })).status).toBe(200);
    } finally {
      s.ctx.now = realNow;
    }
  });

  it('Zugangscodes unter 6 Zeichen werden abgelehnt', async () => {
    const env = await admin.post('/api/v1/envelopes', { title: 'Kurzer Code' });
    const r = await admin.put(`/api/v1/envelopes/${env.json.id}/recipients`, [{ ref: 'a', name: 'Bo', email: 'bo@example.org', auth_method: 'access_code', access_code: '1234' }]);
    expect(r.status).toBe(400);
  });

  it('TRUST_PROXY=true vertraut genau einem Hop – vorangestellte X-Forwarded-For-Einträge des Clients zählen nicht', async () => {
    expect(trustProxySetting('true')).toBe(1);
    expect(trustProxySetting('false')).toBe(false);
    expect(trustProxySetting('2')).toBe(2);
    expect(trustProxySetting('10.0.0.0/8, 172.16.0.0/12')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    const p = await startTestServer({ trustProxy: 1 });
    try {
      let seen = '';
      p.app.get('/api/zz-ip', async (req) => (seen = req.ip));
      await p.app.inject({ method: 'GET', url: '/api/zz-ip', headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, remoteAddress: '172.18.0.5' });
      expect(seen).toBe('203.0.113.7');
    } catch (e: any) {
      // Routen lassen sich nach ready() nicht mehr hinzufügen – dann über die Anmeldung prüfen
      expect(String(e.message)).toMatch(/already|after/i);
      const r = await p.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@y.de', password: 'falschfalsch' }, headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, remoteAddress: '172.18.0.5' });
      expect(r.statusCode).toBe(401);
      const act = p.ctx.db.prepare(`SELECT ip FROM activity ORDER BY id DESC LIMIT 1`).get() as any;
      if (act) expect(act.ip).toBe('203.0.113.7');
    } finally {
      await p.close();
    }
  });

  it('Test-API-Schlüssel sieht und ändert keine Live-Webhooks', async () => {
    const live = await admin.post('/api/v1/webhooks', { url: 'https://hooks.example.org/live', events: ['*'], mode: 'live' }).catch(() => null);
    // DNS kann im Test fehlen – dann direkt anlegen
    let liveId = live?.json?.id as string | undefined;
    if (!liveId) {
      liveId = 'wh_livetest';
      s.ctx.db.prepare(`INSERT INTO webhooks (id, org_id, url, events, secret_enc, description, mode, created_at) VALUES (?, (SELECT id FROM orgs LIMIT 1), 'https://hooks.example.org/live', '["*"]', 'x', '', 'live', ?)`).run(liveId, new Date().toISOString());
    }
    const tk = await admin.post('/api/v1/api-keys', { name: 'Sandbox', scopes: ['webhooks:manage'], mode: 'test' });
    const test = new Client(s, tk.json.key);
    const list = await test.get('/api/v1/webhooks');
    expect(list.json.data.some((h: any) => h.id === liveId)).toBe(false);
    expect((await test.patch(`/api/v1/webhooks/${liveId}`, { url: 'https://evil.example.org/x' })).status).toBe(404);
    expect((await test.del(`/api/v1/webhooks/${liveId}`)).status).toBe(404);
    expect((await test.post(`/api/v1/webhooks/${liveId}/test`)).status).toBe(404);
  });

  it('Formelfeld einer Person, die schon unterschrieben hat, ändert sich durch spätere Eingaben nicht', async () => {
    const e = await envelope('Formel', [{ ref: 'a', name: 'Anna', email: 'anna-f@example.org' }, { ref: 'b', name: 'Ben', email: 'ben-f@example.org' }], (r) => [
      { type: 'signature', document: 0, recipient: r.a, page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.06 },
      { type: 'formula', key: 'summe', document: 0, recipient: r.a, page: 0, x: 0.5, y: 0.1, w: 0.2, h: 0.03, config: { formula: '{betrag} * 2', decimals: 2 } },
      { type: 'signature', document: 0, recipient: r.b, page: 0, x: 0.1, y: 0.3, w: 0.3, h: 0.06 },
      { type: 'number', key: 'betrag', document: 0, recipient: r.b, page: 0, x: 0.5, y: 0.3, w: 0.2, h: 0.03, required: false },
    ]);
    const sign = async (email: string, values: Record<string, string>) => {
      const sg = new Signer(s);
      const view = (await sg.open(lastMail(s, email)!.link!)).json.view;
      const sigKey = view.fields.find((f: any) => f.mine && f.type === 'signature').key;
      const sig = (await sg.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() })).json.id;
      return sg.req('POST', '/api/sign/complete', { values, signatures: { [sigKey]: sig }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: view.documents.map((d: any) => d.sha256), completion_key: 'ck_' + Math.random().toString(36).slice(2, 10) });
    };
    expect((await sign('anna-f@example.org', {})).status).toBe(200);
    const before = (s.ctx.db.prepare(`SELECT value FROM fields WHERE envelope_id = ? AND key = 'summe'`).get(e.id) as any).value;
    expect((await sign('ben-f@example.org', { betrag: '50000' })).status).toBe(200);
    const after = (s.ctx.db.prepare(`SELECT value FROM fields WHERE envelope_id = ? AND key = 'summe'`).get(e.id) as any).value;
    expect(after).toBe(before);
    await jobs(s);
    expect((await admin.get(`/api/v1/envelopes/${e.id}`)).json.status).toBe('completed');
  });

  it('PNG-Dekompressionsbombe wird vor dem Dekodieren abgewiesen', () => {
    const big = new PNG({ width: 20000, height: 20000 });
    // Nur den Kopf erzeugen: IHDR mit riesigen Abmessungen, der Rest ist egal
    const head = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
    head.writeUInt32BE(13, 8);
    head.write('IHDR', 12, 'latin1');
    head.writeUInt32BE(20000, 16);
    head.writeUInt32BE(20000, 20);
    void big;
    expect(() => sanitizePng(head)).toThrow(/Bildgröße/);
  });

  it('„Neuer Link“ beendet auch bereits geöffnete Signatursitzungen', async () => {
    const e = await envelope('Sitzungswiderruf', [{ ref: 'a', name: 'Cleo', email: 'cleo@example.org' }], (r) => [{ type: 'signature', document: 0, recipient: r.a, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
    const sg = new Signer(s);
    await sg.open(lastMail(s, 'cleo@example.org')!.link!);
    expect((await sg.req('GET', '/api/sign/view')).status).toBe(200);
    expect((await admin.post(`/api/v1/envelopes/${e.id}/recipients/${e.refs.a}/link`)).status).toBe(200);
    expect((await sg.req('GET', '/api/sign/view')).status).toBe(401);
  });

  it('API-Schlüssel einer entfernten Person verlieren ihre Wirkung', async () => {
    const inv = await admin.post('/api/v1/members/invite', { email: 'kurzzeit@kanzlei.test', role: 'admin' });
    expect(inv.status).toBeLessThan(300);
    const link = lastMail(s, 'kurzzeit@kanzlei.test')!.link!;
    const c = new Client(s);
    expect((await c.post(`/api/auth/invite/${link.split('/invite/')[1]}/accept`, { name: 'Kurz Zeit', password: 'sehr-sicheres-passwort-2' })).status).toBe(200);
    await c.refreshCsrf();
    const key = await c.post('/api/v1/api-keys', { name: 'Privat', scopes: ['envelopes:read'], mode: 'live' });
    const k = new Client(s, key.json.key);
    expect((await k.get('/api/v1/envelopes')).status).toBe(200);
    const uid = (s.ctx.db.prepare(`SELECT id FROM users WHERE email = 'kurzzeit@kanzlei.test'`).get() as any).id;
    expect((await admin.del(`/api/v1/members/${uid}`)).status).toBe(200);
    expect((await k.get('/api/v1/envelopes')).status).toBe(401);
  });
});

describe('Betrieb: Diagnose, Metriken, Benutzerverwaltung', () => {
  it('Diagnose liefert verständliche Prüfpunkte; fehlendes SMTP ist ein Fehler, fehlender Zeitstempeldienst ein Hinweis', async () => {
    const r = await admin.post('/api/v1/system/diagnose');
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.json.checks.map((c: any) => [c.id, c]));
    expect(byId.smtp.status).toBe('fail');
    expect(byId.tsa.status).toBe('warn');
    expect(byId.seal.detail).toMatch(/kein qualifiziertes Siegel/);
    expect(byId.audit_chains.status).toBe('ok');
    expect(byId.storage_probe.status).toBe('ok');
    expect(byId.db_integrity.status).toBe('ok');
  });

  it('Metriken nur mit Token, ohne personenbezogene Daten', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer falsch' } })).statusCode).toBe(404);
    const m = await s.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer metrics-geheim-123' } });
    expect(m.statusCode).toBe(200);
    expect(m.body).toContain('paraph_up 1');
    expect(m.body).toContain('paraph_envelopes{state="completed"}');
    expect(m.body).not.toMatch(/@example\.org/);
  });

  it('Instanz-Administration: sperren beendet Sitzungen; letzte Administration bleibt geschützt', async () => {
    const users = (await admin.get('/api/v1/admin/users')).json.data;
    const me = users.find((u: any) => u.email === 'admin@kanzlei.test');
    expect((await admin.patch(`/api/v1/admin/users/${me.id}`, { disabled: true })).status).toBe(409);
    expect((await admin.patch(`/api/v1/admin/users/${me.id}`, { instance_admin: false })).status).toBe(409);
    await admin.post('/api/v1/members/invite', { email: 'sperr@kanzlei.test', role: 'member' });
    const c = new Client(s);
    await c.post(`/api/auth/invite/${lastMail(s, 'sperr@kanzlei.test')!.link!.split('/invite/')[1]}/accept`, { name: 'Sperr Konto', password: 'sehr-sicheres-passwort-3' });
    await c.refreshCsrf();
    expect((await c.get('/api/v1/envelopes')).status).toBe(200);
    const uid = (await admin.get('/api/v1/admin/users')).json.data.find((u: any) => u.email === 'sperr@kanzlei.test').id;
    expect((await admin.patch(`/api/v1/admin/users/${uid}`, { disabled: true })).status).toBe(200);
    expect((await c.get('/api/v1/envelopes')).status).toBe(401);
    expect((await c.post('/api/auth/login', { email: 'sperr@kanzlei.test', password: 'sehr-sicheres-passwort-3' })).status).toBe(401);
    // Nicht-Administratoren haben keinen Zugriff
    expect((await new Client(s).get('/api/v1/admin/users')).status).toBe(401);
    const link = await admin.post(`/api/v1/admin/users/${me.id}/reset-link`);
    expect(link.json.url).toMatch(/\/reset\//);
  });
});

describe('Update-Fähigkeit', () => {
  it('Vor einer Migration entsteht eine Kopie; eine neuere Datenbank startet nicht mit älterem Programm', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paraph-mig-'));
    const db = new Database(join(dir, 'paraph.db'));
    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);`);
    // Stand „Version 0.1.0“: nur die ersten beiden Migrationen
    for (const m of migrations.slice(0, 2)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
    }
    db.close();
    const up = openDb(dir);
    expect((up.prepare('SELECT MAX(id) AS v FROM schema_migrations').get() as any).v).toBe(Math.max(...migrations.map((m) => m.id)));
    expect(readdirSync(join(dir, 'backups', 'migrations')).some((f) => f.startsWith('pre-migration-schema2-'))).toBe(true);
    up.prepare('INSERT INTO schema_migrations VALUES (999, ?, ?)').run('zukunft', new Date().toISOString());
    expect(() => migrate(up)).toThrow(/neueren Paraph-Version/);
    up.close();
  });
});

// ───────────── SMTP ─────────────

/** Minimaler SMTP-Server: lehnt Empfänger „unbekannt@…“ dauerhaft ab, „voll@…“ vorübergehend. Kein STARTTLS. */
function smtpStub(): Promise<{ port: number; received: string[]; close: () => Promise<void> }> {
  const received: string[] = [];
  return new Promise((resolve) => {
    const srv: Server = createServer((sock: Socket) => {
      let data = false;
      let buf = '';
      sock.write('220 stub ESMTP\r\n');
      sock.on('data', (chunk) => {
        buf += chunk.toString('latin1');
        let i: number;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (data) {
            if (line === '.') {
              data = false;
              sock.write('250 2.0.0 queued as STUB\r\n');
            } else received.push(line);
            continue;
          }
          const cmd = line.toUpperCase();
          if (cmd.startsWith('EHLO')) sock.write('250-stub\r\n250 AUTH PLAIN LOGIN\r\n');
          else if (cmd.startsWith('HELO')) sock.write('250 stub\r\n');
          else if (cmd.startsWith('AUTH')) sock.write(line.includes('ZmFsc2') ? '535 5.7.8 Authentication failed\r\n' : '235 ok\r\n');
          else if (cmd.startsWith('MAIL FROM')) sock.write('250 ok\r\n');
          else if (cmd.startsWith('RCPT TO')) sock.write(/UNBEKANNT@/.test(cmd) ? '550 5.1.1 <unbekannt@example.org>: user unknown\r\n' : /VOLL@/.test(cmd) ? '452 4.2.2 mailbox full\r\n' : '250 ok\r\n');
          else if (cmd === 'DATA') {
            data = true;
            sock.write('354 go\r\n');
          } else if (cmd === 'QUIT') sock.end('221 bye\r\n');
          else if (cmd === 'RSET' || cmd === 'NOOP') sock.write('250 ok\r\n');
          else sock.write('502 unknown\r\n');
        }
      });
      sock.on('error', () => {});
    });
    srv.listen(0, '127.0.0.1', () => resolve({ port: (srv.address() as any).port, received, close: () => new Promise((r) => srv.close(() => r())) }));
  });
}

describe('SMTP: Zustellung und Fehlerbehandlung (lokaler SMTP-Stub, kein externer Versand)', () => {
  it('Nicht-lokale Server werden nur verschlüsselt angesprochen; deaktivierte Zertifikatsprüfung wird abgelehnt', () => {
    expect(smtpTransportOptions('smtp://u:p@smtp.example.org:587', false).requireTLS).toBe(true);
    expect(smtpTransportOptions('smtps://u:p@smtp.example.org:465', false).requireTLS).toBe(false);
    expect(smtpTransportOptions('smtp://mailpit:1025', false).requireTLS).toBe(false);
    expect(() => smtpTransportOptions('smtp://u:p@smtp.example.org:587?tls.rejectUnauthorized=false', false)).toThrow(/Zertifikatsprüfung/);
  });

  it('Produktiver Transportweg übernimmt requireTLS, Pool und Timeouts (Regression: Optionen gingen verloren)', () => {
    const t = createSmtpTransport('smtp://u:p@smtp.example.org:587', { allowInsecure: false }) as any;
    expect(t.options.requireTLS).toBe(true);
    expect(t.options.host).toBe('smtp.example.org');
    expect(t.options.connectionTimeout).toBe(15_000);
    expect(t.options.tls.minVersion).toBe('TLSv1.2');
    t.close();
  });

  it('Server ohne STARTTLS wird bei erzwungenem TLS abgewiesen (keine Klartext-Übertragung)', async () => {
    const stub = await smtpStub();
    try {
      // Derselbe Fabrikweg wie im Betrieb; forceTls simuliert einen nicht lokalen Server (der Stub läuft auf 127.0.0.1)
      const t = createSmtpTransport(`smtp://127.0.0.1:${stub.port}`, { forceTls: true });
      const err = await t.sendMail({ from: 'a@b.de', to: 'x@example.org', subject: 's', text: 't' }).catch((e) => e);
      expect(classifyMailError(err).code).toBe('tls');
      expect(stub.received).toEqual([]);
    } finally {
      await stub.close();
    }
  });

  it('Dauerhaft abgelehnte Adresse: kein achtfacher Versuch, Audit-Eintrag, Benachrichtigung, Anzeige im Vorgang', async () => {
    const stub = await smtpStub();
    const m = await startTestServer({ smtp: { url: `smtp://127.0.0.1:${stub.port}`, from: 'Kanzlei <sign@kanzlei.test>' } });
    try {
      const a = await setupAdmin(m, 'chef@kanzlei.test');
      const env = await a.post('/api/v1/envelopes', { title: 'Zustellfehler' });
      await a.upload(`/api/v1/envelopes/${env.json.id}/documents`, 'v.pdf', await makePdf());
      const recs = await a.put(`/api/v1/envelopes/${env.json.id}/recipients`, [{ ref: 'x', name: 'Unbekannt', email: 'unbekannt@example.org' }, { ref: 'y', name: 'Voll', email: 'voll@example.org' }]);
      await a.put(`/api/v1/envelopes/${env.json.id}/fields`, [
        { type: 'signature', document: 0, recipient: recs.json.refs.x, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
        { type: 'signature', document: 0, recipient: recs.json.refs.y, page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 },
      ]);
      await a.post(`/api/v1/envelopes/${env.json.id}/send`);
      await jobs(m);
      const mails = m.ctx.db.prepare(`SELECT to_addr, status, attempts, last_error, kind FROM emails ORDER BY created_at`).all() as any[];
      const bad = mails.find((x) => x.to_addr === 'unbekannt@example.org');
      expect(bad).toMatchObject({ status: 'failed', attempts: 1 });
      expect(bad.last_error).toMatch(/Empfängeradresse abgelehnt \(550\)/);
      const full = mails.find((x) => x.to_addr === 'voll@example.org');
      expect(full.status).toBe('queued'); // vorübergehend → Wiederholung geplant
      expect(full.last_error).toMatch(/Vorübergehend/);
      expect(listAudit(m.ctx.db, env.json.id).some((e) => e.type === 'recipient.delivery_failed')).toBe(true);
      // Versendende Person erhält eine Benachrichtigung (über den Stub zugestellt)
      expect(mails.some((x) => x.to_addr === 'chef@kanzlei.test' && x.kind === 'delivery_failed')).toBe(true);
      expect(stub.received.join('\n')).toMatch(/Zustellung fehlgeschlagen/);
      const view = (await a.get(`/api/v1/envelopes/${env.json.id}`)).json;
      expect(view.recipients.find((r: any) => r.email === 'unbekannt@example.org').delivery).toMatchObject({ status: 'failed' });
      // Erfolgreicher Versand verwirft den Inhalt (Signaturlink) aus der Datenbank
      const sent = m.ctx.db.prepare(`SELECT text_body FROM emails WHERE status = 'sent'`).all() as any[];
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((x) => x.text_body === '')).toBe(true);
      // Test-E-Mail der Administration
      const tm = await a.post('/api/v1/system/test-mail', { to: 'it@kanzlei.test' });
      expect(tm.json.ok).toBe(true);
    } finally {
      await m.close();
      await stub.close();
    }
  });

  it('Fehlerklassen sind verständlich und enthalten keine Zugangsdaten', () => {
    expect(classifyMailError({ code: 'EAUTH', responseCode: 535 }).message).toMatch(/Anmeldung am Mailserver/);
    expect(classifyMailError({ code: 'ECONNECTION', message: 'connect ECONNREFUSED' }).permanent).toBe(false);
    expect(classifyMailError({ code: 'EENVELOPE', responseCode: 554, response: '554 5.7.1 rejected by DMARC policy' }).code).toBe('policy');
    expect(classifyMailError({ message: 'Invalid login smtp://user:secret@host' }).message).not.toContain('secret');
  });
});

describe('Zweite Abnahme: Weiterleitung nach Anmeldung', () => {
  it('nur interne Pfade, keine Steuerzeichen/Backslashes/fremden Ziele', async () => {
    const { safeNextPath } = await import('../src/server/routes/auth.js');
    const A = 'https://sign.kanzlei.example';
    expect(safeNextPath(A, '/envelopes/env_1?x=1')).toBe('/envelopes/env_1?x=1');
    for (const bad of ['/\t/evil.example', '//evil.example', '/\\evil.example', 'https://evil.example', '/%09/evil', '\n/x']) {
      const r = safeNextPath(A, bad);
      expect(new URL(r, A).origin).toBe(A);
      expect(r.startsWith('//')).toBe(false);
    }
    expect(safeNextPath(A, '/\t/evil.example')).toBe('/');
  });
});
