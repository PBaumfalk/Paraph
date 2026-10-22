// TEST G – Vorgang komplett über die API, signierte Webhooks mit Wiederholung, Idempotenz, Testmodus, SSRF-Schutz.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { startTestServer, setupAdmin, Client, Signer, jobs, type TestServer } from './helpers/server.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { CONSENT_VERSION } from '../src/shared/model.js';

let s: TestServer;
let admin: Client;
let hookServer: Server;
let port = 0;
const received: { headers: any; body: string; status: number }[] = [];
let failNext = 1; // erste Zustellung schlägt fehl → Wiederholung

beforeAll(async () => {
  hookServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const status = failNext-- > 0 ? 500 : 200;
      received.push({ headers: req.headers, body, status });
      res.writeHead(status).end();
    });
  });
  await new Promise<void>((r) => hookServer.listen(0, '127.0.0.1', () => r()));
  port = (hookServer.address() as any).port;
  s = await startTestServer({ webhookAllowHosts: ['127.0.0.1'] });
  admin = await setupAdmin(s);
});
afterAll(async () => {
  await s.close();
  hookServer.close();
});

function verifySig(secret: string, h: any, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${h['webhook-id']}.${h['webhook-timestamp']}.${body}`).digest('base64');
  return h['webhook-signature'] === `v1,${expected}`;
}

async function advance(minutes: number) {
  const real = s.ctx.now;
  const t = Date.now() + minutes * 60_000;
  s.ctx.now = () => new Date(t);
  try {
    await jobs(s);
  } finally {
    s.ctx.now = real;
  }
}

describe('TEST G – API und Webhooks', () => {
  it('kompletter Ablauf mit API-Schlüssel, Webhooks signiert und wiederholt', async () => {
    const key = await admin.post('/api/v1/api-keys', { name: 'Kanzleisoftware', scopes: ['envelopes:read', 'envelopes:write', 'webhooks:manage', 'templates:read'], mode: 'live' });
    expect(key.status).toBe(201);
    const api = new Client(s, key.json.key);

    // SSRF: interne Adresse ohne Freigabe wird abgelehnt
    const blocked = await api.post('/api/v1/webhooks', { url: 'http://10.0.0.5/hook', events: ['*'] });
    expect(blocked.status).toBe(400);

    const hook = await api.post('/api/v1/webhooks', { url: `http://127.0.0.1:${port}/paraph`, events: ['*'] });
    expect(hook.status).toBe(201);
    const secret = hook.json.secret as string;
    expect(secret).toMatch(/^whsec_/);

    const pdf = (await makePdf({ title: 'Honorarvereinbarung' })).toString('base64');
    const body = {
      title: 'Honorarvereinbarung 7/26',
      external_ref: '7/26',
      documents: [{ name: 'Honorar.pdf', file_base64: pdf }],
      recipients: [{ ref: 'm', name: 'Moritz Mandant', email: 'moritz@example.org' }],
      fields: [
        { type: 'signature', recipient: 'm', anchor: { text: 'Unterschrift:', offset_x: 0, offset_y: -40, width: 180, height: 36 } },
        { type: 'signed_date', recipient: 'm', anchor: { text: 'Datum:', offset_y: -18, width: 100, height: 16 } },
      ],
      send: true,
      notify: false,
    };
    const first = await api.post('/api/v1/envelopes', body, { 'idempotency-key': 'akte-7-26' });
    expect(first.status).toBe(201);
    expect(first.json.signing_links).toHaveLength(1);
    // Wiederholter Aufruf (Netzwerkabbruch beim Client) → gleiche Antwort, kein zweiter Vorgang
    const replay = await api.post('/api/v1/envelopes', body, { 'idempotency-key': 'akte-7-26' });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.json.id).toBe(first.json.id);
    const changed = await api.post('/api/v1/envelopes', { ...body, title: 'anders' }, { 'idempotency-key': 'akte-7-26' });
    expect(changed.status).toBe(422);
    expect((await api.get('/api/v1/envelopes?external_ref=7/26')).json.data).toHaveLength(1);

    // Ankertext hat das Feld über „Unterschrift:“ platziert (Seite 1, unteres Viertel)
    const sig = first.json.fields.find((f: any) => f.type === 'signature');
    expect(sig.page).toBe(0);
    expect(sig.y).toBeGreaterThan(0.7);
    expect(sig.x).toBeLessThan(0.2);

    // Unterzeichnen über den zurückgegebenen Link
    const signer = new Signer(s);
    const o = await signer.open(first.json.signing_links[0].url);
    expect(o.status).toBe(200);
    const sg = await signer.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
    const done = await signer.req('POST', '/api/sign/complete', { values: {}, signatures: { [sig.key]: sg.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: o.json.view.documents.map((d: any) => d.sha256), completion_key: 'ck_api_flow' });
    expect(done.status).toBe(200);
    await jobs(s);
    await advance(10); // fällige Wiederholungen
    await advance(30);

    const env = (await api.get(`/api/v1/envelopes/${first.json.id}`)).json;
    expect(env.status).toBe('completed');
    expect((await api.get(`/api/v1/envelopes/${first.json.id}/files/final`)).status).toBe(200);
    expect((await api.get(`/api/v1/envelopes/${first.json.id}/audit`)).json.chain.ok).toBe(true);

    // Webhooks: signiert, alle Ereignisse angekommen, erste Zustellung wiederholt
    const ok = received.filter((r) => r.status === 200);
    const types = ok.map((r) => JSON.parse(r.body).type);
    expect(types).toEqual(expect.arrayContaining(['envelope.sent', 'recipient.notified', 'recipient.viewed', 'recipient.signed', 'envelope.completed']));
    for (const r of received) expect(verifySig(secret, r.headers, r.body)).toBe(true);
    expect(verifySig(secret, { ...received[0].headers, 'webhook-timestamp': '1' }, received[0].body)).toBe(false);
    const retried = received.filter((r) => r.headers['webhook-id'] === received[0].headers['webhook-id']);
    expect(retried.map((r) => r.status)).toEqual([500, 200]);
    const list = (await api.get('/api/v1/webhooks')).json.data[0].recent;
    expect(list.every((d: any) => d.status === 'delivered')).toBe(true);
    expect(list.some((d: any) => d.attempts === 2)).toBe(true);
  });

  it('Testmodus: getrennte Daten, keine E-Mails, Wasserzeichen; Live-Schlüssel sieht nichts davon', async () => {
    const tk = await admin.post('/api/v1/api-keys', { name: 'Sandbox', scopes: ['envelopes:read', 'envelopes:write'], mode: 'test' });
    const test = new Client(s, tk.json.key);
    const pdf = (await makePdf()).toString('base64');
    const r = await test.post('/api/v1/envelopes', { title: 'Sandbox', documents: [{ name: 'x.pdf', file_base64: pdf }], recipients: [{ ref: 'a', name: 'A', email: 'a@test.example' }], fields: [{ type: 'signature', document: 0, recipient: 'a', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }], send: true });
    expect(r.status).toBe(201);
    expect(r.json.test_mode).toBe(true);
    expect(r.json.signing_links).toHaveLength(1); // im Testmodus immer zurückgegeben
    const mails = s.ctx.db.prepare(`SELECT status FROM emails WHERE envelope_id = ?`).all(r.json.id) as any[];
    expect(mails.every((m) => m.status === 'suppressed')).toBe(true);
    const live = await admin.post('/api/v1/api-keys', { name: 'Live', scopes: ['envelopes:read'], mode: 'live' });
    expect((await new Client(s, live.json.key).get(`/api/v1/envelopes/${r.json.id}`)).status).toBe(404);
    expect((await test.get('/api/v1/envelopes')).json.data.every((e: any) => e.test_mode)).toBe(true);
    // Widerrufener Schlüssel funktioniert sofort nicht mehr
    await admin.del(`/api/v1/api-keys/${tk.json.id}`);
    expect((await test.get('/api/v1/envelopes')).status).toBe(401);
    // Ohne Schreibrecht kein Anlegen
    expect((await new Client(s, live.json.key).post('/api/v1/envelopes', { title: 'x' })).status).toBe(403);
  });

  it('OpenAPI-Dokument ist gültig strukturiert', async () => {
    const r = await new Client(s).get('/api/v1/openapi.json');
    expect(r.json.openapi).toBe('3.1.0');
    expect(Object.keys(r.json.paths).length).toBeGreaterThan(20);
  });
});
