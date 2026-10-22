// Testserver: echte App, echte SQLite-Datenbank, echte Dateiablage in einem Temp-Verzeichnis.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { loadConfig, type Config } from '../../src/server/config.js';
import { createContext, type Ctx } from '../../src/server/context.js';
import { buildApp } from '../../src/server/app.js';
import { drain } from '../../src/server/domain/jobs.js';
import { ensureSetupCode } from '../../src/server/domain/users.js';
import { openString } from '../../src/server/lib/crypto.js';
import type { FastifyInstance } from 'fastify';
import type { BlobBackend } from '../../src/server/lib/storage.js';

export interface TestServer {
  ctx: Ctx;
  app: FastifyInstance;
  dir: string;
  close: () => Promise<void>;
}

export async function startTestServer(overrides: Partial<Config> = {}, dir = mkdtempSync(join(tmpdir(), 'paraph-test-')), masterKey = randomBytes(32), opts: { backend?: BlobBackend } = {}): Promise<TestServer> {
  const cfg = loadConfig({ dataDir: dir, appUrl: 'http://paraph.test', masterKey, ...overrides });
  const ctx = createContext(cfg, { log: pino({ level: process.env.TEST_LOG ?? 'silent' }), backend: opts.backend });
  const app = await buildApp(ctx);
  await app.ready();
  return { ctx, app, dir, close: async () => { await app.close(); ctx.db.close(); } };
}

export class Client {
  cookie = '';
  csrf = '';
  constructor(public s: TestServer, public bearer?: string) {}

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.bearer) h.authorization = `Bearer ${this.bearer}`;
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    const res = await this.s.app.inject({ method: method as any, url, payload: body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), headers: h });
    const sc = res.headers['set-cookie'];
    if (sc) {
      const arr = Array.isArray(sc) ? sc : [sc];
      for (const c of arr) {
        const m = /^paraph_session=([^;]*)/.exec(c);
        if (m) this.cookie = m[1] ? `paraph_session=${m[1]}` : '';
      }
    }
    let json: any = undefined;
    try {
      json = res.json();
    } catch {}
    return { status: res.statusCode, json, body: res.rawPayload, headers: res.headers };
  }
  get(url: string, headers?: Record<string, string>) {
    return this.req('GET', url, undefined, headers);
  }
  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.req('POST', url, body ?? {}, headers);
  }
  put(url: string, body: unknown) {
    return this.req('PUT', url, body);
  }
  patch(url: string, body: unknown) {
    return this.req('PATCH', url, body);
  }
  del(url: string) {
    return this.req('DELETE', url);
  }

  async refreshCsrf() {
    const st = await this.get('/api/auth/state');
    this.csrf = st.json.session?.csrf ?? '';
    return st.json;
  }

  async upload(url: string, name: string, bytes: Buffer, mime = 'application/pdf') {
    const boundary = '----paraph' + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return this.req('POST', url, body, { 'content-type': `multipart/form-data; boundary=${boundary}` });
  }
}

/** Ersteinrichtung + Anmeldung als Inhaber. */
export async function setupAdmin(s: TestServer, email = 'admin@kanzlei.test', orgName = 'Kanzlei Test') {
  const c = new Client(s);
  const code = ensureSetupCode(s.ctx)!;
  const r = await c.post('/api/auth/setup', { code, orgName, name: 'Anna Admin', email, password: 'sehr-sicheres-passwort-1' });
  if (r.status !== 200) throw new Error('Setup fehlgeschlagen: ' + JSON.stringify(r.json));
  await c.refreshCsrf();
  return c;
}

/** Signer-Client: arbeitet mit dem Header-Token wie die echte Oberfläche. */
export class Signer {
  session = '';
  constructor(public s: TestServer) {}
  async open(link: string) {
    const token = link.split('/s/')[1];
    const r = await this.s.app.inject({ method: 'POST', url: '/api/sign/open', payload: { token }, headers: { 'content-type': 'application/json', 'user-agent': 'Vitest-Signer/1.0' } });
    if (r.statusCode === 200) this.session = r.json().session;
    return { status: r.statusCode, json: r.json() };
  }
  async req(method: string, url: string, body?: unknown) {
    const r = await this.s.app.inject({ method: method as any, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'x-signer-session': this.session, 'user-agent': 'Vitest-Signer/1.0', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) } });
    let json: any;
    try {
      json = r.json();
    } catch {}
    return { status: r.statusCode, json, body: r.rawPayload };
  }
}

/** Liest die zuletzt erzeugte E-Mail an eine Adresse aus der Outbox und gibt den Link zurück. */
export function lastMail(s: TestServer, to: string, kind?: string) {
  const rows = s.ctx.db.prepare(`SELECT * FROM emails WHERE to_addr = ? ORDER BY created_at DESC, rowid DESC`).all(to) as any[];
  for (const r of rows) {
    if (!r.text_body) continue;
    const text = openString(s.ctx.keys.secrets, r.text_body, 'mail:' + r.id);
    if (kind && !text.includes(kind) && !r.subject.includes(kind)) continue;
    const link = /(https?:\/\/\S+\/(s|invite|reset)\/[A-Za-z0-9_-]+)/.exec(text)?.[1];
    return { subject: r.subject as string, text, link };
  }
  return null;
}

export function jobs(s: TestServer) {
  return drain(s.ctx);
}

export { openString };
