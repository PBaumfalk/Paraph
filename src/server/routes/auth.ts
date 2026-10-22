import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as oidc from 'openid-client';
import type { Ctx } from '../context.js';
import { authenticate, checkOrigin, cookieOpts, meta, SESSION_COOKIE } from '../http.js';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { secretToken, sealString, openString, id } from '../lib/crypto.js';
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
  let oidcConfig: Promise<oidc.Configuration> | null = null;
  const getOidc = () => {
    if (!ctx.cfg.oidc) throw new AppError(404, 'oidc_disabled', 'Anmeldung per SSO ist nicht eingerichtet.');
    oidcConfig ??= oidc.discovery(new URL(ctx.cfg.oidc.issuer), ctx.cfg.oidc.clientId, ctx.cfg.oidc.clientSecret).catch((e) => {
      oidcConfig = null;
      throw e;
    });
    return oidcConfig;
  };
  const redirectUri = () => `${ctx.cfg.appUrl}/api/auth/oidc/callback`;

  app.get('/api/auth/oidc/start', async (_req, reply) => {
    const config = await getOidc();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri(),
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const blob = sealString(ctx.keys.session, JSON.stringify({ verifier, state, nonce, exp: Date.now() + 600_000 }), 'oidc');
    reply.setCookie('paraph_oidc', blob, cookieOpts(ctx, 600, '/api/auth/oidc'));
    return reply.redirect(url.href);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const config = await getOidc();
    const raw = req.cookies?.paraph_oidc;
    reply.clearCookie('paraph_oidc', { path: '/api/auth/oidc' });
    if (!raw) throw badRequest('oidc_state', 'Anmeldevorgang abgelaufen. Bitte erneut versuchen.');
    const st = JSON.parse(openString(ctx.keys.session, raw, 'oidc'));
    if (st.exp < Date.now()) throw badRequest('oidc_state', 'Anmeldevorgang abgelaufen.');
    const current = new URL(req.url, ctx.cfg.appUrl);
    const tokens = await oidc.authorizationCodeGrant(config, current, { pkceCodeVerifier: st.verifier, expectedState: st.state, expectedNonce: st.nonce });
    const claims = tokens.claims();
    if (!claims?.sub) throw badRequest('oidc_claims', 'Keine Benutzerkennung erhalten.');
    const email = String(claims.email ?? '').toLowerCase();
    let user = ctx.db.prepare('SELECT * FROM users WHERE oidc_subject = ?').get(`${ctx.cfg.oidc!.issuer}|${claims.sub}`) as any;
    if (!user && email && claims.email_verified !== false) {
      user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) ctx.db.prepare('UPDATE users SET oidc_subject = ? WHERE id = ?').run(`${ctx.cfg.oidc!.issuer}|${claims.sub}`, user.id);
    }
    if (!user && ctx.cfg.oidc!.autoCreate && email) {
      // Neue SSO-Benutzer erhalten nur ein Konto; einer Organisation treten sie per Einladung bei
      const uid = id('usr');
      ctx.db.prepare('INSERT INTO users (id, email, name, oidc_subject, created_at) VALUES (?, ?, ?, ?, ?)').run(uid, email, String(claims.name ?? email), `${ctx.cfg.oidc!.issuer}|${claims.sub}`, ctx.now().toISOString());
      user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    }
    if (!user || user.disabled_at) return reply.redirect('/login?error=sso_no_account');
    const s = createUserSession(ctx, user.id, meta(req), false);
    logActivity(ctx, { userId: user.id }, 'auth.login_oidc', undefined, {}, req.ip);
    setCookie(reply, s.token);
    return reply.redirect('/');
  });

  void secretToken;
}
