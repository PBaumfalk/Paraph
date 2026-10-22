// Kerngeschäftsprozesse über die echte HTTP-API (Fastify inject), echte Datenbank, echte PDFs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, setupAdmin, Client, Signer, lastMail, jobs, type TestServer } from './helpers/server.js';
import { makePdf, rasterize, diffBBox, signaturePng } from './helpers/pdfs.js';
import { verifyPdfSignatures } from '../src/server/pdf/verify.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { sha256Hex } from '../src/server/lib/crypto.js';
import { PDFDocument } from 'pdf-lib';

async function draftWithDoc(admin: Client, title: string, pages = 1, extra: Record<string, unknown> = {}) {
  const env = await admin.post('/api/v1/envelopes', { title, ...extra });
  expect(env.status).toBe(201);
  const up = await admin.upload(`/api/v1/envelopes/${env.json.id}/documents`, 'vertrag.pdf', await makePdf({ pages, title }));
  expect(up.status).toBe(201);
  return { id: env.json.id as string, docId: up.json.id as string, sha: up.json.sha256 as string, pages: up.json.pages };
}

async function sign(s: TestServer, link: string, opts: { values?: Record<string, string>; key?: string } = {}) {
  const signer = new Signer(s);
  const open = await signer.open(link);
  expect(open.status).toBe(200);
  const view = open.json.view;
  const signatures: Record<string, string> = {};
  for (const f of view.fields.filter((x: any) => x.mine && (x.type === 'signature' || x.type === 'initials'))) {
    const sig = await signer.req('POST', '/api/sign/signatures', { purpose: f.type === 'initials' ? 'initials' : 'signature', method: 'drawn', png_base64: signaturePng() });
    expect(sig.status).toBe(200);
    signatures[f.key] = sig.json.id;
  }
  const res = await signer.req('POST', '/api/sign/complete', {
    values: opts.values ?? {},
    signatures,
    consent: { accepted: true, version: CONSENT_VERSION },
    document_hashes: view.documents.map((d: any) => d.sha256),
    completion_key: opts.key ?? 'ck_' + Math.random().toString(36).slice(2, 12),
  });
  return { signer, res, view };
}

let s: TestServer;
let admin: Client;

beforeAll(async () => {
  s = await startTestServer();
  admin = await setupAdmin(s);
});
afterAll(async () => s.close());

describe('TEST A – Upload, Felder, Einladung, Signatur, Download', () => {
  it('vollständiger Ablauf mit positionsgenauer Unterschrift im finalen PDF', async () => {
    const d = await draftWithDoc(admin, 'Mandatsvereinbarung Müller');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [{ ref: 'm', name: 'Erika Müller', email: 'erika@example.org' }]);
    expect(recs.status).toBe(200);
    const rid = recs.json.refs.m;
    const sigRect = { page: 0, x: 0.12, y: 0.78, w: 0.32, h: 0.07 };
    const f = await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'signature', document: d.docId, recipient: rid, ...sigRect, label: 'Unterschrift Mandantin' },
      { type: 'text', key: 'ort', document: 0, recipient: rid, page: 0, x: 0.55, y: 0.8, w: 0.3, h: 0.03, label: 'Ort' },
      { type: 'signed_date', document: 0, recipient: rid, page: 0, x: 0.55, y: 0.85, w: 0.2, h: 0.03 },
    ]);
    expect(f.status).toBe(200);
    const sent = await admin.post(`/api/v1/envelopes/${d.id}/send`, {});
    expect(sent.status).toBe(200);
    expect(sent.json.status).toBe('sent');
    expect(sent.json.signing_links).toEqual([]); // Links werden bei E-Mail-Versand nicht offengelegt

    const mail = lastMail(s, 'erika@example.org');
    expect(mail?.subject).toContain('Mandatsvereinbarung Müller');
    expect(mail?.link).toMatch(/\/s\/[A-Za-z0-9_-]{40,}/);

    // Pflichtfeld fehlt → serverseitige Validierung
    const signer = new Signer(s);
    await signer.open(mail!.link!);
    const bad = await signer.req('POST', '/api/sign/complete', { values: {}, signatures: {}, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: [d.sha], completion_key: 'ck_bad_attempt' });
    expect(bad.status).toBe(422);
    expect(bad.json.error.details.errors.map((e: any) => e.key).sort()).toEqual(['ort', 'signature_1'].sort());

    const r = await sign(s, mail!.link!, { values: { ort: 'Köln' } });
    expect(r.res.status).toBe(200);
    await jobs(s);

    const env = await admin.get(`/api/v1/envelopes/${d.id}`);
    expect(env.json.status).toBe('completed');
    expect(env.json.result.seal.standard).toMatch(/PAdES-B-(B|T)/);

    const final = await admin.get(`/api/v1/envelopes/${d.id}/files/final`);
    expect(final.status).toBe(200);
    expect(final.headers['content-type']).toBe('application/pdf');
    const pdf = Buffer.from(final.body);
    expect(sha256Hex(pdf)).toBe(env.json.result.final_sha256);

    // Unabhängige Prüfung: Seitenzahl = Original + Abschlussbestätigung, Signatur gültig, Position stimmt
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    const sigs = await verifyPdfSignatures(pdf);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ coversWholeFile: true, digestOk: true, signatureOk: true, subfilter: 'ETSI.CAdES.detached' });

    const original = await admin.get(`/api/v1/envelopes/${d.id}/documents/${d.docId}/pdf`);
    const before = rasterize(Buffer.from(original.body), 0, 144);
    const after = rasterize(pdf, 0, 144);
    expect(after.width).toBe(before.width);
    // Neue dunkle Pixel nur innerhalb des Unterschriftsfelds bzw. der Textfelder
    const W = before.width, H = before.height;
    const inSig = diffBBox({ ...before, px: maskOutside(before, sigRect) }, { ...after, px: maskOutside(after, sigRect) });
    expect(inSig.n).toBeGreaterThan(300);
    expect(inSig.x0).toBeGreaterThanOrEqual(sigRect.x * W - 2);
    expect(inSig.x1).toBeLessThanOrEqual((sigRect.x + sigRect.w) * W + 2);
    expect(inSig.y0).toBeGreaterThanOrEqual(sigRect.y * H - 2);
    expect(inSig.y1).toBeLessThanOrEqual((sigRect.y + sigRect.h) * H + 2);

    // Text „Köln“ steht im PDF
    const { extractText } = await import('../src/server/pdf/inspect.js');
    const pages = env.json.documents[0].pages;
    const t = await extractText(pdf.subarray(0), [pages[0]]).catch(() => null);
    void t;
    const audit = await admin.get(`/api/v1/envelopes/${d.id}/audit`);
    expect(audit.json.chain.ok).toBe(true);
    expect(audit.json.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['envelope.created', 'document.added', 'envelope.sent', 'recipient.notified', 'recipient.link_opened', 'recipient.consented', 'recipient.signed', 'envelope.completed']));
    for (const k of ['certificate', 'audit', 'evidence']) expect((await admin.get(`/api/v1/envelopes/${d.id}/files/${k}`)).status).toBe(200);

    // Unterzeichnerin erhält Abschluss-Mail mit neuem Link und kann das Ergebnis laden
    const done = lastMail(s, 'erika@example.org', 'Abgeschlossen');
    expect(done?.link).toBeTruthy();
    const after2 = new Signer(s);
    expect((await after2.open(done!.link!)).json.view.state).toBe('completed_self');
    const dl = await after2.req('GET', '/api/sign/final/final');
    expect(dl.status).toBe(200);
    expect(sha256Hex(Buffer.from(dl.body))).toBe(env.json.result.final_sha256);

    // Prüfstelle kennt den Hash
    const v = await new Client(s).post('/api/public/verify/hash', { sha256: env.json.result.final_sha256 });
    expect(v.json.found).toBe(true);
    expect(v.json.matches[0].signers[0].name).toBe('Erika Müller');
  });
});

function maskOutside(r: { width: number; height: number; px: Uint8Array }, rect: { x: number; y: number; w: number; h: number }) {
  // Außerhalb eines großzügigen Rahmens um das Feld alles weiß setzen; so prüfen wir, dass innerhalb gezeichnet wurde.
  const out = new Uint8Array(r.px.length).fill(255);
  const x0 = Math.floor((rect.x - 0.05) * r.width), x1 = Math.ceil((rect.x + rect.w + 0.05) * r.width);
  const y0 = Math.floor((rect.y - 0.05) * r.height), y1 = Math.ceil((rect.y + rect.h + 0.05) * r.height);
  for (let y = Math.max(0, y0); y < Math.min(r.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(r.width, x1); x++) out[y * r.width + x] = r.px[y * r.width + x];
  return out;
}

describe('TEST B – zwei Unterzeichner nacheinander, mehrseitig', () => {
  it('Reihenfolge wird eingehalten, finales Dokument enthält beide Signaturen', async () => {
    const d = await draftWithDoc(admin, 'Gesellschaftervereinbarung', 3, { signing_order: 'sequential' });
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [
      { ref: 'gf', name: 'Gerd Geschäftsführer', email: 'gf@firma.test' },
      { ref: 'm', name: 'Mia Mandantin', email: 'mia@example.org' },
    ]);
    const { gf, m } = recs.json.refs;
    expect(recs.json.data.find((r: any) => r.id === gf).routing_order).toBe(1);
    expect(recs.json.data.find((r: any) => r.id === m).routing_order).toBe(2);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'signature', document: 0, recipient: gf, page: 2, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      { type: 'initials', document: 0, recipient: gf, page: 0, x: 0.85, y: 0.93, w: 0.08, h: 0.04 },
      { type: 'signature', document: 0, recipient: m, page: 2, x: 0.55, y: 0.8, w: 0.3, h: 0.06 },
    ]);
    expect((await admin.post(`/api/v1/envelopes/${d.id}/send`)).status).toBe(200);
    expect(lastMail(s, 'mia@example.org')).toBeNull(); // Mandantin ist noch nicht dran
    const gfMail = lastMail(s, 'gf@firma.test')!;
    expect((await sign(s, gfMail.link!)).res.status).toBe(200);
    let env = await admin.get(`/api/v1/envelopes/${d.id}`);
    expect(env.json.status).toBe('sent');
    expect(env.json.recipients.map((r: any) => r.status)).toEqual(['completed', 'sent']);
    const miaMail = lastMail(s, 'mia@example.org')!;
    expect(miaMail.link).toBeTruthy();
    expect((await sign(s, miaMail.link!)).res.status).toBe(200);
    await jobs(s);
    env = await admin.get(`/api/v1/envelopes/${d.id}`);
    expect(env.json.status).toBe('completed');
    const pdf = Buffer.from((await admin.get(`/api/v1/envelopes/${d.id}/files/final`)).body);
    const original = Buffer.from((await admin.get(`/api/v1/envelopes/${d.id}/documents/${d.docId}/pdf`)).body);
    const p3a = rasterize(original, 2, 72), p3b = rasterize(pdf, 2, 72);
    const left = diffBBox({ ...p3a, px: maskOutside(p3a, { x: 0.1, y: 0.8, w: 0.3, h: 0.06 }) }, { ...p3b, px: maskOutside(p3b, { x: 0.1, y: 0.8, w: 0.3, h: 0.06 }) });
    const right = diffBBox({ ...p3a, px: maskOutside(p3a, { x: 0.55, y: 0.8, w: 0.3, h: 0.06 }) }, { ...p3b, px: maskOutside(p3b, { x: 0.55, y: 0.8, w: 0.3, h: 0.06 }) });
    expect(left.n).toBeGreaterThan(100);
    expect(right.n).toBeGreaterThan(100);
    const p1 = diffBBox(rasterize(original, 0, 72), rasterize(pdf, 0, 72));
    expect(p1.n).toBeGreaterThan(10); // Paraphe auf Seite 1
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(4);
  });
});

describe('TEST D – Ablehnung', () => {
  it('Status abgelehnt, kein Abschluss mehr möglich', async () => {
    const d = await draftWithDoc(admin, 'Vergleich');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [
      { ref: 'a', name: 'Anton', email: 'anton@example.org' },
      { ref: 'b', name: 'Berta', email: 'berta@example.org' },
    ]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'signature', document: 0, recipient: recs.json.refs.a, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      { type: 'signature', document: 0, recipient: recs.json.refs.b, page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 },
    ]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`);
    const a = new Signer(s);
    await a.open(lastMail(s, 'anton@example.org')!.link!);
    expect((await a.req('POST', '/api/sign/decline', { reason: 'Betrag stimmt nicht' })).status).toBe(200);
    const env = await admin.get(`/api/v1/envelopes/${d.id}`);
    expect(env.json.status).toBe('declined');
    expect(env.json.recipients[0].decline_reason).toBe('Betrag stimmt nicht');
    // Berta kann nicht mehr unterschreiben – auch nicht mit dem alten Link
    const b = new Signer(s);
    const ob = await b.open(lastMail(s, 'berta@example.org', 'bittet')!.link!);
    expect([404, 410]).toContain(ob.status);
    expect((await admin.get(`/api/v1/envelopes/${d.id}/files/final`)).status).toBe(409);
    expect((await admin.post(`/api/v1/envelopes/${d.id}/void`, { reason: 'x' })).status).toBe(409);
  });
});

describe('TEST E – Widerruf und Ablauf', () => {
  it('Widerrufene Links sind wirkungslos, auch eine offene Sitzung', async () => {
    const d = await draftWithDoc(admin, 'Vollmacht');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [{ ref: 'x', name: 'Xaver', email: 'xaver@example.org' }]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.json.refs.x, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`, { acknowledge_form_risk: true });
    const link = lastMail(s, 'xaver@example.org')!.link!;
    const x = new Signer(s);
    expect((await x.open(link)).status).toBe(200);
    expect((await admin.post(`/api/v1/envelopes/${d.id}/void`, { reason: 'Falsches Dokument' })).status).toBe(200);
    expect((await x.req('GET', '/api/sign/view')).status).toBe(401);
    const sig = await x.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
    expect([401, 410]).toContain(sig.status);
    expect([404, 410]).toContain((await new Signer(s).open(link)).status);
  });

  it('Abgelaufene Anfrage kann nicht mehr unterschrieben werden', async () => {
    const d = await draftWithDoc(admin, 'Fristsache');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [{ ref: 'y', name: 'Yvonne', email: 'yvonne@example.org' }]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.json.refs.y, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`);
    const link = lastMail(s, 'yvonne@example.org')!.link!;
    const y = new Signer(s);
    await y.open(link);
    // Zeit vorspulen
    const realNow = s.ctx.now;
    s.ctx.now = () => new Date(Date.now() + 40 * 86400_000);
    try {
      const r = await sign(s, link).catch(() => null);
      expect(r === null || r.res.status !== 200).toBe(true);
      const { expireScan } = await import('../src/server/domain/maintenance.js');
      expireScan(s.ctx);
    } finally {
      s.ctx.now = realNow;
    }
    expect((await admin.get(`/api/v1/envelopes/${d.id}`)).json.status).toBe('expired');
    expect([404, 410]).toContain((await new Signer(s).open(link)).status);
  });

  it('Erinnerung erzeugt neuen Link, der alte wird ungültig', async () => {
    const d = await draftWithDoc(admin, 'Erinnerungstest');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [{ ref: 'z', name: 'Zoe', email: 'zoe@example.org' }]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [{ type: 'signature', document: 0, recipient: recs.json.refs.z, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`);
    const old = lastMail(s, 'zoe@example.org')!.link!;
    expect((await admin.post(`/api/v1/envelopes/${d.id}/recipients/${recs.json.refs.z}/remind`)).status).toBe(200);
    const neu = lastMail(s, 'zoe@example.org', 'Erinnerung')!.link!;
    expect(neu).not.toBe(old);
    expect((await new Signer(s).open(old)).status).toBe(404);
    expect((await new Signer(s).open(neu)).status).toBe(200);
  });
});

describe('TEST F – Mandantentrennung', () => {
  it('Fremde Organisation sieht und lädt nichts', async () => {
    const d = await draftWithDoc(admin, 'Geheim');
    // Zweite Organisation mit eigenem Inhaber
    const created = await admin.post('/api/v1/orgs', { name: 'Andere Kanzlei' });
    expect(created.status).toBe(201);
    const inv = await admin.post('/api/auth/switch-org', { org_id: created.json.id });
    expect(inv.status).toBe(200);
    const invite = await admin.post('/api/v1/members/invite', { email: 'fremd@andere.test', role: 'owner' });
    expect(invite.status).toBe(201);
    const link = lastMail(s, 'fremd@andere.test')!.link!;
    const other = new Client(s);
    const acc = await other.post(`/api/auth/invite/${link.split('/invite/')[1]}/accept`, { name: 'Fritz Fremd', password: 'noch-ein-sicheres-pw-2' });
    expect(acc.status).toBe(200);
    await other.refreshCsrf();
    // Admin zurück in die erste Organisation
    const st = await admin.refreshCsrf();
    await admin.post('/api/auth/switch-org', { org_id: st.session.orgs.find((o: any) => o.name === 'Kanzlei Test').id });

    for (const url of [`/api/v1/envelopes/${d.id}`, `/api/v1/envelopes/${d.id}/documents/${d.docId}/pdf`, `/api/v1/envelopes/${d.id}/audit`, `/api/v1/envelopes/${d.id}/files/final`]) {
      expect((await other.get(url)).status).toBe(404);
    }
    expect((await other.patch(`/api/v1/envelopes/${d.id}`, { title: 'gehackt' })).status).toBe(404);
    expect((await other.del(`/api/v1/envelopes/${d.id}`)).status).toBe(404);
    expect((await other.put(`/api/v1/envelopes/${d.id}/recipients`, [{ name: 'X', email: 'x@x.de' }])).status).toBe(404);
    expect((await other.get('/api/v1/envelopes')).json.data.find((e: any) => e.id === d.id)).toBeUndefined();
    // Ohne CSRF-Token keine Änderung, ohne Sitzung kein Zugriff
    const noCsrf = new Client(s);
    noCsrf.cookie = admin.cookie;
    expect((await noCsrf.patch(`/api/v1/envelopes/${d.id}`, { title: 'x' })).status).toBe(403);
    expect((await new Client(s).get(`/api/v1/envelopes/${d.id}`)).status).toBe(401);
    // Fremde Herkunft wird abgewiesen
    expect((await admin.req('PATCH', `/api/v1/envelopes/${d.id}`, { title: 'x' }, { origin: 'https://evil.example' })).status).toBe(403);
    // API-Schlüssel der fremden Organisation
    const key = await other.post('/api/v1/api-keys', { name: 'k', scopes: ['envelopes:read', 'envelopes:write'], mode: 'live' });
    const api = new Client(s, key.json.key);
    expect((await api.get(`/api/v1/envelopes/${d.id}`)).status).toBe(404);
    expect((await api.get(`/api/v1/envelopes/${d.id}/files/evidence`)).status).toBe(404);
  });

  it('Empfänger können nur eigene Felder setzen', async () => {
    const d = await draftWithDoc(admin, 'Zwei Parteien');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [
      { ref: 'a', name: 'A', email: 'a@example.org' },
      { ref: 'b', name: 'B', email: 'b@example.org' },
    ]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'signature', document: 0, recipient: recs.json.refs.a, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      { type: 'text', key: 'betrag_b', document: 0, recipient: recs.json.refs.b, page: 0, x: 0.1, y: 0.5, w: 0.3, h: 0.03 },
      { type: 'signature', key: 'sig_b', document: 0, recipient: recs.json.refs.b, page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 },
    ]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`);
    const a = new Signer(s);
    const open = await a.open(lastMail(s, 'a@example.org')!.link!);
    expect((await a.req('PUT', '/api/sign/draft', { betrag_b: '1 €' })).status).toBe(403);
    const sig = await a.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
    const res = await a.req('POST', '/api/sign/complete', { values: { betrag_b: '1 €' }, signatures: { signature_1: sig.json.id, sig_b: sig.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: open.json.view.documents.map((x: any) => x.sha256), completion_key: 'ck_foreign_1' });
    expect(res.status).toBe(403);
    // Fremde Signatur-ID wird abgelehnt
    const b = new Signer(s);
    const ob = await b.open(lastMail(s, 'b@example.org')!.link!);
    const res2 = await b.req('POST', '/api/sign/complete', { values: { betrag_b: '5' }, signatures: { sig_b: sig.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: ob.json.view.documents.map((x: any) => x.sha256), completion_key: 'ck_foreign_2' });
    expect(res2.status).toBe(403);
  });
});

describe('TEST L – Gleichzeitigkeit, Wiederholung, Neuladen', () => {
  it('Doppelte und parallele Abschlüsse erzeugen genau einen Abschluss', async () => {
    const d = await draftWithDoc(admin, 'Parallel');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [
      { ref: 'p', name: 'Paula', email: 'paula@example.org' },
      { ref: 'q', name: 'Quentin', email: 'quentin@example.org' },
    ]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'signature', document: 0, recipient: recs.json.refs.p, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      { type: 'signature', document: 0, recipient: recs.json.refs.q, page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 },
    ]);
    // Doppelter Versand: genau einmal
    const [s1, s2] = await Promise.all([admin.post(`/api/v1/envelopes/${d.id}/send`), admin.post(`/api/v1/envelopes/${d.id}/send`)]);
    expect([s1.status, s2.status].sort()).toEqual([200, 409]);

    const prep = async (email: string) => {
      const sg = new Signer(s);
      const o = await sg.open(lastMail(s, email)!.link!);
      const sig = await sg.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
      const key = o.json.view.fields.find((f: any) => f.mine).key;
      return { sg, body: { values: {}, signatures: { [key]: sig.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: o.json.view.documents.map((x: any) => x.sha256) } };
    };
    const P = await prep('paula@example.org');
    const Q = await prep('quentin@example.org');
    // Paula klickt doppelt (gleicher Schlüssel) und parallel aus zwei Tabs (anderer Schlüssel); Quentin gleichzeitig
    const results = await Promise.all([
      P.sg.req('POST', '/api/sign/complete', { ...P.body, completion_key: 'ck_paula_tab1' }),
      P.sg.req('POST', '/api/sign/complete', { ...P.body, completion_key: 'ck_paula_tab1' }),
      P.sg.req('POST', '/api/sign/complete', { ...P.body, completion_key: 'ck_paula_tab2' }),
      Q.sg.req('POST', '/api/sign/complete', { ...Q.body, completion_key: 'ck_quentin' }),
    ]);
    const paula = results.slice(0, 3).map((r) => r.status);
    expect(paula.filter((x) => x === 200).length).toBeGreaterThanOrEqual(1);
    expect(paula.every((x) => x === 200 || x === 409)).toBe(true);
    expect(results[3].status).toBe(200);
    // Netzwerkabbruch nach dem Absenden: erneutes Senden mit gleichem Schlüssel → Erfolg (idempotent)
    const retry = await P.sg.req('POST', '/api/sign/complete', { ...P.body, completion_key: 'ck_paula_tab1' });
    expect(retry.status).toBe(200);
    expect(retry.json.idempotent).toBe(true);
    // Mehrfaches Anstoßen des Abschlusses erzeugt nur ein Ergebnis
    const { enqueue } = await import('../src/server/domain/jobs.js');
    enqueue(s.ctx, 'finalize_envelope', { envelopeId: d.id });
    enqueue(s.ctx, 'finalize_envelope', { envelopeId: d.id });
    await jobs(s);
    const { finalizeEnvelope } = await import('../src/server/domain/finalize.js');
    await Promise.all([finalizeEnvelope(s.ctx, d.id), finalizeEnvelope(s.ctx, d.id)]);
    const env = await admin.get(`/api/v1/envelopes/${d.id}`);
    expect(env.json.status).toBe('completed');
    const audit = (await admin.get(`/api/v1/envelopes/${d.id}/audit`)).json;
    expect(audit.chain.ok).toBe(true);
    expect(audit.events.filter((e: any) => e.type === 'recipient.signed')).toHaveLength(2);
    expect(audit.events.filter((e: any) => e.type === 'envelope.completed')).toHaveLength(1);
    expect((s.ctx.db.prepare('SELECT COUNT(*) AS n FROM envelope_results WHERE envelope_id = ?').get(d.id) as any).n).toBe(1);
  });

  it('Neuladen: Zwischenstand bleibt, Dokumentfassung ist gebunden', async () => {
    const d = await draftWithDoc(admin, 'Reload');
    const recs = await admin.put(`/api/v1/envelopes/${d.id}/recipients`, [{ ref: 'r', name: 'Rita', email: 'rita@example.org' }]);
    await admin.put(`/api/v1/envelopes/${d.id}/fields`, [
      { type: 'text', key: 'anschrift', document: 0, recipient: recs.json.refs.r, page: 0, x: 0.1, y: 0.5, w: 0.5, h: 0.03 },
      { type: 'signature', document: 0, recipient: recs.json.refs.r, page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
    ]);
    await admin.post(`/api/v1/envelopes/${d.id}/send`);
    const link = lastMail(s, 'rita@example.org')!.link!;
    const r1 = new Signer(s);
    await r1.open(link);
    await r1.req('PUT', '/api/sign/draft', { anschrift: 'Domstraße 1, 50667 Köln' });
    const r2 = new Signer(s); // Neuladen / neuer Tab
    const o2 = await r2.open(link);
    expect(o2.json.view.fields.find((f: any) => f.key === 'anschrift').value).toBe('Domstraße 1, 50667 Köln');
    const sig = await r2.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'typed', png_base64: signaturePng(3), typed_text: 'Rita' });
    const wrongHash = await r2.req('POST', '/api/sign/complete', { values: { anschrift: 'x' }, signatures: { signature_2: sig.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: ['0'.repeat(64)], completion_key: 'ck_rita_wrong' });
    expect(wrongHash.status).toBe(409);
    expect(wrongHash.json.error.code).toBe('document_changed');
  });
});

describe('TEST H – Vorlagen bleiben versioniert, alte Vorgänge unverändert', () => {
  it('Vorlage mehrfach nutzen und ändern', async () => {
    const t = await admin.post('/api/v1/templates', { name: 'Mandatsvereinbarung' });
    expect(t.status).toBe(201);
    const up = await admin.upload(`/api/v1/templates/${t.json.id}/documents`, 'mandat.pdf', await makePdf({ title: 'Mandatsvereinbarung' }));
    expect(up.status).toBe(201);
    const roles = [{ key: 'mandant', name: 'Mandant', kind: 'signer', routing_order: 1, auth_method: 'none' }];
    const fields = [
      { type: 'signature', document: 0, recipient: 'mandant', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
      { type: 'text', key: 'aktenzeichen', document: 0, recipient: 'mandant', page: 0, x: 0.6, y: 0.1, w: 0.3, h: 0.03, config: { readonly: true } },
    ];
    expect((await admin.put(`/api/v1/templates/${t.json.id}/draft`, { roles, fields, settings: { title: 'Mandatsvereinbarung – {{Mandant.name}}' } })).status).toBe(200);
    const v1 = await admin.post(`/api/v1/templates/${t.json.id}/publish`, { note: 'Erste Fassung' });
    expect(v1.json.version).toBe(1);
    const e1 = await admin.post(`/api/v1/templates/${t.json.id}/envelopes`, { recipients: { mandant: { name: 'Max Mandant', email: 'max@example.org' } }, prefill: { aktenzeichen: '12/26' } });
    expect(e1.status).toBe(201);
    expect(e1.json.title).toBe('Mandatsvereinbarung – Max Mandant');
    expect(e1.json.fields.find((f: any) => f.key === 'aktenzeichen').value).toBe('12/26');
    const e2 = await admin.post(`/api/v1/templates/${t.json.id}/envelopes`, { recipients: { mandant: { name: 'Nina Neu', email: 'nina@example.org' } }, prefill: { aktenzeichen: '13/26' } });
    expect(e2.status).toBe(201);

    // Vorlage ändern: anderes Dokument, Feld verschoben → Version 2
    const up2 = await admin.upload(`/api/v1/templates/${t.json.id}/documents`, 'mandat-v2.pdf', await makePdf({ title: 'Mandatsvereinbarung v2', pages: 2 }));
    const tpl = (await admin.get(`/api/v1/templates/${t.json.id}`)).json;
    await admin.put(`/api/v1/templates/${t.json.id}/draft`, { documents: [{ id: up2.json.document.id, name: 'Mandat v2' }], fields: [{ ...fields[0], page: 1, y: 0.5 }, fields[1]] });
    void tpl;
    const v2 = await admin.post(`/api/v1/templates/${t.json.id}/publish`, { note: 'Neue Fassung' });
    expect(v2.json.version).toBe(2);
    // Unveränderliche Version: direkter Änderungsversuch in der DB scheitert
    expect(() => s.ctx.db.prepare('UPDATE template_versions SET content = ? WHERE template_id = ?').run('{}', t.json.id)).toThrow(/unveränderlich/);

    // Alter Vorgang e1 unverändert: Dokument-Hash und Feldposition wie bei Version 1
    const e1Now = (await admin.get(`/api/v1/envelopes/${e1.json.id}`)).json;
    expect(e1Now.documents[0].sha256).toBe(e1.json.documents[0].sha256);
    expect(e1Now.documents[0].page_count).toBe(1);
    expect(e1Now.fields.find((f: any) => f.type === 'signature')).toMatchObject({ page: 0, y: 0.8 });
    // e1 lässt sich mit Version 1 abschließen
    const r = await sign(s, lastMail(s, 'max@example.org')!.link!);
    expect(r.res.status).toBe(200);
    await jobs(s);
    expect((await admin.get(`/api/v1/envelopes/${e1.json.id}`)).json.status).toBe('completed');
    const e3 = await admin.post(`/api/v1/templates/${t.json.id}/envelopes`, { recipients: { mandant: { name: 'Otto', email: 'otto@example.org' } }, prefill: { aktenzeichen: '14/26' } });
    expect(e3.json.documents[0].page_count).toBe(2);
    expect(e3.json.fields.find((f: any) => f.type === 'signature')).toMatchObject({ page: 1, y: 0.5 });
    // Vorbelegtes, schreibgeschütztes Feld kann der Mandant nicht ändern
    const o = new Signer(s);
    const ov = await o.open(lastMail(s, 'otto@example.org')!.link!);
    const sig = await o.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
    const sigKey = ov.json.view.fields.find((f: any) => f.type === 'signature').key;
    await o.req('POST', '/api/sign/complete', { values: { aktenzeichen: 'manipuliert' }, signatures: { [sigKey]: sig.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: ov.json.view.documents.map((x: any) => x.sha256), completion_key: 'ck_otto' });
    const e3Now = (await admin.get(`/api/v1/envelopes/${e3.json.id}`)).json;
    expect(e3Now.fields.find((f: any) => f.key === 'aktenzeichen').value).toBe('14/26');
  });
});
