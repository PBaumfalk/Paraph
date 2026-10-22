import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as oidc from 'openid-client';
import type { Ctx } from '../context.js';
import { authenticate, checkOrigin, cookieOpts, meta, SESSION_COOKIE } from '../http.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { secretToken, sealString, openString, id } from '../lib/crypto.js';
import { tx } from '../db/index.js';
import {
  acceptInvitation,
  changePassword,
  completeMfa,
  createUserSession,
  disableTotp,
  enableTotp,
  ensureSetupCode,
  invitationInfo,
  login,
  logActivity,
  needsSetup,
  readSession,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  setupInstance,
  startTotp,
  SESSION_MAX_D,
} from '../domain/users.js';

const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const setCookie = (reply: any, token: string) => reply.setCookie(SESSION_COOKIE, token, cookieOpts(ctx, SESSION_MAX_D * 86400));

  function me(sessionToken: string | undefined) {
    const s = readSession(ctx, sessionToken);
    if (!s) return null;
    const u = ctx.db.prepare('SELECT id, name, email, locale, totp_enabled, is_instance_admin, password_hash IS NOT NULL AS has_password FROM users WHERE id = ?').get(s.userId) as any;
    const orgs = ctx.db.prepare('SELECT o.id, o.name, o.slug, m.role FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name').all(s.userId) as any[];
    return {
      user: { ...u, totp_enabled: !!u.totp_enabled, is_instance_admin: !!u.is_instance_admin, has_password: !!u.has_password },
      org_id: s.orgId,
      orgs,
      csrf: s.csrf,
      mfa_pending: s.mfaPending,
    };
  }

  app.get('/api/auth/state', async (req) => {
    const setup = needsSetup(ctx);
    if (setup) {
      const code = ensureSetupCode(ctx);
      if (code && !ctx.cfg.setupCode) ctx.log.warn(`Ersteinrichtung: Einrichtungscode ${code} (einmalig, wird nach der Einrichtung gelöscht)`);
    }
    return {
      setup_required: setup,
      oidc: ctx.cfg.oidc ? { enabled: true, name: ctx.cfg.oidc.name } : { enabled: false },
      smtp: !!ctx.cfg.smtp,
      version: ctx.cfg.version,
      session: me(req.cookies?.[SESSION_COOKIE]),
    };
  });

  app.post('/api/auth/setup', strict, async (req, reply) => {
    checkOrigin(ctx, req);
    const b = z.object({ code: z.string(), orgName: z.string().min(1).max(120), name: z.string().min(1).max(120), email: z.string().email(), password: z.string() }).parse(req.body);
    const { userId } = setupInstance(ctx, b);
    const s = createUserSession(ctx, userId, meta(req));
    setCookie(reply, s.token);
    return { ok: true, session: me(s.token) };
  });

  app.post('/api/auth/login', strict, async (req, reply) => {
    checkOrigin(ctx, req);
    const b = z.object({ email: z.string().max(254), password: z.string().max(200) }).parse(req.body);
    const r = login(ctx, b.email, b.password, meta(req));
    setCookie(reply, r.token);
    return { ok: true, mfa_required: r.mfaRequired, session: r.mfaRequired ? null : me(r.token) };
  });

  app.post('/api/auth/mfa', strict, async (req) => {
    checkOrigin(ctx, req);
    const s = readSession(ctx, req.cookies?.[SESSION_COOKIE]);
    if (!s || !s.mfaPending) throw unauthorized();
    completeMfa(ctx, s, z.object({ code: z.string().max(12) }).parse(req.body).code);
    return { ok: true, session: me(req.cookies?.[SESSION_COOKIE]) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    checkOrigin(ctx, req);
    const s = readSession(ctx, req.cookies?.[SESSION_COOKIE]);
    if (s) revokeSession(ctx, s.idHash);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/switch-org', async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    const { org_id } = z.object({ org_id: z.string() }).parse(req.body);
    const m = ctx.db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND org_id = ?').get((p as any).userId, org_id);
    if (!m) throw forbidden();
    ctx.db.prepare('UPDATE sessions SET org_id = ? WHERE id_hash = ?').run(org_id, req.session!.idHash);
    return { ok: true };
  });

  app.post('/api/auth/password', strict, async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    const b = z.object({ current: z.string().max(200).default(''), next: z.string().max(200) }).parse(req.body);
    changePassword(ctx, (p as any).userId, b.current, b.next, req.session!.idHash);
    return { ok: true };
  });

  app.post('/api/auth/forgot', strict, async (req) => {
    checkOrigin(ctx, req);
    requestPasswordReset(ctx, z.object({ email: z.string().max(254) }).parse(req.body).email);
    return { ok: true };
  });

  app.post('/api/auth/reset', strict, async (req) => {
    checkOrigin(ctx, req);
    const b = z.object({ token: z.string().max(100), password: z.string().max(200) }).parse(req.body);
    resetPassword(ctx, b.token, b.password);
    return { ok: true };
  });

  app.get('/api/auth/invite/:token', strict, async (req) => {
    const { inv, userExists } = invitationInfo(ctx, (req.params as any).token);
    return { email: inv.email, org: inv.org_name, role: inv.role, user_exists: userExists };
  });

  app.post('/api/auth/invite/:token/accept', strict, async (req, reply) => {
    checkOrigin(ctx, req);
    const b = z.object({ name: z.string().max(120).optional(), password: z.string().max(200).optional() }).parse(req.body ?? {});
    const s = readSession(ctx, req.cookies?.[SESSION_COOKIE]);
    const r = acceptInvitation(ctx, (req.params as any).token, b, s?.userId);
    if (!s || s.userId !== r.userId) {
      const ns = createUserSession(ctx, r.userId, meta(req));
      setCookie(reply, ns.token);
      ctx.db.prepare('UPDATE sessions SET org_id = ? WHERE id_hash = (SELECT id_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1)').run(r.orgId, r.userId);
    } else {
      ctx.db.prepare('UPDATE sessions SET org_id = ? WHERE id_hash = ?').run(r.orgId, s.idHash);
    }
    return { ok: true };
  });

  app.post('/api/auth/totp/start', async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    return startTotp(ctx, (p as any).userId);
  });
  app.post('/api/auth/totp/enable', strict, async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    enableTotp(ctx, (p as any).userId, z.object({ code: z.string().max(12) }).parse(req.body).code);
    return { ok: true };
  });
  app.post('/api/auth/totp/disable', strict, async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    disableTotp(ctx, (p as any).userId, z.object({ password: z.string().max(200) }).parse(req.body).password);
    return { ok: true };
  });

  app.post('/api/auth/sessions/revoke-others', async (req) => {
    const p = authenticate(ctx, req, { allowApiKey: false });
    ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id_hash != ? AND revoked_at IS NULL').run(ctx.now().toISOString(), (p as any).userId, req.session!.idHash);
    return { ok: true };
  });

  // ───────────── OIDC (z. B. authentik) ─────────────
  // Fehler enden nie als JSON, sondern als Redirect auf /login?error=<code>; Details nur ins Log.
  // Lokale Zwei-Faktor-Pflicht gilt auch hier: Hat ein Benutzer TOTP aktiviert, wird der Code nach
  // der SSO-Anmeldung zusätzlich abgefragt. Empfehlung bleibt MFA beim IdP.
  const OIDC_COOKIE = 'paraph_oidc';
  const OIDC_PATH = '/api/auth/oidc';
  let oidcConfig: Promise<oidc.Configuration> | null = null;
  const getOidc = () => {
    const c = ctx.cfg.oidc!;
    const url = new URL(c.issuer);
    // Unverschlüsseltes HTTP nur für lokale Tests (Loopback) oder im DEV_MODE; produktiv immer HTTPS
    const insecure = url.protocol === 'http:' && (ctx.cfg.devMode || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    oidcConfig ??= oidc.discovery(url, c.clientId, c.clientSecret, undefined, insecure ? { execute: [oidc.allowInsecureRequests] } : undefined).catch((e) => {
      oidcConfig = null;
      throw e;
    });
    return oidcConfig;
  };
  const redirectUri = () => `${ctx.cfg.appUrl}/api/auth/oidc/callback`;
  const fail = (reply: any, code: string, detail?: unknown) => {
    if (detail !== undefined) ctx.log.warn({ err: detail, code }, 'OIDC-Anmeldung fehlgeschlagen');
    return reply.redirect(`/login?error=${code}`);
  };
  // Nur relative Pfade innerhalb der App (kein //host, kein Schema)
  const safeNext = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) && v.length <= 500 ? v : '/');

  app.get('/api/auth/oidc/start', async (req, reply) => {
    if (!ctx.cfg.oidc) return fail(reply, 'sso_disabled');
    let config: oidc.Configuration;
    try {
      config = await getOidc();
    } catch (e) {
      return fail(reply, 'sso_unavailable', e);
    }
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri(),
      scope: ctx.cfg.oidc.scopes,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const next = safeNext((req.query as any)?.next);
    const blob = sealString(ctx.keys.session, JSON.stringify({ verifier, state, nonce, next, exp: Date.now() + 600_000 }), 'oidc');
    reply.setCookie(OIDC_COOKIE, blob, cookieOpts(ctx, 600, OIDC_PATH));
    return reply.redirect(url.href);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    // Der Zustands-Cookie ist einmalig: in jedem Fall sofort löschen (gleiche Attribute wie beim Setzen)
    const raw = req.cookies?.[OIDC_COOKIE];
    const { maxAge: _m, ...clearOpts } = cookieOpts(ctx, 0, OIDC_PATH);
    reply.clearCookie(OIDC_COOKIE, clearOpts);
    const c = ctx.cfg.oidc;
    if (!c) return fail(reply, 'sso_disabled');
    const q = req.query as Record<string, string | undefined>;
    if (q.error) return fail(reply, q.error === 'access_denied' ? 'sso_denied' : 'sso_failed', { idp_error: q.error, description: q.error_description });
    let st: { verifier: string; state: string; nonce: string; next?: string; exp: number };
    try {
      if (!raw) throw new Error('Zustands-Cookie fehlt');
      st = JSON.parse(openString(ctx.keys.session, raw, 'oidc'));
      if (st.exp < Date.now()) throw new Error('Zustand abgelaufen');
    } catch (e) {
      return fail(reply, 'sso_expired', e);
    }
    let config: oidc.Configuration;
    try {
      config = await getOidc();
    } catch (e) {
      return fail(reply, 'sso_unavailable', e);
    }
    let claims: Record<string, unknown>;
    try {
      const current = new URL(req.url, ctx.cfg.appUrl);
      const tokens = await oidc.authorizationCodeGrant(config, current, { pkceCodeVerifier: st.verifier, expectedState: st.state, expectedNonce: st.nonce });
      claims = { ...(tokens.claims() ?? {}) };
      if (!claims.sub) throw new Error('ID-Token ohne sub');
      // Fehlen E-Mail oder Gruppen im ID-Token, ergänzt der UserInfo-Endpunkt sie (Subjekt wird geprüft)
      if ((!claims.email || (c.allowedGroups.length && !Array.isArray(claims.groups))) && config.serverMetadata().userinfo_endpoint) {
        const info = await oidc.fetchUserInfo(config, tokens.access_token, String(claims.sub));
        claims = { ...info, ...claims, email: claims.email ?? info.email, email_verified: claims.email_verified ?? info.email_verified, groups: claims.groups ?? info.groups };
      }
    } catch (e) {
      // Zustand passt nicht (z. B. alter Tab) → wie abgelaufen behandeln; sonst Tokenaustausch gescheitert
      const msg = String((e as any)?.message ?? '');
      return fail(reply, /state/i.test(msg) ? 'sso_expired' : 'sso_failed', e);
    }

    const subject = `${c.issuer}|${claims.sub}`;
    const email = String(claims.email ?? '').trim().toLowerCase();
    if (c.allowedGroups.length) {
      const groups = Array.isArray(claims.groups) ? claims.groups.map(String) : [];
      if (!groups.some((g) => c.allowedGroups.includes(g))) {
        ctx.log.info({ sub: claims.sub }, 'OIDC: keine zugelassene Gruppe');
        return fail(reply, 'sso_group');
      }
    }

    let user = ctx.db.prepare('SELECT * FROM users WHERE oidc_subject = ?').get(subject) as any;
    if (!user && email) {
      const byMail = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      if (byMail) {
        if (byMail.disabled_at) return fail(reply, 'sso_disabled_user');
        // Verknüpfung nur bei bestätigter E-Mail (oder ausdrücklich vertrauenswürdigem IdP), sonst Kontoübernahme möglich
        if (claims.email_verified !== true && !c.trustEmail) return fail(reply, 'sso_email_unverified', { sub: claims.sub, reason: 'email_verified fehlt oder false' });
        if (byMail.oidc_subject) return fail(reply, 'sso_no_account', { sub: claims.sub, reason: 'Konto bereits mit anderem SSO-Subjekt verknüpft' });
        ctx.db.prepare('UPDATE users SET oidc_subject = ? WHERE id = ?').run(subject, byMail.id);
        // In jeder Organisation des Benutzers protokollieren, damit die Verwaltung die Verknüpfung sieht
        const orgs = ctx.db.prepare('SELECT org_id FROM memberships WHERE user_id = ?').all(byMail.id) as any[];
        for (const o of orgs.length ? orgs : [{ org_id: null }]) logActivity(ctx, { orgId: o.org_id, userId: byMail.id }, 'auth.oidc_linked', email, { issuer: c.issuer, email_verified: claims.email_verified === true }, req.ip);
        user = byMail;
      }
    }
    if (!user && c.autoCreate && email) {
      const uid = id('usr');
      const now = ctx.now().toISOString();
      tx(ctx.db, () => {
        ctx.db.prepare('INSERT INTO users (id, email, name, oidc_subject, created_at) VALUES (?, ?, ?, ?, ?)').run(uid, email, String(claims.name ?? email).slice(0, 120), subject, now);
        logActivity(ctx, { userId: uid }, 'auth.oidc_user_created', undefined, { issuer: c.issuer }, req.ip);
        // Ohne OIDC_DEFAULT_ROLE treten neue SSO-Benutzer einer Organisation nur per Einladung bei
        if (c.defaultRole) {
          const org = ctx.db.prepare('SELECT id FROM orgs ORDER BY created_at, rowid LIMIT 1').get() as any;
          if (org) {
            ctx.db.prepare('INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(org.id, uid, c.defaultRole, now);
            logActivity(ctx, { orgId: org.id, userId: uid }, 'member.joined', email, { role: c.defaultRole, via: 'sso' });
          }
        }
      });
      user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    }
    if (!user) return fail(reply, 'sso_no_account');
    if (user.disabled_at) return fail(reply, 'sso_disabled_user');

    // Sitzungsfixierung: eine mitgebrachte Sitzung wird verworfen, die neue erhält ein frisches Token
    const prev = readSession(ctx, req.cookies?.[SESSION_COOKIE]);
    if (prev) revokeSession(ctx, prev.idHash);
    const s = createUserSession(ctx, user.id, meta(req), !!user.totp_enabled);
    logActivity(ctx, { userId: user.id }, 'auth.login_oidc', undefined, { mfa: !!user.totp_enabled }, req.ip);
    setCookie(reply, s.token);
    const next = safeNext(st.next);
    if (user.totp_enabled) return reply.redirect(`/login?next=${encodeURIComponent(next)}`);
    const hasOrg = ctx.db.prepare('SELECT 1 FROM memberships WHERE user_id = ? LIMIT 1').get(user.id);
    // Ohne Organisation bleibt die Sitzung bestehen (für Einladungslinks), der Login zeigt einen Hinweis
    if (!hasOrg && !next.startsWith('/invite/')) return reply.redirect('/login?error=sso_no_org');
    return reply.redirect(next);
  });

  void secretToken;
}
