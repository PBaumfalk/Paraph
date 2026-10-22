// S3-Ablage gegen einen echten MinIO-Server. Ohne S3_TEST_ENDPOINT werden die MinIO-Tests übersprungen;
// die Tests zu Wiederholung/Zeitlimit laufen immer (lokaler HTTP-Stub).
//
// Beispiel (MinIO nur auf 127.0.0.1, Benutzer mit Least-Privilege-Policy auf paraph-test und paraph.test.dots):
//   S3_TEST_ENDPOINT=http://127.0.0.1:19000 S3_TEST_ACCESS_KEY=… S3_TEST_SECRET=… npx vitest run tests/s3-minio.test.ts
// Optional: S3_TEST_REGION, S3_TEST_BUCKET (paraph-test), S3_TEST_BUCKET_DOTS (paraph.test.dots), S3_TEST_BUCKET_MISSING
// (paraph-missing: in der Policy freigegeben, aber nicht angelegt), S3_TEST_PREFIX_ACCESS_KEY/_SECRET (Präfix-Policy).
// Der Bucket paraph-forbidden muss existieren und darf für den Testbenutzer nicht freigegeben sein.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { S3Backend, S3Error, PROBE_PREFIX, normalizePrefix, rfc3986, type S3Cfg } from '../src/server/lib/s3.js';
import { probeBackend } from '../src/server/context.js';
import { startTestServer, setupAdmin, Signer, lastMail, jobs, type TestServer } from './helpers/server.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { sha256Hex } from '../src/server/lib/crypto.js';

const E = process.env;
const endpoint = E.S3_TEST_ENDPOINT;
const base = (over: Partial<S3Cfg> = {}): S3Cfg => ({
  endpoint,
  region: E.S3_TEST_REGION ?? 'us-east-1',
  bucket: E.S3_TEST_BUCKET ?? 'paraph-test',
  accessKeyId: E.S3_TEST_ACCESS_KEY ?? '',
  secretAccessKey: E.S3_TEST_SECRET ?? '',
  forcePathStyle: true,
  ...over,
});
const runId = `t${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const fast = { retries: 0 };

async function expectS3Error(p: Promise<unknown>, code: string, text: RegExp) {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e, `erwartet: ${code}`).toBeInstanceOf(S3Error);
  expect(e.code).toBe(code);
  expect(e.message).toMatch(text);
  // Zugangsdaten tauchen nie in der Meldung auf
  for (const secret of [E.S3_TEST_SECRET, 'falsches-geheimnis-xyz'].filter(Boolean)) expect(e.message).not.toContain(secret);
  return e as S3Error;
}

describe('S3: Hilfsfunktionen', () => {
  it('RFC-3986-Kodierung und Präfix-Normalisierung', () => {
    expect(rfc3986("a b!'()*~._-")).toBe("a%20b%21%27%28%29%2A~._-");
    expect(normalizePrefix('/paraph')).toBe('paraph/');
    expect(normalizePrefix('kanzlei/paraph/')).toBe('kanzlei/paraph/');
    expect(normalizePrefix('')).toBe('');
    expect(() => normalizePrefix('a/../b')).toThrow(/S3_PREFIX/);
    expect(() => normalizePrefix('a//b')).toThrow(/S3_PREFIX/);
  });
  it('Konfigurationsfehler werden früh und ohne Geheimnisse gemeldet', () => {
    expect(() => new S3Backend({ ...base(), endpoint: 'http://127.0.0.1:1', accessKeyId: '' })).toThrow(/S3_ACCESS_KEY_ID/);
    expect(() => new S3Backend({ ...base(), endpoint: 'http://u:geheim@127.0.0.1:1', accessKeyId: 'a', secretAccessKey: 'b' })).toThrow(/keine Zugangsdaten/);
  });
});

describe('S3: Wiederholung, Zeitlimit, 4xx ohne Wiederholung (lokaler Stub)', () => {
  let srv: Server;
  let port = 0;
  let hits = 0;
  let mode: 'slowdown' | 'denied' | 'hang' | 'flaky' = 'slowdown';
  beforeAll(async () => {
    srv = createServer((req, res) => {
      hits++;
      req.resume();
      if (mode === 'hang') return; // antwortet nie
      if (mode === 'flaky' && hits < 3) {
        res.writeHead(500, { 'content-type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>');
        return;
      }
      if (mode === 'flaky') {
        res.writeHead(200).end('ok');
        return;
      }
      const [status, code] = mode === 'slowdown' ? [503, 'SlowDown'] : [403, 'AccessDenied'];
      res.writeHead(status, { 'content-type': 'application/xml' }).end(`<Error><Code>${code}</Code><Message>StringToSign geheim</Message></Error>`);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    port = (srv.address() as any).port;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));
  const stub = (o = {}) => new S3Backend({ endpoint: `http://127.0.0.1:${port}`, region: 'us-east-1', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'falsches-geheimnis-xyz', forcePathStyle: true }, { retries: 2, retryBaseMs: 5, ...o });

  it('5xx wird mit Backoff wiederholt, dann klar gemeldet', async () => {
    mode = 'slowdown';
    hits = 0;
    const e = await expectS3Error(stub().put('abc', Buffer.from('x')), 'SlowDown', /vorübergehend nicht verfügbar/);
    expect(e.retryable).toBe(true);
    expect(hits).toBe(3);
  });
  it('vorübergehender 500 wird überbrückt', async () => {
    mode = 'flaky';
    hits = 0;
    await stub().put('abc', Buffer.from('x'));
    expect(hits).toBe(3);
  });
  it('4xx wird nicht wiederholt, Meldungstext von S3 wird nicht übernommen', async () => {
    mode = 'denied';
    hits = 0;
    const e = await expectS3Error(stub().get('abc'), 'AccessDenied', /Zugriff verweigert/);
    expect(e.message).not.toContain('StringToSign');
    expect(hits).toBe(1);
  });
  it('Zeitlimit je Versuch', async () => {
    mode = 'hang';
    await expectS3Error(stub({ retries: 0, timeoutMs: 150 }).get('abc'), 'Timeout', /Zeitüberschreitung/);
  });
  it('Netzwerkfehler (Port geschlossen) nach Wiederholungen', async () => {
    const b = new S3Backend({ endpoint: 'http://127.0.0.1:1', region: 'us-east-1', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'falsches-geheimnis-xyz', forcePathStyle: true }, { retries: 1, retryBaseMs: 5 });
    await expectS3Error(b.put('abc', Buffer.from('x')), 'NetworkError', /nicht erreichbar/);
  });
});

describe.skipIf(!endpoint)('S3 gegen MinIO', () => {
  it('put/get/head/delete, fehlende Datei, Content-MD5', async () => {
    const s3 = new S3Backend(base({ prefix: `${runId}/basic` }), fast);
    const data = randomBytes(5000);
    await s3.put('bAbc_1-x', data);
    expect((await s3.get('bAbc_1-x')).equals(data)).toBe(true);
    expect(await s3.head('bAbc_1-x')).toMatchObject({ size: 5000, etag: createHash('md5').update(data).digest('hex') });
    await s3.del('bAbc_1-x');
    expect(await s3.head('bAbc_1-x')).toBeNull();
    await expectS3Error(s3.get('bAbc_1-x'), 'NoSuchKey', /Datei fehlt im Speicher/);
    await s3.del('bAbc_1-x'); // Löschen ist idempotent
    await expect(s3.put('../x', data)).rejects.toThrow(/Ungültiger Blob-Schlüssel/);
  });

  it('list() mit Paginierung, ohne Probe-Objekte und Fremdschlüssel', async () => {
    const s3 = new S3Backend(base({ prefix: `${runId}/list/` }), fast);
    const keys = Array.from({ length: 7 }, (_, i) => `bk${i}${randomBytes(4).toString('hex')}`);
    for (const k of keys) await s3.put(k, Buffer.from(k));
    // Probe-Objekt liegt dauerhaft, falls ein Start abbricht – darf nicht als Blob erscheinen
    const raw = new S3Backend(base({ prefix: `${runId}/list/${PROBE_PREFIX}` }), fast);
    await raw.put('stale', Buffer.from('probe'));
    expect((await s3.list({ pageSize: 2 })).sort()).toEqual([...keys].sort());
    expect((await s3.list()).sort()).toEqual([...keys].sort());
    const objs: any[] = [];
    for await (const o of s3.objects({ pageSize: 3 })) objs.push(o);
    expect(objs).toHaveLength(7);
    expect(objs[0]).toMatchObject({ size: expect.any(Number), etag: expect.stringMatching(/^[0-9a-f]{32}$/) });
    // Anderes Präfix sieht nichts davon
    expect(await new S3Backend(base({ prefix: `${runId}/leer` }), fast).list()).toEqual([]);
    for (const k of keys) await s3.del(k);
    await raw.del('stale');
    expect(await s3.list({ pageSize: 2 })).toEqual([]);
  });

  it('probe(): Startprüfung schreibt, liest und löscht ein Probeobjekt', async () => {
    const s3 = new S3Backend(base({ prefix: `${runId}/probe` }), fast);
    await s3.probe();
    const left = new S3Backend(base({ prefix: `${runId}/probe/${PROBE_PREFIX}` }), fast);
    // Probe-Schlüssel haben ein Format mit „-“ und Ziffern → list() würde sie zeigen, wenn sie blieben
    expect(await left.list()).toEqual([]);
  });

  it('falsche Zugangsdaten → verständlicher Fehler', async () => {
    await expectS3Error(new S3Backend(base({ secretAccessKey: 'falsches-geheimnis-xyz' }), fast).get('bx'), 'SignatureDoesNotMatch', /S3_SECRET_ACCESS_KEY prüfen/);
    await expectS3Error(new S3Backend(base({ accessKeyId: 'GIBTESNICHT', secretAccessKey: 'falsches-geheimnis-xyz' }), fast).probe(), 'InvalidAccessKeyId', /Startprüfung fehlgeschlagen \(Auflisten.*S3_ACCESS_KEY_ID prüfen/);
  });

  it('fehlender Bucket und Bucket ohne Berechtigung', async () => {
    // paraph-missing ist in der Policy freigegeben, existiert aber nicht → NoSuchBucket
    await expectS3Error(new S3Backend(base({ bucket: E.S3_TEST_BUCKET_MISSING ?? 'paraph-missing' }), fast).probe(), 'NoSuchBucket', /existiert nicht/);
    // Ohne Berechtigung meldet S3 (wie AWS) bei fehlendem Bucket AccessDenied statt NoSuchBucket
    await expectS3Error(new S3Backend(base({ bucket: `paraph-fehlt-${runId}` }), fast).probe(), 'AccessDenied', /existiert nicht oder/);
    // Least-Privilege: der Benutzer darf nur auf seine Buckets, nicht auf paraph-forbidden
    await expectS3Error(new S3Backend(base({ bucket: 'paraph-forbidden' }), fast).probe(), 'AccessDenied', /Zugriff verweigert/);
  });

  it('Bucketname mit Punkt (Pfadstil, auch wenn virtual-hosted gewünscht wäre)', async () => {
    const s3 = new S3Backend(base({ bucket: E.S3_TEST_BUCKET_DOTS ?? 'paraph.test.dots', forcePathStyle: false, prefix: runId }), fast);
    await s3.probe();
    await s3.put('bdot', Buffer.from('punkt'));
    expect((await s3.get('bdot')).toString()).toBe('punkt');
    expect(await s3.list({ pageSize: 1 })).toEqual(['bdot']);
    await s3.del('bdot');
  });

  // Benutzer mit der Präfix-Policy aus dem Handbuch (Kapitel 3): nur paraph-test/paraph/*
  it.skipIf(!E.S3_TEST_PREFIX_ACCESS_KEY)('Least-Privilege-Policy mit Präfix (Beispiel aus dem Handbuch)', async () => {
    const pfx = (prefix: string) => new S3Backend(base({ accessKeyId: E.S3_TEST_PREFIX_ACCESS_KEY!, secretAccessKey: E.S3_TEST_PREFIX_SECRET!, prefix }), fast);
    const ok = pfx('paraph/');
    await ok.probe();
    await ok.put('bpfx', Buffer.from('präfix'));
    expect(await ok.list({ pageSize: 1 })).toContain('bpfx');
    await ok.del('bpfx');
    await expectS3Error(pfx('anders/').probe(), 'AccessDenied', /Zugriff verweigert/);
    await expectS3Error(pfx('').list(), 'AccessDenied', /Zugriff verweigert/);
  });

  it('temporäre Zugangsdaten (STS AssumeRole) mit S3_SESSION_TOKEN', async () => {
    const creds = await assumeRole(endpoint!, base());
    const s3 = new S3Backend(base({ ...creds, prefix: `${runId}/sts` }), fast);
    await s3.probe();
    await s3.put('bsts', Buffer.from('sts'));
    expect((await s3.get('bsts')).toString()).toBe('sts');
    await s3.del('bsts');
    // Ohne Token sind die temporären Schlüssel ungültig
    await expect(new S3Backend(base({ ...creds, sessionToken: undefined }), fast).get('bsts')).rejects.toBeInstanceOf(S3Error);
    // Verfälschtes Token wird abgelehnt
    await expect(new S3Backend(base({ ...creds, sessionToken: creds.sessionToken.slice(0, -4) + 'AAAA' }), fast).get('bsts')).rejects.toBeInstanceOf(S3Error);
  });

  describe('vollständiger Paraph-Ablauf mit S3-Backend', () => {
    let s: TestServer;
    let raw: S3Backend;
    const prefix = `${runId}/app/`;
    beforeAll(async () => {
      raw = new S3Backend(base({ prefix }), fast);
      const cfg = base({ prefix });
      s = await startTestServer({ s3: { ...cfg, endpoint: cfg.endpoint } }, undefined, undefined, { backend: raw });
    });
    afterAll(async () => {
      for (const k of await raw.list()) await raw.del(k);
      await s?.close();
    });

    it('anlegen, senden, unterschreiben, abschließen; im Bucket liegt nur Chiffrat', async () => {
      expect(await probeBackend(s.ctx)).toMatchObject({ storage: 's3' });
      const admin = await setupAdmin(s);
      const env = await admin.post('/api/v1/envelopes', { title: 'Mandatsvereinbarung S3' });
      expect(env.status).toBe(201);
      const pdfIn = await makePdf({ pages: 1, title: 'Mandatsvereinbarung S3' });
      const up = await admin.upload(`/api/v1/envelopes/${env.json.id}/documents`, 'vertrag.pdf', pdfIn);
      expect(up.status).toBe(201);
      const recs = await admin.put(`/api/v1/envelopes/${env.json.id}/recipients`, [{ ref: 'm', name: 'Erika Muster', email: 'erika@example.org' }]);
      expect(recs.status).toBe(200);
      const f = await admin.put(`/api/v1/envelopes/${env.json.id}/fields`, [{ type: 'signature', document: up.json.id, recipient: recs.json.refs.m, page: 0, x: 0.12, y: 0.78, w: 0.32, h: 0.07 }]);
      expect(f.status).toBe(200);
      expect((await admin.post(`/api/v1/envelopes/${env.json.id}/send`, {})).status).toBe(200);

      const signer = new Signer(s);
      const open = await signer.open(lastMail(s, 'erika@example.org')!.link!);
      expect(open.status).toBe(200);
      const view = open.json.view;
      const signatures: Record<string, string> = {};
      for (const fl of view.fields.filter((x: any) => x.mine && x.type === 'signature')) {
        const sig = await signer.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
        signatures[fl.key] = sig.json.id;
      }
      const done = await signer.req('POST', '/api/sign/complete', { values: {}, signatures, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: view.documents.map((d: any) => d.sha256), completion_key: 'ck_s3_' + runId });
      expect(done.status).toBe(200);
      await jobs(s);

      const st = await admin.get(`/api/v1/envelopes/${env.json.id}`);
      expect(st.json.status).toBe('completed');
      const final = await admin.get(`/api/v1/envelopes/${env.json.id}/files/final`);
      expect(final.status).toBe(200);
      const pdf = Buffer.from(final.body);
      expect(sha256Hex(pdf)).toBe(st.json.result.final_sha256);
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(2);

      // Jeder Blob der Datenbank liegt im Bucket – und zwar nur als Chiffrat
      const dbIds = (s.ctx.db.prepare('SELECT id FROM blobs').all() as { id: string }[]).map((r) => r.id).sort();
      const inBucket = (await raw.list({ pageSize: 2 })).sort();
      expect(dbIds.length).toBeGreaterThanOrEqual(3);
      expect(inBucket).toEqual(dbIds);
      for (const k of inBucket) {
        const bytes = await raw.get(k);
        expect(bytes.includes(Buffer.from('%PDF')), `Klartext-PDF in ${k}`).toBe(false);
        expect(bytes.includes(pdfIn.subarray(0, 64))).toBe(false);
      }
      // Fehlt ein Objekt im Bucket, gibt es eine klare Meldung statt eines rohen S3-Fehlers
      const finalBlob = (s.ctx.db.prepare("SELECT id FROM blobs WHERE kind LIKE '%final%' ORDER BY created_at DESC").get() as { id: string } | undefined)?.id ?? inBucket[0]!;
      const copy = await raw.get(finalBlob);
      await raw.del(finalBlob);
      await expect(s.ctx.blobs.get(finalBlob)).rejects.toThrow(/Datei fehlt im Speicher/);
      await raw.put(finalBlob, copy);
      expect(sha256Hex(await s.ctx.blobs.get(finalBlob))).toBeTruthy();
    });
  });
});

/** Minimaler STS-AssumeRole-Aufruf (SigV4, Dienst „sts“) – nur für den Test der Sitzungstoken. */
async function assumeRole(ep: string, c: S3Cfg) {
  const u = new URL(ep);
  const body = 'Action=AssumeRole&DurationSeconds=900&Version=2011-06-15';
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const ph = createHash('sha256').update(body).digest('hex');
  const h: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', host: u.host, 'x-amz-content-sha256': ph, 'x-amz-date': amz };
  const signed = Object.keys(h).sort();
  const canon = ['POST', '/', '', ...signed.map((k) => `${k}:${h[k]}`), '', signed.join(';'), ph].join('\n');
  const scope = `${date}/${c.region}/sts/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amz, scope, createHash('sha256').update(canon).digest('hex')].join('\n');
  const mac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
  const key = mac(mac(mac(mac('AWS4' + c.secretAccessKey, date), c.region), 'sts'), 'aws4_request');
  const sig = createHmac('sha256', key).update(sts).digest('hex');
  const { host, ...rest } = h;
  void host;
  const res = await fetch(new URL('/', u), { method: 'POST', body, headers: { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}` } });
  const xml = await res.text();
  expect(res.status, 'AssumeRole').toBe(200);
  const tag = (t: string) => new RegExp(`<${t}>([^<]+)</${t}>`).exec(xml)![1]!;
  return { accessKeyId: tag('AccessKeyId'), secretAccessKey: tag('SecretAccessKey'), sessionToken: tag('SessionToken') };
}
