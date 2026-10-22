// OIDC ohne echten IdP: Fehlerpfade enden als Redirect auf /login?error=…, nie als JSON.
// Der vollständige Browser-Ablauf gegen authentik steht in oidc-authentik.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestServer, type TestServer } from './helpers/server.js';
import { loadConfig } from '../src/server/config.js';
import { sealString } from '../src/server/lib/crypto.js';

const oidc = { issuer: 'http://127.0.0.1:9/unerreichbar/', clientId: 'paraph', clientSecret: 'x', name: 'authentik', autoCreate: false, trustEmail: false, scopes: 'openid email profile', allowedGroups: [] };

describe('OIDC-Fehlerpfade', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startTestServer({ oidc });
  });
  afterAll(() => s.close());

  const get = (url: string, cookie?: string) => s.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const cleared = (r: any) => [r.headers['set-cookie']].flat().some((c: string) => /^paraph_oidc=;/.test(c) && /Path=\/api\/auth\/oidc/.test(c) && /Expires=Thu, 01 Jan 1970/.test(c));

  it('IdP nicht erreichbar → sso_unavailable', async () => {
    const r = await get('/api/auth/oidc/start');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/login?error=sso_unavailable');
  });

  it('IdP meldet access_denied → sso_denied, Zustands-Cookie wird gelöscht', async () => {
    const r = await get('/api/auth/oidc/callback?error=access_denied&state=abc', 'paraph_oidc=irgendwas');
    expect(r.headers.location).toBe('/login?error=sso_denied');
    expect(cleared(r)).toBe(true);
  });

  it('anderer IdP-Fehler → sso_failed', async () => {
    const r = await get('/api/auth/oidc/callback?error=invalid_request&state=abc');
    expect(r.headers.location).toBe('/login?error=sso_failed');
  });

  it('ohne oder mit abgelaufenem Zustand → sso_expired', async () => {
    expect((await get('/api/auth/oidc/callback?code=x&state=y')).headers.location).toBe('/login?error=sso_expired');
    expect((await get('/api/auth/oidc/callback?code=x&state=y', 'paraph_oidc=kaputt')).headers.location).toBe('/login?error=sso_expired');
    const old = sealString(s.ctx.keys.session, JSON.stringify({ verifier: 'v', state: 'y', nonce: 'n', exp: Date.now() - 1000 }), 'oidc');
    const r = await get('/api/auth/oidc/callback?code=x&state=y', `paraph_oidc=${old}`);
    expect(r.headers.location).toBe('/login?error=sso_expired');
    expect(cleared(r)).toBe(true);
  });

  it('ohne OIDC-Konfiguration → sso_disabled', async () => {
    const t = await startTestServer();
    try {
      const r = await t.app.inject({ method: 'GET', url: '/api/auth/oidc/start' });
      expect(r.headers.location).toBe('/login?error=sso_disabled');
    } finally {
      await t.close();
    }
  });
});

describe('OIDC-Konfiguration', () => {
  const withEnv = (vars: Record<string, string>, fn: () => void) => {
    const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
  };
  const dir = () => mkdtempSync(join(tmpdir(), 'paraph-cfg-'));

  it('liest Gruppen, Scopes, Rolle; Standardwerte sicher', () => {
    withEnv({ OIDC_ISSUER: 'https://idp.test/application/o/paraph/', OIDC_ALLOWED_GROUPS: ' paraph-users , kanzlei ', OIDC_DEFAULT_ROLE: 'Viewer' }, () => {
      const c = loadConfig({ dataDir: dir() }).oidc!;
      expect(c.allowedGroups).toEqual(['paraph-users', 'kanzlei']);
      expect(c.scopes).toBe('openid email profile');
      expect(c.defaultRole).toBe('viewer');
      expect(c.trustEmail).toBe(false);
    });
  });

  it('OIDC_DEFAULT_ROLE admin/owner wird abgelehnt', () => {
    for (const r of ['admin', 'owner']) withEnv({ OIDC_ISSUER: 'https://idp.test/', OIDC_DEFAULT_ROLE: r }, () => expect(() => loadConfig({ dataDir: dir() })).toThrow(/OIDC_DEFAULT_ROLE/));
  });
});
