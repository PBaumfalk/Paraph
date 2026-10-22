// Benutzer, Sitzungen, Zwei-Faktor, Einladungen, API-Schlüssel, Ersteinrichtung.
import * as OTPAuth from 'otpauth';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { hashToken, id, openString, sealString, secretToken, safeEqual } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden, notFound, tooMany, unauthorized } from '../lib/errors.js';
import { hashSecret, verifySecret } from './secrets.js';
import { DEFAULT_BRANDING, DEFAULT_SETTINGS, getOrg, slugify } from './orgs.js';
import { SCOPES, type Principal, type Role, type Scope } from './authz.js';
import { queueMail } from './mail.js';

export const SESSION_IDLE_H = 12;
export const SESSION_MAX_D = 14;

export function logActivity(ctx: Ctx, p: { orgId?: string | null; userId?: string | null; apiKeyId?: string | null }, action: string, target?: string, detail: Record<string, unknown> = {}, ip?: string) {
  ctx.db
    .prepare('INSERT INTO activity (org_id, user_id, api_key_id, action, target, detail, ip, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.orgId ?? null, p.userId ?? null, p.apiKeyId ?? null, action, target ?? null, JSON.stringify(detail), ip ?? null, ctx.now().toISOString());
}

export function validatePassword(pw: string) {
  if (typeof pw !== 'string' || pw.length < 10) throw badRequest('weak_password', 'Das Passwort muss mindestens 10 Zeichen haben.');
  if (pw.length > 200) throw badRequest('weak_password', 'Das Passwort ist zu lang.');
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|passwort|password)/i.test(pw)) throw badRequest('weak_password', 'Dieses Passwort ist zu leicht zu erraten.');
}

// ───────────────────────────── Ersteinrichtung ─────────────────────────────

export function needsSetup(ctx: Ctx) {
  return (ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n === 0;
}

/** Einrichtungscode: aus SETUP_CODE oder einmalig erzeugt und im Log ausgegeben. */
export function ensureSetupCode(ctx: Ctx): string | null {
  if (!needsSetup(ctx)) return null;
  if (ctx.cfg.setupCode) return ctx.cfg.setupCode;
  let row = ctx.db.prepare(`SELECT value FROM meta WHERE key = 'setup_code'`).get() as any;
  if (!row) {
    const code = secretToken(12);
    ctx.db.prepare(`INSERT INTO meta (key, value) VALUES ('setup_code', ?)`).run(code);
    row = { value: code };
  }
  return row.value;
}

export function createOrg(ctx: Ctx, name: string) {
  const orgId = id('org');
  let slug = slugify(name);
  if (ctx.db.prepare('SELECT 1 FROM orgs WHERE slug = ?').get(slug)) slug = `${slug}-${orgId.slice(-5).toLowerCase()}`;
  ctx.db
    .prepare('INSERT INTO orgs (id, name, slug, branding, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orgId, name.trim().slice(0, 120), slug, JSON.stringify(DEFAULT_BRANDING), JSON.stringify(DEFAULT_SETTINGS), ctx.now().toISOString());
  return orgId;
}

export function setupInstance(ctx: Ctx, input: { code: string; orgName: string; name: string; email: string; password: string }) {
  const expected = ensureSetupCode(ctx);
  if (!expected) throw conflict('already_setup', 'Die Instanz ist bereits eingerichtet.');
  if (!input.code || !safeEqual(input.code.trim(), expected)) throw new AppError(401, 'wrong_setup_code', 'Der Einrichtungscode ist falsch. Er steht im Server-Log bzw. in SETUP_CODE.');
  validatePassword(input.password);
  return tx(ctx.db, () => {
    if (!needsSetup(ctx)) throw conflict('already_setup', 'Die Instanz ist bereits eingerichtet.');
    const orgId = createOrg(ctx, input.orgName || 'Meine Kanzlei');
    const userId = id('usr');
    ctx.db
      .prepare('INSERT INTO users (id, email, name, password_hash, is_instance_admin, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .run(userId, input.email.trim().toLowerCase(), input.name.trim().slice(0, 120), hashSecret(input.password), ctx.now().toISOString());
    ctx.db.prepare(`INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`).run(orgId, userId, ctx.now().toISOString());
    ctx.db.prepare(`DELETE FROM meta WHERE key = 'setup_code'`).run();
    logActivity(ctx, { orgId, userId }, 'instance.setup');
    return { userId, orgId };
  });
}

// ───────────────────────────── Sitzungen ─────────────────────────────

export function createUserSession(ctx: Ctx, userId: string, meta: { ip: string; ua: string }, mfaPending = false) {
  const token = secretToken();
  const csrf = secretToken(18);
  const now = ctx.now();
  const m = ctx.db.prepare('SELECT org_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1').get(userId) as any;
  ctx.db
    .prepare(
      `INSERT INTO sessions (id_hash, user_id, org_id, csrf, mfa_pending, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(hashToken(token), userId, m?.org_id ?? null, csrf, mfaPending ? 1 : 0, meta.ip, meta.ua.slice(0, 300), now.toISOString(), now.toISOString(), new Date(now.getTime() + SESSION_MAX_D * 86400_000).toISOString());
  return { token, csrf };
}

export interface SessionInfo {
  idHash: string;
  userId: string;
  orgId: string | null;
  csrf: string;
  mfaPending: boolean;
}

export function readSession(ctx: Ctx, token: string | undefined): SessionInfo | null {
  if (!token || token.length > 100) return null;
  const s = ctx.db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(hashToken(token)) as any;
  if (!s || s.revoked_at) return null;
  const now = ctx.now();
  if (new Date(s.expires_at) <= now) return null;
  if (now.getTime() - new Date(s.last_seen_at).getTime() > SESSION_IDLE_H * 3600_000) return null;
  const u = ctx.db.prepare('SELECT disabled_at FROM users WHERE id = ?').get(s.user_id) as any;
  if (!u || u.disabled_at) return null;
  if (now.getTime() - new Date(s.last_seen_at).getTime() > 60_000) ctx.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(now.toISOString(), s.id_hash);
  return { idHash: s.id_hash, userId: s.user_id, orgId: s.org_id, csrf: s.csrf, mfaPending: !!s.mfa_pending };
}

export function principalFromSession(ctx: Ctx, s: SessionInfo): Principal | null {
  if (s.mfaPending || !s.orgId) return null;
  const m = ctx.db
    .prepare('SELECT m.role, u.name, u.email, u.is_instance_admin FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? AND m.org_id = ?')
    .get(s.userId, s.orgId) as any;
  if (!m) return null;
  return { kind: 'user', userId: s.userId, orgId: s.orgId, role: m.role as Role, name: m.name, email: m.email, sessionId: s.idHash, instanceAdmin: !!m.is_instance_admin };
}

export function revokeSession(ctx: Ctx, idHash: string) {
  ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?').run(ctx.now().toISOString(), idHash);
}

export function login(ctx: Ctx, email: string, password: string, meta: { ip: string; ua: string }) {
  const u = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(String(email ?? '').trim().toLowerCase()) as any;
  if (u?.locked_until && new Date(u.locked_until) > ctx.now()) throw tooMany('Zu viele Fehlversuche. Das Konto ist vorübergehend gesperrt (15 Minuten).');
  const ok = verifySecret(u?.password_hash, String(password ?? ''));
  if (!u || !ok || u.disabled_at) {
    if (u) {
      const fails = u.failed_logins + 1;
      ctx.db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails >= 5 ? 0 : fails, fails >= 5 ? new Date(ctx.now().getTime() + 15 * 60_000).toISOString() : null, u.id);
      logActivity(ctx, { userId: u.id }, 'auth.login_failed', undefined, {}, meta.ip);
    }
    throw new AppError(401, 'invalid_credentials', 'E-Mail-Adresse oder Passwort ist falsch.');
  }
  ctx.db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(u.id);
  const s = createUserSession(ctx, u.id, meta, !!u.totp_enabled);
  logActivity(ctx, { userId: u.id }, 'auth.login', undefined, { mfa: !!u.totp_enabled }, meta.ip);
  return { ...s, mfaRequired: !!u.totp_enabled };
}

// ───────────────────────────── Zwei-Faktor (TOTP) ─────────────────────────────

function totpFor(secretB32: string, label: string) {
  return new OTPAuth.TOTP({ issuer: 'Paraph', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretB32) });
}

export function startTotp(ctx: Ctx, userId: string) {
  const u = ctx.db.prepare('SELECT email, totp_enabled FROM users WHERE id = ?').get(userId) as any;
  if (u.totp_enabled) throw conflict('totp_enabled', 'Zwei-Faktor ist bereits aktiv.');
  const secret = new OTPAuth.Secret({ size: 20 });
  ctx.db.prepare('UPDATE users SET totp_secret_enc = ? WHERE id = ?').run(sealString(ctx.keys.secrets, secret.base32, 'totp:' + userId), userId);
  return { secret: secret.base32, uri: totpFor(secret.base32, u.email).toString() };
}

function checkTotp(ctx: Ctx, userId: string, code: string): boolean {
  const u = ctx.db.prepare('SELECT email, totp_secret_enc FROM users WHERE id = ?').get(userId) as any;
  if (!u?.totp_secret_enc) return false;
  const secret = openString(ctx.keys.secrets, u.totp_secret_enc, 'totp:' + userId);
  const delta = totpFor(secret, u.email).validate({ token: String(code ?? '').replace(/\s/g, ''), window: 1 });
  if (delta === null) return false;
  // Wiederverwendung desselben Codes verhindern
  const step = Math.floor(ctx.now().getTime() / 30000) + delta;
  const key = `totp_last:${userId}`;
  const last = ctx.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any;
  if (last && Number(last.value) >= step) return false;
  ctx.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(step));
  return true;
}

export function enableTotp(ctx: Ctx, userId: string, code: string) {
  if (!checkTotp(ctx, userId, code)) throw badRequest('wrong_code', 'Der Code ist falsch. Bitte Uhrzeit des Geräts prüfen.');
  ctx.db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId);
  logActivity(ctx, { userId }, 'auth.totp_enabled');
}

export function disableTotp(ctx: Ctx, userId: string, password: string) {
  const u = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
  if (!verifySecret(u.password_hash, password)) throw new AppError(401, 'invalid_credentials', 'Passwort ist falsch.');
  ctx.db.prepare('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL WHERE id = ?').run(userId);
  logActivity(ctx, { userId }, 'auth.totp_disabled');
}

export function completeMfa(ctx: Ctx, s: SessionInfo, code: string) {
  const fails = ctx.db.prepare('SELECT value FROM meta WHERE key = ?').get(`mfa_fail:${s.idHash}`) as any;
  if (fails && Number(fails.value) >= 5) {
    revokeSession(ctx, s.idHash);
    throw tooMany('Zu viele Fehlversuche. Bitte erneut anmelden.');
  }
  if (!checkTotp(ctx, s.userId, code)) {
    ctx.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(`mfa_fail:${s.idHash}`, String((Number(fails?.value) || 0) + 1));
    throw new AppError(401, 'wrong_code', 'Der Code ist falsch.');
  }
  ctx.db.prepare('DELETE FROM meta WHERE key = ?').run(`mfa_fail:${s.idHash}`);
  ctx.db.prepare('UPDATE sessions SET mfa_pending = 0 WHERE id_hash = ?').run(s.idHash);
}

// ───────────────────────────── Passwort ─────────────────────────────

export function changePassword(ctx: Ctx, userId: string, current: string, next: string, keepSession: string) {
  const u = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
  if (u.password_hash && !verifySecret(u.password_hash, current)) throw new AppError(401, 'invalid_credentials', 'Das aktuelle Passwort ist falsch.');
  validatePassword(next);
  ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(next), userId);
  ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id_hash != ? AND revoked_at IS NULL').run(ctx.now().toISOString(), userId, keepSession);
  logActivity(ctx, { userId }, 'auth.password_changed');
}

export function requestPasswordReset(ctx: Ctx, email: string) {
  const u = ctx.db.prepare('SELECT u.id, u.email, m.org_id FROM users u LEFT JOIN memberships m ON m.user_id = u.id WHERE u.email = ? AND u.disabled_at IS NULL LIMIT 1').get(String(email).trim().toLowerCase()) as any;
  if (!u || !u.org_id) return; // keine Auskunft, ob ein Konto existiert
  const token = secretToken();
  ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(`pwreset:${hashToken(token)}`, JSON.stringify({ userId: u.id, exp: ctx.now().getTime() + 3600_000 }));
  queueMail(ctx, { orgId: u.org_id, to: u.email, kind: 'password_reset', link: `${ctx.cfg.appUrl}/reset/${token}`, vars: {} });
}

export function resetPassword(ctx: Ctx, token: string, password: string) {
  const key = `pwreset:${hashToken(String(token))}`;
  const row = ctx.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any;
  if (!row) throw badRequest('invalid_token', 'Der Link ist ungültig oder wurde bereits verwendet.');
  const v = JSON.parse(row.value);
  ctx.db.prepare('DELETE FROM meta WHERE key = ?').run(key);
  if (v.exp < ctx.now().getTime()) throw badRequest('invalid_token', 'Der Link ist abgelaufen.');
  validatePassword(password);
  ctx.db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').run(hashSecret(password), v.userId);
  ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(ctx.now().toISOString(), v.userId);
  logActivity(ctx, { userId: v.userId }, 'auth.password_reset');
}

// ───────────────────────────── Team ─────────────────────────────

export function listMembers(ctx: Ctx, orgId: string) {
  return ctx.db
    .prepare(
      `SELECT u.id, u.name, u.email, m.role, u.totp_enabled, u.disabled_at, m.created_at,
       (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.name`,
    )
    .all(orgId);
}

export function inviteMember(ctx: Ctx, p: Principal & { kind: 'user' }, email: string, role: Role) {
  if (role === 'owner' && p.role !== 'owner') throw forbidden('Nur Inhaber können weitere Inhaber einladen.');
  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw badRequest('invalid_email', 'Ungültige E-Mail-Adresse.');
  const existing = ctx.db.prepare('SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = ? AND m.org_id = ?').get(e, p.orgId);
  if (existing) throw conflict('already_member', 'Diese Person ist bereits Mitglied.');
  const token = secretToken();
  const invId = id('inv');
  ctx.db
    .prepare('INSERT INTO invitations (id, org_id, email, role, token_hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(invId, p.orgId, e, role, hashToken(token), p.userId, new Date(ctx.now().getTime() + 7 * 86400_000).toISOString(), ctx.now().toISOString());
  const org = getOrg(ctx, p.orgId);
  const link = `${ctx.cfg.appUrl}/invite/${token}`;
  queueMail(ctx, { orgId: p.orgId, to: e, kind: 'user_invite', link, vars: { sender: p.name, org: org.name } });
  logActivity(ctx, { orgId: p.orgId, userId: p.userId }, 'member.invited', e, { role });
  return { id: invId, link: ctx.cfg.smtp ? undefined : link };
}

export function invitationInfo(ctx: Ctx, token: string) {
  const inv = ctx.db.prepare('SELECT i.*, o.name AS org_name FROM invitations i JOIN orgs o ON o.id = i.org_id WHERE token_hash = ?').get(hashToken(String(token))) as any;
  if (!inv || inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) <= ctx.now()) throw notFound('Die Einladung ist ungültig oder abgelaufen.');
  const user = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(inv.email);
  return { inv, userExists: !!user };
}

export function acceptInvitation(ctx: Ctx, token: string, input: { name?: string; password?: string }, currentUserId?: string) {
  return tx(ctx.db, () => {
    const { inv } = invitationInfo(ctx, token);
    let user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(inv.email) as any;
    if (user) {
      if (currentUserId !== user.id) throw new AppError(401, 'login_required', 'Bitte zuerst mit dieser E-Mail-Adresse anmelden.');
    } else {
      validatePassword(input.password ?? '');
      if (!input.name?.trim()) throw badRequest('name_required', 'Bitte Namen angeben.');
      const uid = id('usr');
      ctx.db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(uid, inv.email, input.name.trim().slice(0, 120), hashSecret(input.password!), ctx.now().toISOString());
      user = { id: uid };
    }
    ctx.db.prepare('INSERT OR IGNORE INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(inv.org_id, user.id, inv.role, ctx.now().toISOString());
    ctx.db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?').run(ctx.now().toISOString(), inv.id);
    logActivity(ctx, { orgId: inv.org_id, userId: user.id }, 'member.joined', inv.email, { role: inv.role });
    return { userId: user.id as string, orgId: inv.org_id as string };
  });
}

export function setMemberRole(ctx: Ctx, p: Principal & { kind: 'user' }, userId: string, role: Role) {
  const m = ctx.db.prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?').get(p.orgId, userId) as any;
  if (!m) throw notFound();
  if ((m.role === 'owner' || role === 'owner') && p.role !== 'owner') throw forbidden('Nur Inhaber können Inhaberrechte ändern.');
  if (m.role === 'owner' && role !== 'owner') {
    const owners = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = 'owner'`).get(p.orgId) as any).n;
    if (owners <= 1) throw conflict('last_owner', 'Die Organisation braucht mindestens einen Inhaber.');
  }
  ctx.db.prepare('UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?').run(role, p.orgId, userId);
  logActivity(ctx, { orgId: p.orgId, userId: p.userId }, 'member.role_changed', userId, { role });
}

export function removeMember(ctx: Ctx, p: Principal & { kind: 'user' }, userId: string) {
  const m = ctx.db.prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?').get(p.orgId, userId) as any;
  if (!m) throw notFound();
  if (m.role === 'owner') {
    if (p.role !== 'owner') throw forbidden();
    const owners = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = 'owner'`).get(p.orgId) as any).n;
    if (owners <= 1) throw conflict('last_owner', 'Die Organisation braucht mindestens einen Inhaber.');
  }
  tx(ctx.db, () => {
    ctx.db.prepare('DELETE FROM memberships WHERE org_id = ? AND user_id = ?').run(p.orgId, userId);
    ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL').run(ctx.now().toISOString(), userId, p.orgId);
    // Private Vorlagen bleiben erhalten und gehen an die Organisation über
    ctx.db.prepare(`UPDATE templates SET visibility = 'org' WHERE org_id = ? AND owner_id = ? AND visibility = 'private'`).run(p.orgId, userId);
    // Von der Person angelegte API-Schlüssel ausdrücklich widerrufen (sichtbar in der Schlüsselliste)
    ctx.db.prepare('UPDATE api_keys SET revoked_at = ? WHERE org_id = ? AND created_by = ? AND revoked_at IS NULL').run(ctx.now().toISOString(), p.orgId, userId);
  });
  logActivity(ctx, { orgId: p.orgId, userId: p.userId }, 'member.removed', userId);
}

// ───────────────────────────── API-Schlüssel ─────────────────────────────

export function createApiKey(ctx: Ctx, p: Principal & { kind: 'user' }, input: { name: string; scopes: string[]; mode: 'live' | 'test'; expires_in_days?: number }) {
  const scopes = input.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
  if (!scopes.length) throw badRequest('scopes_required', 'Mindestens eine Berechtigung auswählen.');
  const secret = secretToken(32);
  const key = `pk_${input.mode}_${secret}`;
  const keyId = id('key');
  ctx.db
    .prepare('INSERT INTO api_keys (id, org_id, name, prefix, key_hash, scopes, mode, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      keyId,
      p.orgId,
      input.name.trim().slice(0, 80) || 'API-Schlüssel',
      key.slice(0, 14),
      hashToken(key),
      JSON.stringify(scopes),
      input.mode,
      p.userId,
      ctx.now().toISOString(),
      input.expires_in_days ? new Date(ctx.now().getTime() + input.expires_in_days * 86400_000).toISOString() : null,
    );
  logActivity(ctx, { orgId: p.orgId, userId: p.userId }, 'apikey.created', keyId, { scopes, mode: input.mode });
  return { id: keyId, key };
}

export function principalFromApiKey(ctx: Ctx, key: string): Principal | null {
  if (!/^pk_(live|test)_[A-Za-z0-9_-]{30,60}$/.test(key)) return null;
  const k = ctx.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hashToken(key)) as any;
  if (!k || k.revoked_at || (k.expires_at && new Date(k.expires_at) <= ctx.now())) return null;
  // Schlüssel einer Person, die gesperrt oder nicht mehr Mitglied ist, verlieren ihre Wirkung
  if (k.created_by) {
    const ok = ctx.db.prepare('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.user_id = ? AND u.disabled_at IS NULL').get(k.org_id, k.created_by);
    if (!ok) return null;
  }
  const now = ctx.now();
  if (!k.last_used_at || now.getTime() - new Date(k.last_used_at).getTime() > 60_000) ctx.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now.toISOString(), k.id);
  return { kind: 'apikey', keyId: k.id, orgId: k.org_id, scopes: JSON.parse(k.scopes), mode: k.mode, name: k.name, createdBy: k.created_by };
}
