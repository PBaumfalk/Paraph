// Kryptografische Härtung: geprüfte Zeitstempel, Integritätsprüfung beim Abschluss, externe Verankerung.
// Angreifermodell: Schreibzugriff auf die Datenbank (Trigger abschaltbar, Hashes neu berechenbar).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import yauzl from 'yauzl';
import { startTestServer, setupAdmin, Client, Signer, lastMail, jobs, type TestServer } from './helpers/server.js';
import { startTestTsa, type TestTsa } from './helpers/tsa.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { verifyPdfSignatures } from '../src/server/pdf/verify.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { canonicalJson, sha256Hex } from '../src/server/lib/crypto.js';
import { eventHash, listAudit, verifyChain, GENESIS } from '../src/server/domain/audit.js';
import { createAnchor, verifyAnchors, envelopeAnchoring, merkleRoot, inclusionProof, rootFromProof, leafHash, anchorHash, ANCHOR_GENESIS } from '../src/server/domain/anchor.js';

let s: TestServer;
let admin: Client;
let tsa: TestTsa;

beforeAll(async () => {
  tsa = await startTestTsa();
  s = await startTestServer({ tsaUrl: tsa.url, tsaCaPem: tsa.caPem });
  admin = await setupAdmin(s);
});
afterAll(async () => {
  await s.close();
  await tsa.close();
});

async function sentEnvelope(title: string, signers = 1) {
  const env = await admin.post('/api/v1/envelopes', { title });
  await admin.upload(`/api/v1/envelopes/${env.json.id}/documents`, 'v.pdf', await makePdf({ pages: 1, title }));
  const list = Array.from({ length: signers }, (_, i) => ({ ref: `r${i}`, name: `Person ${i}`, email: `p${i}-${env.json.id.slice(-6).toLowerCase()}@example.org` }));
  const recs = await admin.put(`/api/v1/envelopes/${env.json.id}/recipients`, list);
  const fields = list.flatMap((r, i) => [
    { type: 'signature', document: 0, recipient: recs.json.refs[r.ref], page: 0, x: 0.1, y: 0.1 + i * 0.2, w: 0.3, h: 0.06 },
    { type: 'text', key: `ort_${i}`, document: 0, recipient: recs.json.refs[r.ref], page: 0, x: 0.5, y: 0.1 + i * 0.2, w: 0.3, h: 0.03 },
  ]);
  expect((await admin.put(`/api/v1/envelopes/${env.json.id}/fields`, fields)).status).toBe(200);
  expect((await admin.post(`/api/v1/envelopes/${env.json.id}/send`)).status).toBe(200);
  return { id: env.json.id as string, emails: list.map((r) => r.email), rids: list.map((r) => recs.json.refs[r.ref] as string) };
}

async function signAs(link: string, values: Record<string, string>) {
  const signer = new Signer(s);
  const open = await signer.open(link);
  const view = open.json.view;
  const signatures: Record<string, string> = {};
  for (const f of view.fields.filter((x: any) => x.mine && x.type === 'signature')) {
    signatures[f.key] = (await signer.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() })).json.id;
  }
  return signer.req('POST', '/api/sign/complete', { values, signatures, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: view.documents.map((d: any) => d.sha256), completion_key: 'ck_' + Math.random().toString(36).slice(2, 12) });
}

/** Angreifer mit Datenbankzugriff: Trigger entfernen, ändern, Trigger wiederherstellen. */
function asAttacker<T>(fn: () => T): T {
  const db = s.ctx.db;
  const triggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`).all() as { name: string; sql: string }[];
  for (const t of triggers) db.exec(`DROP TRIGGER ${t.name}`);
  try {
    return fn();
  } finally {
    for (const t of triggers) db.exec(t.sql);
  }
}

/** Schreibt die gesamte Kette eines Vorgangs neu (wie es ein Angreifer täte). */
function rewriteChain(envelopeId: string, mutate: (events: any[]) => void) {
  asAttacker(() => {
    const events = listAudit(s.ctx.db, envelopeId);
    mutate(events);
    let prev = GENESIS;
    for (const e of events) {
      e.prev_hash = prev;
      const { hash: _h, ...rest } = e;
      e.hash = eventHash(envelopeId, rest);
      s.ctx.db.prepare('UPDATE audit_events SET ts = ?, data = ?, prev_hash = ?, hash = ? WHERE envelope_id = ? AND seq = ?').run(e.ts, JSON.stringify(e.data), e.prev_hash, e.hash, envelopeId, e.seq);
      prev = e.hash;
    }
  });
}

describe('RFC-3161-Zeitstempel (unabhängiger OpenSSL-Zeitstempeldienst)', () => {
  it('Siegel erhält einen geprüften Zeitstempel (PAdES-B-T), die Prüfstelle bestätigt TSA-Signatur und Imprint', async () => {
    const e = await sentEnvelope('Zeitstempel B-T');
    expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Köln' })).status).toBe(200);
    await jobs(s);
    const env = await admin.get(`/api/v1/envelopes/${e.id}`);
    expect(env.json.status).toBe('completed');
    expect(env.json.result.seal.standard).toBe('PAdES-B-T');
    const pdf = Buffer.from((await admin.get(`/api/v1/envelopes/${e.id}/files/final`)).body);
    const sigs = await verifyPdfSignatures(pdf);
    expect(sigs[0]).toMatchObject({ signatureOk: true, digestOk: true, coversWholeFile: true, timestampOk: true });
    expect(sigs[0].timestampAuthority).toContain('Test TSA');
  });

  it('Wiederverwendete (fremde) Zeitstempelantwort wird abgelehnt – Siegel fällt sichtbar auf B-B zurück', async () => {
    const e = await sentEnvelope('Zeitstempel Replay');
    tsa.mode.replay = true;
    try {
      expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Bonn' })).status).toBe(200);
      await jobs(s);
    } finally {
      tsa.mode.replay = false;
    }
    const env = await admin.get(`/api/v1/envelopes/${e.id}`);
    expect(env.json.status).toBe('completed');
    expect(env.json.result.seal.standard).toBe('PAdES-B-B');
    expect(env.json.result.seal.timestamp_error).toMatch(/Imprint|Nonce/);
  });

  it('Ein nachträglich eingesetzter Zeitstempel über andere Daten wird in der Prüfstelle als ungültig erkannt', async () => {
    const { cmsSignDetached } = await import('../src/server/pdf/seal.js');
    const { getSealKey } = await import('../src/server/domain/sealkeys.js');
    const { verifyTimestampToken } = await import('../src/server/pdf/timestamp.js');
    const pkijs = await import('pkijs');
    const key = (await getSealKey(s.ctx, null)).key;
    const a = await cmsSignDetached(key, Buffer.from('A'), tsa.url);
    expect(a.timestampError).toBeUndefined();
    const ci = pkijs.ContentInfo.fromBER(new Uint8Array(a.der));
    const sd = new pkijs.SignedData({ schema: ci.content });
    const token = new pkijs.ContentInfo({ schema: sd.signerInfos[0].unsignedAttrs!.attributes[0].values[0] });
    await expect(verifyTimestampToken(token, new Uint8Array(32))).rejects.toThrow(/Imprint/);
  });
});

describe('Integritätsprüfung beim Abschluss', () => {
  it('Wert, der nach der Unterschrift in der Datenbank geändert wird, gelangt nicht ins finale PDF', async () => {
    const e = await sentEnvelope('Manipulierter Wert', 2);
    expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Köln' })).status).toBe(200);
    await jobs(s);
    // Angreifer ändert den bereits unterschriebenen Wert von Person 0
    asAttacker(() => s.ctx.db.prepare(`UPDATE fields SET value = 'Hamburg' WHERE envelope_id = ? AND key = 'ort_0'`).run(e.id));
    expect((await signAs(lastMail(s, e.emails[1])!.link!, { ort_1: 'Bonn' })).status).toBe(200);
    await jobs(s);
    const env = await admin.get(`/api/v1/envelopes/${e.id}`);
    expect(env.json.status).toBe('sent');
    const job = s.ctx.db.prepare(`SELECT last_error FROM jobs WHERE type = 'finalize_envelope' AND payload LIKE ? ORDER BY created_at DESC`).get(`%${e.id}%`) as any;
    expect(job.last_error).toMatch(/Eingaben von Empfänger .* nach der Unterschrift verändert/);
  });

  it('Ausgetauschtes Unterschriftsbild wird erkannt', async () => {
    const e = await sentEnvelope('Getauschte Unterschrift');
    expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Köln' })).status).toBe(200);
    // Angreifer ersetzt die Bilddatei samt Hash in der Tabelle
    const sig = s.ctx.db.prepare(`SELECT s.* FROM signatures s WHERE s.recipient_id = ?`).get(e.rids[0]) as any;
    const fake = await s.ctx.blobs.put(Buffer.from(signaturePng(), 'base64'), { orgId: null, mime: 'image/png', kind: 'signature' });
    asAttacker(() => s.ctx.db.prepare('UPDATE signatures SET blob_id = ?, sha256 = ? WHERE id = ?').run(fake.id, sha256Hex(Buffer.from('x')), sig.id));
    await jobs(s);
    expect((await admin.get(`/api/v1/envelopes/${e.id}`)).json.status).toBe('sent');
  });
});

describe('Externe Verankerung der Audit-Ketten', () => {
  it('Merkle-Prüfpfade nach RFC 6962 stimmen für alle Baumgrößen und Positionen', () => {
    for (let n = 1; n <= 33; n++) {
      const leaves = Array.from({ length: n }, (_, i) => leafHash('env' + i, i + 1, sha256Hex(String(i))));
      const root = merkleRoot(leaves);
      for (let m = 0; m < n; m++) expect(rootFromProof(leaves[m], m, n, inclusionProof(leaves, m)).equals(root)).toBe(true);
      if (n > 1) expect(rootFromProof(leaves[0], 0, n, inclusionProof(leaves, 1)).equals(root)).toBe(false);
    }
  });

  it('Anker werden verkettet und vom Zeitstempeldienst bestätigt; Entwürfe werden nicht verankert', async () => {
    const draft = await admin.post('/api/v1/envelopes', { title: 'Nur Entwurf' });
    const a = await createAnchor(s.ctx);
    expect(a).not.toBeNull();
    expect(a!.tsa_token).not.toBeNull();
    expect(s.ctx.db.prepare('SELECT 1 FROM audit_anchor_leaves WHERE envelope_id = ?').get(draft.json.id)).toBeUndefined();
    // Keine Änderung → kein neuer Anker
    expect(await createAnchor(s.ctx)).toBeNull();
    const rep = await verifyAnchors(s.ctx);
    expect(rep.problems).toEqual([]);
    expect(rep.stamped).toBe(rep.anchors);
    // Datenbank-Trigger schützen Anker
    expect(() => s.ctx.db.prepare('DELETE FROM audit_anchors').run()).toThrow(/unveränderlich/);
    expect(() => s.ctx.db.prepare(`UPDATE audit_anchors SET root = 'x' WHERE id = 1`).run()).toThrow(/unveränderlich/);
  });

  it('Angreifer ändert ein altes Ereignis und berechnet die ganze Kette neu → Kette „intakt“, Verankerung schlägt Alarm', async () => {
    const e = await sentEnvelope('Gefälschte Historie');
    expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Köln' })).status).toBe(200);
    await jobs(s);
    await createAnchor(s.ctx);
    rewriteChain(e.id, (events) => {
      const signed = events.find((x) => x.type === 'recipient.signed');
      signed.data.ip = '203.0.113.99'; // andere IP-Adresse vortäuschen
    });
    // Die Kette allein ist nach Neuberechnung wieder „gültig“ – genau das ist die Schwäche
    expect(verifyChain(e.id, listAudit(s.ctx.db, e.id)).ok).toBe(true);
    const rep = await verifyAnchors(s.ctx);
    expect(rep.ok).toBe(false);
    expect(rep.problems.join('\n')).toMatch(new RegExp(`${e.id}: Eintrag \\d+ weicht vom verankerten Stand ab`));
  });

  it('Angreifer fälscht zusätzlich die Ankerkette und holt neue Zeitstempel → Rückdatierung wird sichtbar', async () => {
    const e = await sentEnvelope('Gefälschte Anker');
    // Ereignisse wurden „vor 30 Tagen“ angeblich erzeugt …
    const realNow = s.ctx.now;
    rewriteChain(e.id, (events) => events.forEach((x) => (x.ts = new Date(Date.now() - 30 * 86400_000).toISOString())));
    // … der Angreifer verankert heute neu (er kann keinen Zeitstempel für die Vergangenheit bekommen)
    await createAnchor(s.ctx);
    s.ctx.now = realNow;
    const r = await envelopeAnchoring(s.ctx, e.id);
    expect(r.chain_ok).toBe(true);
    expect(r.max_anchor_delay_hours).toBeGreaterThan(24 * 29);
  });

  it('Gelöschte Anker oder neu berechnete Anker brechen die Ankerkette bzw. den Zeitstempel', async () => {
    await createAnchor(s.ctx);
    const before = await verifyAnchors(s.ctx);
    const last = s.ctx.db.prepare('SELECT * FROM audit_anchors ORDER BY id DESC LIMIT 1').get() as any;
    asAttacker(() => {
      // Wurzel ändern und Ankerhash neu berechnen – der vorhandene Zeitstempel passt dann nicht mehr
      const root = sha256Hex('gefälscht');
      const ah = anchorHash({ id: last.id, created_at: last.created_at, prev_hash: last.prev_hash, root, leaves: last.leaves });
      s.ctx.db.prepare('UPDATE audit_anchors SET root = ?, anchor_hash = ? WHERE id = ?').run(root, ah, last.id);
    });
    const after = await verifyAnchors(s.ctx);
    expect(after.problems.length).toBeGreaterThan(before.problems.length);
    expect(after.problems.join('\n')).toMatch(new RegExp(`Anker ${last.id}: (Merkle-Wurzel stimmt nicht|Zeitstempel ungültig)`));
    expect(ANCHOR_GENESIS).toHaveLength(64);
    void canonicalJson;
  });

  it('Nachweispaket enthält die Verankerung mit Prüfpfad', async () => {
    const e = await sentEnvelope('Nachweis mit Anker', 2);
    expect((await signAs(lastMail(s, e.emails[0])!.link!, { ort_0: 'Köln' })).status).toBe(200);
    await createAnchor(s.ctx);
    expect((await signAs(lastMail(s, e.emails[1])!.link!, { ort_1: 'Bonn' })).status).toBe(200);
    await jobs(s);
    const zip = Buffer.from((await admin.get(`/api/v1/envelopes/${e.id}/files/evidence`)).body);
    const files = await unzip(zip);
    const anchors = JSON.parse(files.get('08_verankerung.json')!.toString('utf8'));
    const x = anchors.anchors[0];
    const root = rootFromProof(leafHash(e.id, x.leaf.seq, x.leaf.head), x.leaf.index, x.anchor.leaves, x.proof.map((p: string) => Buffer.from(p, 'hex')));
    expect(root.toString('hex')).toBe(x.anchor.root);
    expect(x.timestamp?.token_der_base64).toBeTruthy();
    // Abschlussmail nennt den Prüfwert des unterschriebenen Dokuments
    const env = await admin.get(`/api/v1/envelopes/${e.id}`);
    expect(lastMail(s, e.emails[0], 'Abgeschlossen')!.text).toContain(env.json.result.final_sha256);
  });
});


describe('Zweite Abnahme: Vertrauen in Zertifikate und Zeitstempel', () => {
  it('Fremde Signatur mit vorangestelltem Instanzzertifikat wird nicht als Siegel dieser Instanz anerkannt', async () => {
    const pkijs = await import('pkijs');
    const { generateSealKey, importSealKey, sealPdf } = await import('../src/server/pdf/seal.js');
    const { getSealKey } = await import('../src/server/domain/sealkeys.js');
    const own = await getSealKey(s.ctx, null);
    const mat = await generateSealKey('angreifer.example', 'Paraph Plattformsiegel');
    const evil = await importSealKey(mat.pkcs8, mat.certChainDer);
    // Angreifer signiert mit eigenem Schlüssel …
    const sealed = await sealPdf(await makePdf(), { privateKey: evil.privateKey, certs: evil.certs }, { reason: 'x', name: 'x' });
    // Platzhalter ist mit Nullen aufgefüllt: Länge aus dem DER-Kopf lesen (nicht Nullen abschneiden – die Signatur kann selbst auf 0 enden)
    const raw = Buffer.from(/\/Contents <([0-9a-f]+)/i.exec(sealed.pdf.toString('latin1'))![1], 'hex');
    const lenBytes = raw[1] & 0x80 ? raw[1] & 0x7f : 0;
    const derLen = 2 + lenBytes + (lenBytes ? raw.subarray(2, 2 + lenBytes).reduce((a, b) => a * 256 + b, 0) : raw[1]);
    const ci = pkijs.ContentInfo.fromBER(new Uint8Array(raw.subarray(0, derLen)));
    // … und stellt das öffentliche Instanzzertifikat in der Zertifikatsliste voran (PoC der zweiten Abnahme)
    const sd = new pkijs.SignedData({ schema: ci.content });
    sd.certificates = [own.key.certs[0], ...(sd.certificates as any[])];
    const der = Buffer.from(new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: sd.toSchema(true) }).toSchema().toBER(false)).toString('hex');
    const pdf = Buffer.from(sealed.pdf);
    const start = pdf.indexOf('/Contents <') + '/Contents <'.length;
    pdf.write(der.padEnd(24576 * 2, '0'), start, 'latin1');
    const fd = await s.app.inject({ method: 'POST', url: '/api/public/verify/signature', payload: multipart(pdf), headers: { 'content-type': 'multipart/form-data; boundary=XyZ' } });
    const sig = fd.json().signatures[0];
    expect(sig.issued_by_this_instance).toBe(false);
    expect(sig.verdict).not.toBe('valid');
  });

  it('Zeitstempel eines fremden (selbst erzeugten) Dienstes wird beim Stempeln abgelehnt und bei der Prüfung erkannt', async () => {
    const evil = await startTestTsa();
    const e = await sentEnvelope('Fremder Zeitstempeldienst');
    const realUrl = s.ctx.cfg.tsaUrl;
    try {
      s.ctx.cfg.tsaUrl = evil.url;
      const a = await createAnchor(s.ctx);
      expect(a!.tsa_token).toBeNull();
      expect(a!.tsa_error).toMatch(/nicht vertrauenswürdig/);
      // Angreifer mit DB-Zugriff setzt den fremden Zeitstempel direkt ein
      const { requestTimestamp } = await import('../src/server/pdf/timestamp.js');
      const { setTsaTrustAnchors } = await import('../src/server/pdf/timestamp.js');
      setTsaTrustAnchors(null);
      const ts = await requestTimestamp(evil.url, Buffer.from(a!.anchor_hash, 'hex'));
      setTsaTrustAnchors(tsa.caPem);
      asAttacker(() => s.ctx.db.prepare('UPDATE audit_anchors SET tsa_token = ?, tsa_time = ? WHERE id = ?').run(Buffer.from(ts.token.toSchema().toBER(false)), ts.info.genTime, a!.id));
      const rep = await verifyAnchors(s.ctx);
      expect(rep.problems.join('\n')).toMatch(new RegExp(`Anker ${a!.id}: Zeitstempel ungültig – .*Vertrauensankern`));
      // Ohne Vertrauensanker: nur „rechnerisch gültig“, ausdrücklich nicht als bestätigt gezählt
      setTsaTrustAnchors(null);
      const weak = await verifyAnchors(s.ctx);
      expect(weak.stampedUnverifiedChain).toBeGreaterThan(0);
      expect(weak.warnings.join('\n')).toMatch(/TSA_CA_FILE fehlt/);
      void e;
    } finally {
      s.ctx.cfg.tsaUrl = realUrl;
      const { setTsaTrustAnchors } = await import('../src/server/pdf/timestamp.js');
      setTsaTrustAnchors(tsa.caPem);
      await evil.close();
    }
  });
});

function multipart(pdf: Buffer) {
  return Buffer.concat([Buffer.from('--XyZ\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n'), pdf, Buffer.from('\r\n--XyZ--\r\n')]);
}

function unzip(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, z) => {
      if (err || !z) return reject(err);
      z.on('entry', (en) =>
        z.openReadStream(en, (e2, st) => {
          if (e2 || !st) return reject(e2);
          const c: Buffer[] = [];
          st.on('data', (d) => c.push(d));
          st.on('end', () => {
            out.set(en.fileName, Buffer.concat(c));
            z.readEntry();
          });
        }),
      );
      z.on('end', () => resolve(out));
      z.readEntry();
    });
  });
}
