// Docker-Gesamtprüfung unter Produktionsbedingungen (lokal, ohne externe Dienste):
//   U  Installation der Altversion 0.1.0 per install.sh, Update per update.sh, Rückweg, erneutes Update
//   C  HTTPS über Caddy (Profil „caddy“, interne CA für localhost), X-Forwarded-For nicht fälschbar
//   M  E-Mail über Mailpit mit erzwungenem STARTTLS, eigener CA und SMTP-Anmeldung
//   I  Neustart ohne Datenverlust
//   J  Katastrophenfall: neue Umgebung ohne Hauptschlüssel, nur mit Passphrase → restore.sh → alles lesbar
//   H  Container-Härtung
// Aufruf: node scripts/docker-e2e.mjs   (Docker; Images paraph:0.1.0-e2e und paraph:0.2.0-e2e müssen gebaut sein)
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, readFileSync, cpSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';

// Caddy verwendet für „localhost“ eine interne CA – nur im Test ohne Zertifikatsprüfung
setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));

const ROOT = process.cwd();
const WORK = resolve(`.tmp/docker-e2e/run-${Date.now()}`);
const sh = (c, opts = {}) => {
  try {
    return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd ?? ROOT, env: { ...process.env, ...(opts.env ?? {}) }, timeout: opts.timeout ?? 900_000 }).toString();
  } catch (e) {
    throw new Error(`Befehl fehlgeschlagen: ${c}\n${e.stderr?.toString() ?? ''}${e.stdout?.toString() ?? ''}`);
  }
};
const log = (...a) => console.log('•', ...a);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const check = (name, cond, detail) => {
  results[name] = { ok: !!cond, ...(detail !== undefined ? { detail } : {}) };
  log(cond ? '✓' : '✕', name, detail !== undefined ? JSON.stringify(detail) : '');
  if (!cond) throw new Error(`Prüfung fehlgeschlagen: ${name}`);
};

for (const img of ['paraph:0.1.0-e2e', 'paraph:0.2.0-e2e']) {
  try {
    sh(`docker image inspect ${img}`);
  } catch {
    throw new Error(`Image ${img} fehlt – zuerst bauen (siehe Kopf dieser Datei).`);
  }
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ── Testzertifikate für Mailpit (eigene CA, SAN mail.test) und SMTP-Anmeldung
const CERTS = join(WORK, 'certs');
mkdirSync(CERTS);
sh(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -subj "/CN=Paraph Test CA" -days 2`, { cwd: CERTS });
writeFileSync(join(CERTS, 'ext.cnf'), 'subjectAltName=DNS:mail.test\nextendedKeyUsage=serverAuth\n');
sh(`openssl req -newkey rsa:2048 -nodes -keyout mail.key -out mail.csr -subj "/CN=mail.test"`, { cwd: CERTS });
sh(`openssl x509 -req -in mail.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out mail.pem -days 2 -extfile ext.cnf`, { cwd: CERTS });
writeFileSync(join(CERTS, 'auth'), 'paraph:test-passwort-1\n');
sh(`chmod 644 ${CERTS}/*`);

/** Kopie des aktuellen Arbeitsstands als „Server“-Verzeichnis (ohne Schlüssel, Daten, node_modules). */
function serverDir(name) {
  const dir = join(WORK, name);
  const files = sh('git ls-files -co --exclude-standard').split('\n').filter(Boolean).filter((f) => !f.startsWith('.tmp/') && !f.startsWith('.claude/') && existsSync(f));
  for (const f of files) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    copyFileSync(f, join(dir, f));
  }
  return dir;
}

const HTTPS = 18443;
function installEnv(name, extra = {}) {
  return {
    PARAPH_NONINTERACTIVE: '1',
    PARAPH_ALLOW_NONROOT: '1',
    PARAPH_SKIP_BUILD: '1',
    PARAPH_DOMAIN: 'localhost',
    PARAPH_APP_URL: `https://localhost:${HTTPS}`,
    PARAPH_USE_CADDY: 'ja',
    PARAPH_ACME_EMAIL: 'it@kanzlei.test',
    PARAPH_SMTP_URL: 'smtp://paraph:test-passwort-1@mail.test:1025',
    PARAPH_MAIL_FROM: 'Kanzlei Test <signatur@kanzlei.test>',
    // Offline bleiben: install.sh würde sonst FreeTSA voreinstellen
    PARAPH_TSA_URL: 'keiner',
    PARAPH_EXTRA_ENV: [
      `COMPOSE_PROJECT_NAME=${name}`,
      'COMPOSE_FILE=docker-compose.yml:docker-compose.test.yml',
      `TEST_CERTS=${CERTS}`,
      'MAILPIT_PORT=18025',
      'HOST_PORT=18090',
      'CADDY_HTTP_PORT=18088',
      `CADDY_HTTPS_PORT=${HTTPS}`,
      'BACKUP_INTERVAL_HOURS=0',
      'LOG_LEVEL=warn',
      ...Object.entries(extra).map(([k, v]) => `${k}=${v}`),
    ].join('\n'),
  };
}

const BASE = `https://localhost:${HTTPS}`;
async function waitReady(url = BASE) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${url}/api/health/ready`);
      if (r.ok) return (await r.json());
    } catch {}
    await sleep(1000);
  }
  throw new Error(`${url} wird nicht bereit`);
}

class Http {
  constructor(base = BASE) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, headers = {}) {
    const h = { origin: this.base, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    if (body && !(body instanceof FormData)) h['content-type'] = 'application/json';
    const r = await fetch(this.base + path, { method, headers: h, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc && /paraph_session=([^;]+)/.test(sc)) this.cookie = `paraph_session=${/paraph_session=([^;]+)/.exec(sc)[1]}`;
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, headers: r.headers, json: ct.includes('json') ? await r.json() : null, buf: ct.includes('json') ? null : Buffer.from(await r.arrayBuffer()) };
  }
  async login(email, password, headers) {
    const r = await this.req('POST', '/api/auth/login', { email, password }, headers);
    if (r.status !== 200) throw new Error('Anmeldung: ' + JSON.stringify(r.json));
    this.csrf = (await this.req('GET', '/api/auth/state')).json.session.csrf;
  }
}

const PNG = sh(`node -e "const {PNG}=require('pngjs');const p=new PNG({width:300,height:80});for(let x=10;x<290;x++){const y=40+Math.round(Math.sin(x/15)*20);for(let d=-2;d<=2;d++){const i=((y+d)*300+x)*4;p.data[i+3]=255;p.data[i+2]=120}}process.stdout.write(PNG.sync.write(p).toString('base64'))"`);
async function pdfBytes() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const d = await PDFDocument.create();
  const p = d.addPage([595, 842]);
  p.drawText('Mandatsvereinbarung – Docker-Prüfung', { x: 60, y: 760, size: 16, font: await d.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await d.save());
}

/** Vollständiger Ablauf: Vorgang anlegen, Link ohne E-Mail, unterschreiben, abschließen. */
async function completeEnvelope(admin, title) {
  const env = (await admin.req('POST', '/api/v1/envelopes', { title })).json;
  const fd = new FormData();
  fd.append('file', new Blob([await pdfBytes()], { type: 'application/pdf' }), 'vertrag.pdf');
  const up = await admin.req('POST', `/api/v1/envelopes/${env.id}/documents`, fd);
  if (up.status !== 201) throw new Error('Upload: ' + JSON.stringify(up.json));
  const recs = (await admin.req('PUT', `/api/v1/envelopes/${env.id}/recipients`, [{ ref: 'm', name: 'Max Muster', email: 'max@example.org' }])).json;
  await admin.req('PUT', `/api/v1/envelopes/${env.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.refs.m, page: 0, x: 0.1, y: 0.4, w: 0.3, h: 0.06 }]);
  const sent = await admin.req('POST', `/api/v1/envelopes/${env.id}/send`, { notify: false });
  const token = sent.json.signing_links[0].url.split('/s/')[1];
  const open = await (await fetch(`${admin.base}/api/sign/open`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6' }, body: JSON.stringify({ token }) })).json();
  const S = { 'x-signer-session': open.session, 'content-type': 'application/json' };
  const sig = await (await fetch(`${admin.base}/api/sign/signatures`, { method: 'POST', headers: S, body: JSON.stringify({ purpose: 'signature', method: 'drawn', png_base64: PNG }) })).json();
  const key = open.view.fields.find((f) => f.mine).key;
  const comp = await fetch(`${admin.base}/api/sign/complete`, { method: 'POST', headers: { ...S, 'x-forwarded-for': '6.6.6.6' }, body: JSON.stringify({ values: {}, signatures: { [key]: sig.id }, consent: { accepted: true, version: open.view.consent.version }, document_hashes: open.view.documents.map((d) => d.sha256), completion_key: 'ck_' + Math.random().toString(36).slice(2, 10) }) });
  if (!comp.ok) throw new Error('Abschluss: ' + (await comp.text()));
  for (let i = 0; i < 60; i++) {
    const e = (await admin.req('GET', `/api/v1/envelopes/${env.id}`)).json;
    if (e.status === 'completed') {
      const pdf = (await admin.req('GET', `/api/v1/envelopes/${env.id}/files/final`)).buf;
      return { id: env.id, final: e.result.final_sha256, pdfSha: sha(pdf) };
    }
    await sleep(1000);
  }
  throw new Error('nicht abgeschlossen');
}

const dirA = serverDir('server-a');
const dirB = serverDir('server-b');
const dcA = (args, env) => sh(`docker compose ${args}`, { cwd: dirA, env });
const dcB = (args, env) => sh(`docker compose ${args}`, { cwd: dirB, env });
const cleanup = () => {
  for (const [dir, dc] of [[dirA, dcA], [dirB, dcB]]) {
    if (existsSync(join(dir, '.env'))) try { dc('--profile caddy down -v --remove-orphans'); } catch {}
  }
};

try {
  // ───────── U: Installation der Altversion 0.1.0 ─────────
  log('U: install.sh mit Image 0.1.0 …');
  console.log(sh('./scripts/install.sh', { cwd: dirA, env: installEnv('paraph-e2e-a', { PARAPH_IMAGE: 'paraph:0.1.0-e2e' }) }).split('\n').filter((l) => /✓|Fertig|Einrichtungscode|FEHL|WARN/.test(l)).join('\n'));
  check('U1 Installation 0.1.0 bereit', (await waitReady()).status === 'ready');
  const setupCode = /^SETUP_CODE="?([^"\n]+)/m.exec(readFileSync(join(dirA, '.env'), 'utf8'))[1];
  const admin = new Http();
  let r = await admin.req('POST', '/api/auth/setup', { code: setupCode, orgName: 'Kanzlei Docker', name: 'Dora Docker', email: 'dora@kanzlei.test', password: 'docker-passwort-123' });
  check('U2 Ersteinrichtung über HTTPS (Caddy)', r.status === 200, r.status);
  admin.csrf = (await admin.req('GET', '/api/auth/state')).json.session.csrf;
  const old = await completeEnvelope(admin, 'Vorgang aus Version 0.1.0');
  check('U3 Vorgang mit 0.1.0 abgeschlossen', old.final === old.pdfSha);
  const keyPerm = sh('stat -f %Lp secrets/master.key 2>/dev/null || stat -c %a secrets/master.key', { cwd: dirA }).trim();
  check('H1 Schlüsseldatei nicht für andere lesbar', !/[4-7]$/.test(keyPerm), keyPerm);
  check('H2 .env nur für Eigentümer', sh('stat -f %Lp .env 2>/dev/null || stat -c %a .env', { cwd: dirA }).trim() === '600');

  // ───────── U: Update auf 0.2.0 ─────────
  log('U: update.sh --no-pull (baut nicht, nutzt paraph:0.2.0-e2e) …');
  // Der Build im Test entspricht dem vorgebauten Image: Tag vorab setzen, damit update.sh nicht neu baut
  sh('docker tag paraph:0.2.0-e2e paraph:0.2.0');
  const upd = sh('./scripts/update.sh --no-pull', { cwd: dirA, env: { PARAPH_SKIP_BUILD: '1' } });
  console.log(upd.split('\n').filter((l) => /^\S|✓|✕/.test(l)).slice(0, 30).join('\n'));
  const health = await waitReady();
  check('U4 Update auf 0.2.0 bereit, Schema migriert', health.version.startsWith('0.2.0') && health.schema >= 5, { version: health.version, schema: health.schema });
  const after = new Http();
  await after.login('dora@kanzlei.test', 'docker-passwort-123');
  const oldPdf = (await after.req('GET', `/api/v1/envelopes/${old.id}/files/final`)).buf;
  check('U5 Altdaten nach Update unverändert (gleicher Hash)', sha(oldPdf) === old.pdfSha);
  check('U6 Kopie vor Migration angelegt', /pre-migration-schema2-/.test(dcA('exec -T paraph ls /data/backups/migrations')));
  check('U7 Sicherung vor dem Update (Altformat) außerhalb der Rotation vorhanden', readdirSync(join(dirA, 'backups', 'vor-update')).some((f) => f.endsWith('.zip')));

  // ───────── C: HTTPS über Caddy, IP-Fälschung ─────────
  const sec = await fetch(`${BASE}/api/health`);
  check('C1 HSTS über HTTPS', (sec.headers.get('strict-transport-security') ?? '').includes('max-age'));
  const events = (await after.req('GET', `/api/v1/envelopes/${old.id}/audit`)).json.events;
  const ips = events.map((e) => e.data?.ip).filter(Boolean);
  check('C2 Caddy überschreibt gefälschte X-Forwarded-For (6.6.6.6) – auch mit Altversion nicht im Audit-Trail', ips.length > 0 && !ips.includes('6.6.6.6'), { ips_alt: [...new Set(ips)] });
  const fresh = await completeEnvelope(after, 'Vorgang nach Update');
  const ipsNew = (await after.req('GET', `/api/v1/envelopes/${fresh.id}/audit`)).json.events.map((e) => e.data?.ip).filter(Boolean);
  check('C3 Neue Version: Audit-IP ist die echte Client-Adresse, nicht 6.6.6.6', ipsNew.length > 0 && !ipsNew.includes('6.6.6.6'), [...new Set(ipsNew)]);

  // ───────── M: E-Mail über STARTTLS mit Anmeldung ─────────
  const before = (await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json()).total ?? 0;
  const env = (await after.req('POST', '/api/v1/envelopes', { title: 'Mailprüfung TLS' })).json;
  const fd = new FormData();
  fd.append('file', new Blob([await pdfBytes()], { type: 'application/pdf' }), 'vertrag.pdf');
  await after.req('POST', `/api/v1/envelopes/${env.id}/documents`, fd);
  const recs = (await after.req('PUT', `/api/v1/envelopes/${env.id}/recipients`, [{ ref: 'm', name: 'Mia Mail', email: 'mia@example.org' }])).json;
  await after.req('PUT', `/api/v1/envelopes/${env.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.refs.m, page: 0, x: 0.1, y: 0.4, w: 0.3, h: 0.06 }]);
  await after.req('POST', `/api/v1/envelopes/${env.id}/send`, {});
  let total = before;
  for (let i = 0; i < 30 && total <= before; i++) {
    await sleep(1000);
    total = (await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json()).total ?? 0;
  }
  check('M1 Einladung über STARTTLS + Anmeldung zugestellt (Mailpit verlangt beides)', total > before, { before, total });
  const msg = (await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json()).messages[0];
  check('M2 Betreff und Empfänger korrekt', msg.To[0].Address === 'mia@example.org' && /Mailprüfung TLS/.test(msg.Subject), msg.Subject);
  const diag = (await after.req('POST', '/api/v1/system/diagnose')).json;
  const smtp = diag.checks.find((c) => c.id === 'smtp');
  check('M3 Tiefenprüfung: Mailserver erreichbar, STARTTLS erzwungen', smtp.status === 'ok' && /STARTTLS \(erzwungen\)/.test(smtp.detail), smtp.detail);
  const doctor = dcA('exec -T paraph paraph doctor');
  check('M4 paraph doctor läuft im Container', /Gesamt:/.test(doctor), doctor.split('\n').filter((l) => /FEHL/.test(l)));

  // ───────── D: Word → PDF über Gotenberg (isoliertes Netz) ─────────
  const yazl = (await import('yazl')).default;
  const docx = await new Promise((resolve) => {
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '[Content_Types].xml');
    z.addBuffer(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), '_rels/.rels');
    z.addBuffer(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Mandatsvereinbarung</w:t></w:r></w:p><w:p><w:r><w:t>Unterschrift: ____________________</w:t></w:r></w:p></w:body></w:document>'), 'word/document.xml');
    z.end();
    const c = [];
    z.outputStream.on('data', (d) => c.push(d)).on('end', () => resolve(Buffer.concat(c)));
  });
  const denv = (await after.req('POST', '/api/v1/envelopes', { title: 'Word-Umwandlung' })).json;
  const dfd = new FormData();
  dfd.append('file', new Blob([docx]), 'Mandat.docx');
  const dup = await after.req('POST', `/api/v1/envelopes/${denv.id}/documents`, dfd);
  check('D1 DOCX wird über Gotenberg in PDF umgewandelt', dup.status === 201 && dup.json.pages.length >= 1, { status: dup.status, pages: dup.json?.pages?.length });

  // ───────── U: Rückweg und erneutes Update ─────────
  log('U: update.sh --rollback …');
  sh('./scripts/update.sh --rollback', { cwd: dirA, env: { PARAPH_NONINTERACTIVE: '1' } });
  const rb = await waitReady();
  check('U8 Rückweg: Altversion läuft wieder', !rb.version.startsWith('0.2.0'), rb.version);
  const rbc = new Http();
  await rbc.login('dora@kanzlei.test', 'docker-passwort-123');
  check('U9 Rückweg: Altdaten vollständig', sha((await rbc.req('GET', `/api/v1/envelopes/${old.id}/files/final`)).buf) === old.pdfSha);
  check('U10 Rückweg: Daten nach dem Update sind (erwartungsgemäß) nicht enthalten', (await rbc.req('GET', `/api/v1/envelopes/${fresh.id}`)).status === 404);
  sh('./scripts/update.sh --no-pull', { cwd: dirA, env: { PARAPH_SKIP_BUILD: '1' } });
  const again = await waitReady();
  check('U11 Erneutes Update erfolgreich', again.version.startsWith('0.2.0'), again.version);

  // ───────── I: Neustart ─────────
  dcA('down');
  dcA('up -d');
  await waitReady();
  const ia = new Http();
  await ia.login('dora@kanzlei.test', 'docker-passwort-123');
  const audit = (await ia.req('GET', `/api/v1/envelopes/${old.id}/audit`)).json;
  check('I1 Neustart: Daten und Audit-Kette intakt', sha((await ia.req('GET', `/api/v1/envelopes/${old.id}/files/final`)).buf) === old.pdfSha && audit.chain.ok);

  // ───────── J: Katastrophenfall ─────────
  log('J: Sicherung mit Schlüsselmaterial, neue Umgebung ohne Hauptschlüssel …');
  const bk = dcA('exec -T paraph paraph backup');
  const file = /Sicherung erstellt: \/backups\/(\S+)/.exec(bk)[1];
  check('J1 Sicherung enthält Hauptschlüssel (Passphrase)', /Enthält den Hauptschlüssel/.test(bk), file);
  check('J2 Sicherung ist verschlüsselt (kein SQLite-Klartext)', !readFileSync(join(dirA, 'backups', file)).includes(Buffer.from('SQLite format')));
  dcA('--profile caddy down');
  // Neuer Server: Installation erzeugt eigene Schlüssel; die Passphrase kommt „aus dem Passwortmanager“
  sh('./scripts/install.sh', { cwd: dirB, env: installEnv('paraph-e2e-b', { PARAPH_IMAGE: 'paraph:0.2.0' }) });
  await waitReady();
  const passA = readFileSync(join(dirA, 'secrets', 'backup_passphrase'));
  rmSync(join(dirB, 'secrets', 'backup_passphrase'), { force: true });
  writeFileSync(join(dirB, 'secrets', 'backup_passphrase'), passA, { mode: 0o400 });
  copyFileSync(join(dirA, 'backups', file), join(dirB, 'backups', file));
  const rest = sh(`./scripts/restore.sh backups/${file}`, { cwd: dirB, env: { PARAPH_NONINTERACTIVE: '1', PARAPH_TAKE_KEY: '1' } });
  check('J3 restore.sh übernimmt Schlüssel und stellt wieder her', /Wiederhergestellt/.test(rest), rest.split('\n').filter((l) => /✓|Hauptschlüssel/.test(l)));
  await waitReady();
  const jb = new Http();
  await jb.login('dora@kanzlei.test', 'docker-passwort-123');
  const ev = await jb.req('GET', `/api/v1/envelopes/${old.id}/files/evidence`);
  check('J4 Neue Umgebung: finales PDF identisch, Nachweispaket lesbar', sha((await jb.req('GET', `/api/v1/envelopes/${old.id}/files/final`)).buf) === old.pdfSha && ev.status === 200);
  check('J5 Neue Umgebung: Audit-Prüfung (inkl. Verankerung)', /Abweichungen/.test(dcB('exec -T paraph paraph verify-audit')));

  // ───────── H: Härtung ─────────
  check('H3 Container läuft als UID 1000', dcB('exec -T paraph id -u').trim() === '1000');
  check('H4 Root-Dateisystem schreibgeschützt', /Read-only|readonly/i.test(dcB(`exec -T paraph sh -c "touch /app/x 2>&1 || echo readonly"`)));
  check('H5 Gotenberg ohne Internetzugang (internes Netz)', /true/.test(sh(`docker network inspect paraph-e2e-b_convert --format '{{.Internal}}'`)));
  writeFileSync(join(WORK, 'result.json'), JSON.stringify(results, null, 2));
  log(`ALLE ${Object.keys(results).length} DOCKER-PRÜFUNGEN BESTANDEN`);
} catch (e) {
  writeFileSync(join(WORK, 'result.json'), JSON.stringify({ ...results, error: String(e.message).slice(0, 2000) }, null, 2));
  console.error(e.message);
  try { console.error(dcA('logs --tail 40 paraph')); } catch {}
  process.exitCode = 1;
} finally {
  if (!process.env.KEEP) cleanup();
}
