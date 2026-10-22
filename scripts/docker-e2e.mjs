// Docker-Gesamtprüfung: Test I (Neustart ohne Datenverlust) und Test J (Sicherung → frische Umgebung).
// Aufruf: node scripts/docker-e2e.mjs   (benötigt Docker, Mailpit-Overlay, Port 18080/18081 frei)
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import yazl from 'yazl';

const sh = (c, env = {}) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }).toString(); } catch (e) { throw new Error(`Befehl fehlgeschlagen: ${c}\n${e.stderr?.toString() ?? ''}${e.stdout?.toString() ?? ''}`); } };
const log = (...a) => console.log('•', ...a);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const WORK = '.tmp/docker-e2e';
rmSync(WORK, { recursive: true, force: true });
mkdirSync(`${WORK}/backups`, { recursive: true });
mkdirSync('secrets', { recursive: true });
if (!existsSync('secrets/master.key')) sh(`openssl rand -base64 32 > secrets/master.key`);

const compose = (project, port) => {
  writeFileSync(`${WORK}/${project}.env`, `APP_URL=http://localhost:${port}\nSETUP_CODE=docker-e2e\nSMTP_URL=smtp://mailpit:1025\nMAIL_FROM="Paraph <p@test.local>"\nBACKUP_INTERVAL_HOURS=0\nLOG_LEVEL=warn\n`);
  const env = { HOST_PORT: String(port), BACKUP_PATH: `${process.cwd()}/${WORK}/backups`, PARAPH_ENV_FILE: `${process.cwd()}/${WORK}/${project}.env`, MAILPIT_PORT: String(port + 100) };
  const base = `docker compose -p ${project} --env-file ${WORK}/${project}.env -f docker-compose.yml -f docker-compose.test.yml`;
  return {
    run: (args) => sh(`${base} ${args}`, env),
    env,
    url: `http://localhost:${port}`,
  };
};

async function waitHealthy(url) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${url}/api/health/ready`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} wird nicht bereit`);
}

class Http {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, headers = {}) {
    const h = { origin: this.base, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    if (body && !(body instanceof FormData)) h['content-type'] = 'application/json';
    const r = await fetch(this.base + path, { method, headers: h, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc && /paraph_session=([^;]+)/.test(sc)) this.cookie = `paraph_session=${/paraph_session=([^;]+)/.exec(sc)[1]}`;
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, json: ct.includes('json') ? await r.json() : null, buf: ct.includes('json') ? null : Buffer.from(await r.arrayBuffer()) };
  }
  async login(email, password) {
    await this.req('POST', '/api/auth/login', { email, password });
    this.csrf = (await this.req('GET', '/api/auth/state')).json.session.csrf;
  }
}

function minimalDocx(text) {
  return new Promise((resolve) => {
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`), '[Content_Types].xml');
    z.addBuffer(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`), '_rels/.rels');
    const paras = text.split('\n').map((l) => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`).join('');
    z.addBuffer(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`), 'word/document.xml');
    z.end();
    const c = [];
    z.outputStream.on('data', (d) => c.push(d)).on('end', () => resolve(Buffer.concat(c)));
  });
}

const A = compose('paraph-e2e-a', 18080);
const B = compose('paraph-e2e-b', 18081);
const results = {};
try {
  for (const c of [A, B]) { try { c.run('down -v --remove-orphans'); } catch {} }
  log('Starte Umgebung A …');
  A.run('up -d --wait');
  await waitHealthy(A.url);

  const admin = new Http(A.url);
  let r = await admin.req('POST', '/api/auth/setup', { code: 'docker-e2e', orgName: 'Kanzlei Docker', name: 'Dora Docker', email: 'dora@kanzlei.test', password: 'docker-passwort-123' });
  if (r.status !== 200) throw new Error('Setup: ' + JSON.stringify(r.json));
  admin.csrf = (await admin.req('GET', '/api/auth/state')).json.session.csrf;

  // DOCX → PDF über Gotenberg
  const docx = await minimalDocx('Mandatsvereinbarung\nZwischen Kanzlei Docker und Mandant\n\nUnterschrift: ______________________');
  const env = (await admin.req('POST', '/api/v1/envelopes', { title: 'Docker-Prüfung' })).json;
  const fd = new FormData();
  fd.append('file', new Blob([docx]), 'Mandat.docx');
  r = await admin.req('POST', `/api/v1/envelopes/${env.id}/documents`, fd);
  if (r.status !== 201) throw new Error('DOCX-Upload: ' + JSON.stringify(r.json));
  results.docx = { pages: r.json.pages.length, kind: 'docx→pdf', field_suggestions: r.json.field_suggestions.length };
  log('DOCX umgewandelt:', results.docx);
  const recs = (await admin.req('PUT', `/api/v1/envelopes/${env.id}/recipients`, [{ ref: 'm', name: 'Max Muster', email: 'max@example.org' }])).json;
  await admin.req('PUT', `/api/v1/envelopes/${env.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.refs.m, page: 0, x: 0.1, y: 0.4, w: 0.3, h: 0.06 }]);
  r = await admin.req('POST', `/api/v1/envelopes/${env.id}/send`, { notify: false });
  const link = r.json.signing_links[0].url;
  // Unterzeichnen
  const token = link.split('/s/')[1];
  const open = await (await fetch(`${A.url}/api/sign/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const S = { 'x-signer-session': open.session, 'content-type': 'application/json' };
  const png = sh(`node -e "const {PNG}=require('pngjs');const p=new PNG({width:300,height:80});for(let x=10;x<290;x++){const y=40+Math.round(Math.sin(x/15)*20);for(let d=-2;d<=2;d++){const i=((y+d)*300+x)*4;p.data[i+3]=255;p.data[i+2]=120}}process.stdout.write(PNG.sync.write(p).toString('base64'))"`);
  const sig = await (await fetch(`${A.url}/api/sign/signatures`, { method: 'POST', headers: S, body: JSON.stringify({ purpose: 'signature', method: 'drawn', png_base64: png }) })).json();
  const key = open.view.fields.find((f) => f.mine).key;
  const comp = await fetch(`${A.url}/api/sign/complete`, { method: 'POST', headers: S, body: JSON.stringify({ values: {}, signatures: { [key]: sig.id }, consent: { accepted: true, version: open.view.consent.version }, document_hashes: open.view.documents.map((d) => d.sha256), completion_key: 'ck_docker_1' }) });
  if (!comp.ok) throw new Error('Abschluss: ' + (await comp.text()));
  let final;
  for (let i = 0; i < 30; i++) {
    final = (await admin.req('GET', `/api/v1/envelopes/${env.id}`)).json;
    if (final.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (final.status !== 'completed') throw new Error('nicht abgeschlossen');
  const pdfBefore = (await admin.req('GET', `/api/v1/envelopes/${env.id}/files/final`)).buf;
  results.before = { status: final.status, final_sha256: final.result.final_sha256, download_sha256: sha(pdfBefore) };
  log('Abgeschlossen:', results.before.final_sha256.slice(0, 16));

  // TEST I: kompletter Neustart der Container
  log('TEST I: docker compose down && up …');
  A.run('down');
  A.run('up -d --wait');
  await waitHealthy(A.url);
  const again = new Http(A.url);
  await again.login('dora@kanzlei.test', 'docker-passwort-123');
  const after = (await again.req('GET', `/api/v1/envelopes/${env.id}`)).json;
  const pdfAfter = (await again.req('GET', `/api/v1/envelopes/${env.id}/files/final`)).buf;
  const auditAfter = (await again.req('GET', `/api/v1/envelopes/${env.id}/audit`)).json;
  results.I = { status: after.status, same_hash: sha(pdfAfter) === results.before.download_sha256, chain_ok: auditAfter.chain.ok, events: auditAfter.chain.count };
  log('TEST I:', results.I);
  if (!results.I.same_hash || !results.I.chain_ok || after.status !== 'completed') throw new Error('TEST I fehlgeschlagen');

  // TEST J: Sicherung → frische Umgebung B
  log('TEST J: Sicherung erstellen …');
  console.log(A.run('exec -T paraph paraph backup').trim());
  const file = readdirSync(`${WORK}/backups`).filter((f) => f.endsWith('.zip')).sort().pop();
  console.log(A.run(`exec -T paraph paraph verify-backup /backups/${file}`).trim());
  log('Umgebung B: leeres Volume, Wiederherstellung …');
  B.run(`run --rm --no-deps paraph paraph restore /backups/${file}`);
  B.run('up -d --wait');
  await waitHealthy(B.url);
  const restored = new Http(B.url);
  await restored.login('dora@kanzlei.test', 'docker-passwort-123');
  const envB = (await restored.req('GET', `/api/v1/envelopes/${env.id}`)).json;
  const pdfB = (await restored.req('GET', `/api/v1/envelopes/${env.id}/files/final`)).buf;
  const evidenceB = await restored.req('GET', `/api/v1/envelopes/${env.id}/files/evidence`);
  const auditB = (await restored.req('GET', `/api/v1/envelopes/${env.id}/audit`)).json;
  results.J = { status: envB.status, same_hash: sha(pdfB) === results.before.download_sha256, evidence: evidenceB.status, chain_ok: auditB.chain.ok, events: auditB.chain.count };
  log('TEST J:', results.J);
  if (!results.J.same_hash || !results.J.chain_ok || results.J.evidence !== 200) throw new Error('TEST J fehlgeschlagen');
  // Container-Härtung nachweisen
  results.hardening = {
    user: A.run('exec -T paraph id -u').trim(),
    readonly_root: A.run(`exec -T paraph sh -c "touch /app/x 2>&1 || echo readonly"`).trim().includes('readonly') || A.run(`exec -T paraph sh -c "touch /app/x 2>&1; echo $?"`).includes('Read-only'),
  };
  log('Härtung:', results.hardening);
  writeFileSync(`${WORK}/result.json`, JSON.stringify(results, null, 2));
  log('ALLE DOCKER-PRÜFUNGEN BESTANDEN');
} finally {
  if (!process.env.KEEP) {
    for (const c of [A, B]) { try { c.run('down -v --remove-orphans'); } catch {} }
  }
}
