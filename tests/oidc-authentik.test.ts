// Ende-zu-Ende gegen ein echtes authentik: Browser (Chromium) → Paraph-Login → authentik-Formular → Callback.
// Wird übersprungen, wenn AUTHENTIK_URL nicht gesetzt ist. Voraussetzungen:
//   AUTHENTIK_URL=http://127.0.0.1:9000   (authentik per Docker Compose, nur lokal gebunden)
//   AUTHENTIK_TOKEN=…                     (z. B. AUTHENTIK_BOOTSTRAP_TOKEN; API-Zugriff als akadmin)
//   npm run build:web                      (Paraph liefert die Oberfläche aus dist/web)
// Der Test legt Provider, Application, Gruppe, Scope-Mapping, Policy und Benutzer mit eindeutigem
// Präfix an und räumt sie danach wieder ab.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:net';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';
import { startTestServer, setupAdmin, type TestServer } from './helpers/server.js';
import { id } from '../src/server/lib/crypto.js';
import { readSession, startTotp } from '../src/server/domain/users.js';
import type { Config } from '../src/server/config.js';

const AK = process.env.AUTHENTIK_URL?.replace(/\/+$/, '');
const TOKEN = process.env.AUTHENTIK_TOKEN ?? '';
const TAG = `paraph${Date.now().toString(36)}`;
const PW = 'Test-Passwort-' + TAG;

async function ak(method: string, path: string, body?: unknown) {
  const r = await fetch(`${AK}/api/v3${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  if (!r.ok) throw new Error(`authentik ${method} ${path}: ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

const freePort = () =>
  new Promise<number>((res) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const p = (srv.address() as any).port;
      srv.close(() => res(p));
    });
  });

/** Paraph mit eigener OIDC-Konfiguration auf einem echten Port. */
async function startParaph(oidc: NonNullable<Config['oidc']>) {
  const port = await freePort();
  const appUrl = `http://localhost:${port}`;
  const s = await startTestServer({ appUrl, oidc });
  await s.app.listen({ host: '127.0.0.1', port });
  return { s, appUrl };
}

describe.skipIf(!AK)('OIDC mit echtem authentik', () => {
  const created: { path: string }[] = [];
  const users: Record<string, { pk: number; email: string; username: string }> = {};
  let issuer = '';
  let client = { id: '', secret: '' };
  let brokenClient = { id: '', secret: '', issuer: '' };
  let browser: Browser;
  let P: Awaited<ReturnType<typeof startParaph>>;
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let orgId = '';
  const group = `${TAG}-paraph`;

  beforeAll(async () => {
    // ── authentik einrichten (wie in docs/handbuch/09-anmeldung-und-sso.md beschrieben) ──
    const flows = (await ak('GET', '/flows/instances/?designation=authorization')).results;
    const authz = flows.find((f: any) => f.slug === 'default-provider-authorization-implicit-consent').pk;
    const inval = (await ak('GET', '/flows/instances/?slug=default-provider-invalidation-flow')).results[0].pk;
    const key = (await ak('GET', '/crypto/certificatekeypairs/?has_key=true')).results[0].pk;
    const scopes = (await ak('GET', '/propertymappings/provider/scope/')).results;
    const std = scopes.filter((m: any) => m.managed && ['openid', 'profile'].includes(m.scope_name)).map((m: any) => m.pk);
    // Standard-Mapping „email“ liefert email_verified immer false; hier aus einem Benutzerattribut
    const mail = await ak('POST', '/propertymappings/provider/scope/', {
      name: `${TAG} email (verified-Attribut)`,
      scope_name: 'email',
      expression: 'return {"email": request.user.email, "email_verified": bool(request.user.attributes.get("email_verified", False))}',
    });
    created.push({ path: `/propertymappings/provider/scope/${mail.pk}/` });
    const redirect = (url: string) => [{ matching_mode: 'strict', url }];

    // Paraph braucht die Redirect-URI vor dem Anlegen des Providers → Port vorab bestimmen
    const port = await freePort();
    const appUrl = `http://localhost:${port}`;
    const prov = await ak('POST', '/providers/oauth2/', {
      name: `${TAG} Paraph`,
      authorization_flow: authz,
      invalidation_flow: inval,
      client_type: 'confidential',
      grant_types: ['authorization_code'],
      signing_key: key,
      property_mappings: [...std, mail.pk],
      redirect_uris: redirect(`${appUrl}/api/auth/oidc/callback`),
    });
    created.push({ path: `/providers/oauth2/${prov.pk}/` });
    const app = await ak('POST', '/core/applications/', { name: `${TAG} Paraph`, slug: TAG, provider: prov.pk });
    created.unshift({ path: `/core/applications/${TAG}/` });
    issuer = `${AK}/application/o/${TAG}/`;
    client = { id: prov.client_id, secret: prov.client_secret };

    // Fehlkonfigurierter Provider (ohne Grant-Type) → authentik antwortet mit error=invalid_request
    const broken = await ak('POST', '/providers/oauth2/', { name: `${TAG} kaputt`, authorization_flow: authz, invalidation_flow: inval, client_type: 'confidential', signing_key: key, property_mappings: [...std, mail.pk], redirect_uris: redirect('http://localhost:1/api/auth/oidc/callback') });
    created.push({ path: `/providers/oauth2/${broken.pk}/` });
    await ak('POST', '/core/applications/', { name: `${TAG} kaputt`, slug: `${TAG}-kaputt`, provider: broken.pk });
    created.unshift({ path: `/core/applications/${TAG}-kaputt/` });
    brokenClient = { id: broken.client_id, secret: broken.client_secret, issuer: `${AK}/application/o/${TAG}-kaputt/` };

    // Benutzer: [verifiziert, in Gruppe]
    const spec: Record<string, [boolean, boolean]> = { alice: [true, true], bob: [false, true], carol: [true, false], dave: [true, true], erin: [true, true], frank: [true, true], gina: [true, true] };
    const grp = await ak('POST', '/core/groups/', { name: group });
    created.unshift({ path: `/core/groups/${grp.pk}/` });
    for (const [n, [verified, inGroup]] of Object.entries(spec)) {
      const username = `${TAG}-${n}`;
      const email = `${n}.${TAG}@example.test`;
      const u = await ak('POST', '/core/users/', { username, name: n[0].toUpperCase() + n.slice(1), email, is_active: true, path: 'users', attributes: { email_verified: verified }, groups: inGroup ? [grp.pk] : [] });
      await ak('POST', `/core/users/${u.pk}/set_password/`, { password: PW });
      created.unshift({ path: `/core/users/${u.pk}/` });
      users[n] = { pk: u.pk, email, username };
    }
    // Policy: frank wird von authentik selbst abgewiesen
    const pol = await ak('POST', '/policies/expression/', { name: `${TAG} ohne frank`, expression: `return request.user.username != "${users.frank.username}"` });
    created.push({ path: `/policies/expression/${pol.pk}/` });
    const bind = await ak('POST', '/policies/bindings/', { policy: pol.pk, target: app.pk, order: 0 });
    created.unshift({ path: `/policies/bindings/${bind.pk}/` });

    // ── Paraph ──
    const s = await startTestServer({ appUrl, oidc: { issuer, clientId: client.id, clientSecret: client.secret, name: 'authentik', autoCreate: true, trustEmail: false, scopes: 'openid email profile', allowedGroups: [group], defaultRole: 'member' } });
    await s.app.listen({ host: '127.0.0.1', port });
    P = { s, appUrl };
    admin = await setupAdmin(s);
    orgId = (await admin.get('/api/auth/state')).json.session.org_id;
    // Bestehende Paraph-Konten (ohne SSO-Verknüpfung): alice, bob, dave (gesperrt), gina (TOTP)
    for (const n of ['alice', 'bob', 'dave', 'gina']) {
      const uid = id('usr');
      s.ctx.db.prepare('INSERT INTO users (id, email, name, created_at, disabled_at) VALUES (?, ?, ?, ?, ?)').run(uid, users[n].email, n, new Date().toISOString(), n === 'dave' ? new Date().toISOString() : null);
      s.ctx.db.prepare(`INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)`).run(orgId, uid, new Date().toISOString());
    }
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await P?.s.close();
    for (const c of created) await ak('DELETE', c.path).catch((e) => console.warn(String(e)));
  });

  const userRow = (n: string) => P.s.ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(users[n].email) as any;
  const activities = (action: string, userId: string) => P.s.ctx.db.prepare('SELECT * FROM activity WHERE action = ? AND user_id = ?').all(action, userId) as any[];

  /** Paraph-Login → „Mit authentik anmelden“ → authentik-Formular → zurück zu Paraph. */
  async function ssoLogin(ctx: BrowserContext, n: string, beforeClick?: () => Promise<void>, appUrl = P.appUrl): Promise<Page> {
    const page = await ctx.newPage();
    await page.goto(`${appUrl}/login`);
    const sso = page.getByRole('link', { name: 'Mit authentik anmelden' });
    await sso.waitFor();
    await beforeClick?.();
    await sso.click();
    await page.waitForURL((u) => u.href.startsWith(AK!));
    await page.locator('input[name=uidField]').fill(users[n].username);
    await page.locator('input[name=uidField]').press('Enter');
    const pw = page.locator('ak-stage-password input[name=password]');
    await pw.fill(PW);
    await pw.press('Enter');
    await page.waitForURL((u) => u.href.startsWith(appUrl) && !u.pathname.startsWith('/api/'), { timeout: 30_000 }).catch(() => {});
    return page;
  }
  const newCtx = () => browser.newContext({ locale: 'de-DE' });
  const state = async (page: Page) => (await page.request.get(`${P.appUrl}/api/auth/state`)).json();
  const oidcCookie = async (ctx: BrowserContext) => (await ctx.cookies()).find((c) => c.name === 'paraph_oidc');

  it('erfolgreiche Anmeldung mit verifizierter E-Mail verknüpft das Konto; alte Sitzung wird verworfen', async () => {
    const ctx = await newCtx();
    // Sitzungsfixierung: der Browser bringt bereits eine (fremde) gültige Sitzung mit
    const foreign = admin.cookie.split('=')[1];
    const page = await ssoLogin(ctx, 'alice', () => ctx.addCookies([{ name: 'paraph_session', value: foreign, url: P.appUrl }]));
    const st = await state(page);
    expect(st.session?.user.email).toBe(users.alice.email);
    expect(st.session.mfa_pending).toBe(false);
    expect(st.session.org_id).toBe(orgId);
    expect(new URL(page.url()).searchParams.get('error')).toBeNull();
    const u = userRow('alice');
    expect(u.oidc_subject).toMatch(new RegExp(`^${issuer.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\|`));
    expect(activities('auth.oidc_linked', u.id)).toHaveLength(1);
    expect(activities('auth.login_oidc', u.id)).toHaveLength(1);
    expect(await oidcCookie(ctx)).toBeUndefined();
    const now = (await ctx.cookies()).find((c) => c.name === 'paraph_session')!.value;
    expect(now).not.toBe(foreign);
    expect(readSession(P.s.ctx, foreign)).toBeNull();
    // Zweite Anmeldung: über das gespeicherte Subjekt, keine erneute Verknüpfung
    const ctx2 = await newCtx();
    await ssoLogin(ctx2, 'alice');
    expect(activities('auth.oidc_linked', u.id)).toHaveLength(1);
    expect(activities('auth.login_oidc', u.id)).toHaveLength(2);
    await ctx.close();
    await ctx2.close();
  });

  it('unbestätigte E-Mail: keine Verknüpfung, verständliche Meldung', async () => {
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'bob');
    expect(page.url()).toContain('/login?error=sso_email_unverified');
    await expect.poll(() => page.getByText('Ihre E-Mail-Adresse ist beim Anmeldedienst nicht bestätigt').count()).toBe(1);
    expect(userRow('bob').oidc_subject).toBeNull();
    expect((await state(page)).session).toBeNull();
    await ctx.close();
  });

  it('Gruppenbeschränkung greift', async () => {
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'carol');
    expect(page.url()).toContain('/login?error=sso_group');
    await expect.poll(() => page.getByText('Ihr Konto ist für diese Anwendung nicht freigeschaltet').count()).toBe(1);
    expect(userRow('carol')).toBeUndefined();
    await ctx.close();
  });

  it('gesperrter Benutzer: Meldung, keine Sitzung, keine Verknüpfung', async () => {
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'dave');
    expect(page.url()).toContain('/login?error=sso_disabled_user');
    await expect.poll(() => page.getByText('Ihr Zugang ist gesperrt').count()).toBe(1);
    expect(userRow('dave').oidc_subject).toBeNull();
    expect((await state(page)).session).toBeNull();
    await ctx.close();
  });

  it('neuer Benutzer: automatisch angelegt und mit OIDC_DEFAULT_ROLE der ältesten Organisation zugeordnet', async () => {
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'erin');
    const st = await state(page);
    expect(st.session?.user.email).toBe(users.erin.email);
    expect(st.session.org_id).toBe(orgId);
    expect(st.session.orgs[0].role).toBe('member');
    expect(activities('auth.oidc_user_created', userRow('erin').id)).toHaveLength(1);
    await ctx.close();
  });

  it('Zugriff beim IdP verweigert (Policy): authentik zeigt die Ablehnung, Paraph legt nichts an', async () => {
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'frank');
    expect(page.url().startsWith(AK!)).toBe(true);
    await expect.poll(async () => /denied|verweigert|abgelehnt/i.test(await page.locator('body').innerText())).toBe(true);
    expect(userRow('frank')).toBeUndefined();
    await ctx.close();
  });

  it('TOTP wird auch nach SSO-Anmeldung verlangt', async () => {
    const g = userRow('gina');
    const { secret } = startTotp(P.s.ctx, g.id);
    P.s.ctx.db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(g.id);
    const ctx = await newCtx();
    const page = await ssoLogin(ctx, 'gina');
    expect(new URL(page.url()).pathname).toBe('/login');
    expect((await state(page)).session.mfa_pending).toBe(true);
    // Mit offener MFA ist die API gesperrt
    expect((await page.request.get(`${P.appUrl}/api/v1/envelopes`)).status()).toBe(401);
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
    await page.locator('#code').fill(code);
    await page.getByRole('button', { name: 'Bestätigen' }).click();
    await expect.poll(async () => (await state(page)).session?.mfa_pending).toBe(false);
    await ctx.close();
  });

  it('Fehlerantwort des IdP (fehlkonfigurierter Provider) → verständliche Meldung statt JSON', async () => {
    const port = await freePort();
    // Redirect-URI des kaputten Providers auf diesen Port umstellen
    const prov = (await ak('GET', `/providers/oauth2/?client_id=${brokenClient.id}`)).results[0];
    const appUrl = `http://localhost:${port}`;
    await ak('PATCH', `/providers/oauth2/${prov.pk}/`, { redirect_uris: [{ matching_mode: 'strict', url: `${appUrl}/api/auth/oidc/callback` }] });
    const s = await startTestServer({ appUrl, oidc: { issuer: brokenClient.issuer, clientId: brokenClient.id, clientSecret: brokenClient.secret, name: 'authentik', autoCreate: false, trustEmail: false, scopes: 'openid email profile', allowedGroups: [] } });
    await s.app.listen({ host: '127.0.0.1', port });
    try {
      await setupAdmin(s);
      const ctx = await newCtx();
      const page = await ctx.newPage();
      await page.goto(`${appUrl}/login`);
      await page.getByRole('link', { name: 'Mit authentik anmelden' }).click();
      await page.waitForURL((u) => u.href.startsWith(appUrl) && u.searchParams.has('error'));
      expect(page.url()).toContain('/login?error=sso_failed');
      await expect.poll(() => page.getByText('Die Anmeldung über den Anmeldedienst ist fehlgeschlagen').count()).toBe(1);
      expect(await oidcCookie(ctx)).toBeUndefined();
      await ctx.close();
    } finally {
      await s.close();
    }
  });

  it('abgelaufener/fremder Zustand (z. B. alter Tab) → Meldung', async () => {
    const ctx = await newCtx();
    const page = await ctx.newPage();
    await page.goto(`${P.appUrl}/api/auth/oidc/callback?code=abc&state=xyz`);
    expect(page.url()).toContain('/login?error=sso_expired');
    await expect.poll(() => page.getByText('Der Anmeldevorgang ist abgelaufen').count()).toBe(1);
    await ctx.close();
  });
});
