// Einladungswege: öffentliche Formulare mit festen Kanzlei-Rollen, Linkübergabe bei „Nacheinander“, Vertretung.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, setupAdmin, Client, Signer, lastMail, type TestServer } from './helpers/server.js';
import { makePdf, signaturePng } from './helpers/pdfs.js';
import { CONSENT_VERSION } from '../src/shared/model.js';
import { reminderScan } from '../src/server/domain/maintenance.js';

let s: TestServer;
let admin: Client;
const events: { type: string; data: any }[] = [];

beforeAll(async () => {
  s = await startTestServer();
  admin = await setupAdmin(s);
  const org = s.ctx.db.prepare('SELECT id FROM orgs LIMIT 1').get() as { id: string };
  s.ctx.bus.on('org:' + org.id, (e: any) => events.push(e));
});
afterAll(async () => {
  await s.close();
});

async function complete(sg: Signer, view: any, ck: string) {
  const img = await sg.req('POST', '/api/sign/signatures', { purpose: 'signature', method: 'drawn', png_base64: signaturePng() });
  const key = view.fields.find((f: any) => f.mine && f.type === 'signature').key;
  return sg.req('POST', '/api/sign/complete', { values: {}, signatures: { [key]: img.json.id }, consent: { accepted: true, version: CONSENT_VERSION }, document_hashes: view.documents.map((d: any) => d.sha256), completion_key: ck });
}

const mailsTo = (envId: string, to: string) => s.ctx.db.prepare(`SELECT kind FROM emails WHERE envelope_id = ? AND to_addr = ?`).all(envId, to).map((m: any) => m.kind);

async function publicForm(order: 'sequential' | 'parallel', kanzleiOrder: number) {
  const t = await admin.post('/api/v1/templates', { name: `Formular ${order}` });
  await admin.upload(`/api/v1/templates/${t.json.id}/documents`, 'f.pdf', await makePdf({ title: 'Vollmacht' }));
  const roles = [
    { key: 'besucher', name: 'Besucher', kind: 'signer', routing_order: 1, auth_method: 'none', public: true },
    { key: 'anwalt', name: 'Anwalt', kind: 'signer', routing_order: kanzleiOrder, auth_method: 'none', default_name: 'Anna Anwältin', default_email: `anwalt.${order}@kanzlei.test` },
  ];
  const fields = [
    { type: 'signature', document: 0, recipient: 'besucher', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 },
    { type: 'signature', document: 0, recipient: 'anwalt', page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 },
  ];
  expect((await admin.put(`/api/v1/templates/${t.json.id}/draft`, { roles, fields, settings: { signing_order: order, reminder_days: 1 } })).status).toBe(200);
  expect((await admin.post(`/api/v1/templates/${t.json.id}/publish`, {})).status).toBe(200);
  const f = await admin.post('/api/v1/public-forms', { template_id: t.json.id, title: `Vollmacht ${order}`, require_otp: false });
  expect(f.status).toBe(201);
  const start = await new Client(s).post(`/api/public/forms/${f.json.slug}/start`, { name: 'Bea Besucherin', email: `bea.${order}@example.org` });
  expect(start.status).toBe(200);
  const sg = new Signer(s);
  sg.session = start.json.session;
  return { sg, view: start.json.view, envId: start.json.view.envelope.id as string, anwalt: `anwalt.${order}@kanzlei.test`, bea: `bea.${order}@example.org` };
}

describe('Öffentliche Formulare – feste Kanzlei-Rollen', () => {
  it('nacheinander: die Kanzlei-Rolle bekommt ihre Einladung, sobald sie an der Reihe ist; die Besucherin keine', async () => {
    const f = await publicForm('sequential', 2);
    expect(mailsTo(f.envId, f.anwalt)).toHaveLength(0);
    expect((await complete(f.sg, f.view, 'ck_pf_seq')).status).toBe(200);
    expect(mailsTo(f.envId, f.anwalt)).toEqual(['signing_request']);
    const link = lastMail(s, f.anwalt)!.link!;
    expect((await new Signer(s).open(link)).status).toBe(200);
    expect(mailsTo(f.envId, f.bea).filter((k) => k === 'signing_request' || k === 'reminder')).toHaveLength(0);
  });

  it('gleichzeitig: die Kanzlei-Rolle wird sofort eingeladen; Erinnerungen gehen nicht an die Besucherin', async () => {
    const f = await publicForm('parallel', 1);
    expect(mailsTo(f.envId, f.anwalt)).toEqual(['signing_request']);
    expect(mailsTo(f.envId, f.bea)).toHaveLength(0);
    const real = s.ctx.now;
    s.ctx.now = () => new Date(Date.now() + 3 * 86400_000);
    try {
      reminderScan(s.ctx);
    } finally {
      s.ctx.now = real;
    }
    expect(mailsTo(f.envId, f.anwalt)).toContain('reminder');
    expect(mailsTo(f.envId, f.bea)).toHaveLength(0);
  });
});

describe('Linkübergabe (ohne E-Mail-Einladungen)', () => {
  async function handoverEnvelope(title: string, extra: Record<string, unknown> = {}) {
    const pdf = (await makePdf()).toString('base64');
    const r = await admin.post('/api/v1/envelopes', {
      title,
      signing_order: 'sequential',
      documents: [{ name: 'u.pdf', file_base64: pdf }],
      recipients: [{ ref: 'a', name: 'Alma A', email: `a.${title}@example.org` }, { ref: 'b', name: 'Bert B', email: `b.${title}@example.org` }],
      fields: [{ type: 'signature', document: 0, recipient: 'a', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }, { type: 'signature', document: 0, recipient: 'b', page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06 }],
      send: true,
      notify: false,
      ...extra,
    });
    expect(r.status).toBe(201);
    return r.json;
  }

  it('nacheinander: kommt die nächste Person an die Reihe, erfährt es der Absender; Vorgangsseite und Webhook zeigen den Übergabeweg', async () => {
    const env = await handoverEnvelope('seq');
    // Beim Versand selbst keine Mail an den Absender – die Links stehen in der Antwort
    expect(mailsTo(env.id, 'admin@kanzlei.test')).toHaveLength(0);
    const a = new Signer(s);
    const o = await a.open(env.signing_links[0].url);
    expect((await complete(a, o.json.view, 'ck_handover_a')).status).toBe(200);
    expect(mailsTo(env.id, 'b.seq@example.org')).toHaveLength(0);
    expect(mailsTo(env.id, 'admin@kanzlei.test')).toEqual(['owner_handover']);
    const m = lastMail(s, 'admin@kanzlei.test', 'Bert B')!;
    expect(m.subject).toContain('Bert B');
    expect(m.text).toContain('Link selbst weitergeben');
    const b = (await admin.get(`/api/v1/envelopes/${env.id}`)).json.recipients.find((r: any) => r.email === 'b.seq@example.org');
    expect(b.status).toBe('sent');
    expect(b.invite_channel).toBe('link_handover');
    const ev = events.filter((e) => e.type === 'recipient.notified' && e.data.envelope_id === env.id);
    expect(ev.map((e) => e.data.channel)).toEqual(['link_handover', 'link_handover']);
  });

  it('Vertretung: auch für die Vertretung erfährt der Absender, dass er den Link übergeben muss', async () => {
    const env = await handoverEnvelope('del', { signing_order: 'parallel', allow_delegation: true });
    const a = new Signer(s);
    await a.open(env.signing_links[0].url);
    expect((await a.req('POST', '/api/sign/delegate', { name: 'Vera Vertretung', email: 'vera@example.org' })).status).toBe(200);
    expect(mailsTo(env.id, 'vera@example.org')).toHaveLength(0);
    expect(mailsTo(env.id, 'admin@kanzlei.test')).toEqual(['owner_handover']);
    expect(lastMail(s, 'admin@kanzlei.test', 'Vera Vertretung')).not.toBeNull();
  });

  it('mit E-Mail-Einladungen bekommt die Vertretung ihre Einladung selbst, der Absender keine Übergabe-Mail', async () => {
    const env = await handoverEnvelope('mail', { signing_order: 'parallel', allow_delegation: true, notify: true });
    const linkA = lastMail(s, 'a.mail@example.org')!.link!;
    const a = new Signer(s);
    await a.open(linkA);
    expect((await a.req('POST', '/api/sign/delegate', { name: 'Vito Vertretung', email: 'vito@example.org' })).status).toBe(200);
    expect(mailsTo(env.id, 'vito@example.org')).toEqual(['signing_request']);
    expect(mailsTo(env.id, 'admin@kanzlei.test')).toHaveLength(0);
  });
});
