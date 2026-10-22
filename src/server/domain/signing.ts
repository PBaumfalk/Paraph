// Signaturablauf für externe Unterzeichner (ohne Konto).
// Sicherheitsprinzipien:
// - Link-Token (256 Bit) → kurzlebige Sitzung; gespeichert werden nur Hashes.
// - Jede Aktion prüft serverseitig Vorgangsstatus, Reihenfolge, Ablauf und Authentifizierung.
// - Ein Empfänger kann ausschließlich eigene Felder setzen.
// - Abschluss ist idempotent (completion_key) und läuft in einer IMMEDIATE-Transaktion.
import { PNG } from 'pngjs';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { hashToken, id, numericCode, safeEqual, secretToken, sha256Hex, canonicalJson } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden, gone, notFound, tooMany, unauthorized } from '../lib/errors.js';
import { appendAudit, type Actor } from './audit.js';
import { documentsOf, envRow, fieldsOf, nextRoutingGroup, activateRecipient, recipientsOf, senderName, type EnvelopeRow } from './envelopes.js';
import { getOrg } from './orgs.js';
import { queueMail } from './mail.js';
import { emit } from './webhooks.js';
import { enqueue } from './jobs.js';
import { verifySecret } from './secrets.js';
import { activeKeys, computeFormulas, validateValue, type LogicField } from '../../shared/fieldlogic.js';
import { consentText, type ConsentKind } from '../../shared/consent.js';
import { CONSENT_VERSION, RECIPIENT_COLORS } from '../../shared/model.js';
import { sendSms } from './sms.js';

export interface ReqMeta {
  ip: string;
  ua: string;
}

const SESSION_HOURS = 8;

function recActor(rec: any): Actor {
  return { type: 'recipient', id: rec.id, name: rec.name, email: rec.email };
}

function isExpired(ctx: Ctx, env: EnvelopeRow) {
  return env.status === 'expired' || (env.status === 'sent' && !!env.expires_at && new Date(env.expires_at) <= ctx.now());
}

export type LinkState = 'active' | 'completed_self' | 'waiting';

function envGate(ctx: Ctx, env: EnvelopeRow, rec: any): LinkState {
  if (env.status === 'voided') throw gone('voided', 'Diese Signaturanfrage wurde zurückgezogen.');
  if (env.status === 'declined') throw gone('declined', 'Diese Signaturanfrage wurde abgelehnt und ist beendet.');
  if (isExpired(ctx, env)) throw gone('expired', 'Diese Signaturanfrage ist abgelaufen.');
  if (env.status === 'draft') throw notFound('Link ungültig');
  if (rec.status === 'completed') return 'completed_self';
  if (['declined', 'delegated', 'voided'].includes(rec.status)) throw gone('not_active', 'Dieser Link ist nicht mehr gültig.');
  if (env.status === 'completed') return 'completed_self';
  if (rec.status === 'waiting' || rec.status === 'created') return 'waiting';
  return 'active';
}

/** Öffnet eine Signatursitzung über den Link aus der E-Mail. */
export function openFromLink(ctx: Ctx, token: string, meta: ReqMeta) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Link ungültig oder ersetzt');
  const rec = ctx.db.prepare('SELECT * FROM recipients WHERE token_hash = ?').get(hashToken(token)) as any;
  if (!rec) throw notFound('Link ungültig oder ersetzt');
  const env = envRow(ctx, rec.envelope_id)!;
  envGate(ctx, env, rec);
  return createSession(ctx, rec, env, 'session', meta);
}

export function createSession(ctx: Ctx, rec: any, env: EnvelopeRow, kind: 'session' | 'inperson', meta: ReqMeta, hostUserId?: string) {
  const sessionToken = secretToken();
  const now = ctx.now();
  tx(ctx.db, () => {
    // Höchstens 20 gleichzeitige Sitzungen je Empfänger; älteste verfallen
    ctx.db
      .prepare(
        `DELETE FROM signer_sessions WHERE recipient_id = ? AND id_hash NOT IN (SELECT id_hash FROM signer_sessions WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 19)`,
      )
      .run(rec.id, rec.id);
    ctx.db
      .prepare(`INSERT INTO signer_sessions (id_hash, recipient_id, kind, authenticated, auth_method, host_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        hashToken(sessionToken),
        rec.id,
        kind,
        // Vor Ort prüft die gastgebende Person die Identität; das wird so protokolliert
        rec.auth_method === 'none' || kind === 'inperson' ? 1 : 0,
        kind === 'inperson' ? 'in_person_host' : rec.auth_method === 'none' ? 'link' : null,
        hostUserId ?? null,
        now.toISOString(),
        new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
      );
    const fresh = ctx.db.prepare('SELECT status FROM recipients WHERE id = ?').get(rec.id) as any;
    if (fresh.status === 'sent') {
      ctx.db.prepare(`UPDATE recipients SET status = 'opened', opened_at = ? WHERE id = ? AND status = 'sent'`).run(now.toISOString(), rec.id);
      emit(ctx, env.org_id, 'recipient.viewed', { envelope_id: env.id, recipient_id: rec.id }, { testMode: !!env.test_mode });
    }
    appendAudit(ctx.db, env.id, env.org_id, kind === 'inperson' ? 'recipient.inperson_started' : 'recipient.link_opened', recActor(rec), {
      recipient_id: rec.id,
      ip: meta.ip,
      user_agent: meta.ua.slice(0, 300),
      ...(hostUserId ? { host_user_id: hostUserId } : {}),
    });
  });
  return { sessionToken, recipientId: rec.id };
}

/** Kurzlebiges Einbettungs-Token (10 Minuten, einmalig) für die eingebettete Signatur. */
export function issueEmbedToken(ctx: Ctx, rec: any, origin: string | null) {
  const token = secretToken();
  const now = ctx.now();
  ctx.db
    .prepare(`INSERT INTO signer_sessions (id_hash, recipient_id, kind, authenticated, origin, created_at, expires_at) VALUES (?, ?, 'embed', 0, ?, ?, ?)`)
    .run(hashToken(token), rec.id, origin, now.toISOString(), new Date(now.getTime() + 10 * 60_000).toISOString());
  return token;
}

export function openFromEmbed(ctx: Ctx, token: string, meta: ReqMeta) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Link ungültig');
  return tx(ctx.db, () => {
    const s = ctx.db.prepare(`SELECT * FROM signer_sessions WHERE id_hash = ? AND kind = 'embed'`).get(hashToken(token)) as any;
    if (!s || s.used_at || new Date(s.expires_at) <= ctx.now()) throw notFound('Einbettungslink ungültig oder abgelaufen');
    ctx.db.prepare('UPDATE signer_sessions SET used_at = ? WHERE id_hash = ?').run(ctx.now().toISOString(), s.id_hash);
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(s.recipient_id) as any;
    const env = envRow(ctx, rec.envelope_id)!;
    envGate(ctx, env, rec);
    return { ...createSession(ctx, rec, env, 'session', meta), origin: s.origin as string | null };
  });
}

export interface SignerCtx {
  session: any;
  rec: any;
  env: EnvelopeRow;
  state: LinkState;
}

export function sessionFrom(ctx: Ctx, sessionToken: string | undefined): SignerCtx {
  if (!sessionToken) throw unauthorized('Sitzung abgelaufen. Bitte den Link aus der E-Mail erneut öffnen.');
  const s = ctx.db.prepare(`SELECT * FROM signer_sessions WHERE id_hash = ? AND kind IN ('session','inperson')`).get(hashToken(sessionToken)) as any;
  if (!s || new Date(s.expires_at) <= ctx.now()) throw unauthorized('Sitzung abgelaufen. Bitte den Link aus der E-Mail erneut öffnen.');
  const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(s.recipient_id) as any;
  if (!rec) throw unauthorized();
  const env = envRow(ctx, rec.envelope_id)!;
  const state = envGate(ctx, env, rec);
  return { session: s, rec, env, state };
}

function requireActive(sc: SignerCtx) {
  if (sc.state === 'completed_self') throw conflict('already_completed', 'Sie haben bereits unterschrieben.');
  if (sc.state === 'waiting') throw conflict('not_your_turn', 'Sie sind noch nicht an der Reihe.');
}

function requireAuth(sc: SignerCtx) {
  if (sc.rec.auth_method !== 'none' && !sc.session.authenticated) throw forbidden('Bitte bestätigen Sie zuerst Ihre Identität.');
}

// ───────────────────────────── Identitätsprüfung ─────────────────────────────

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}
function maskPhone(p: string) {
  return p.slice(0, 4) + '•'.repeat(Math.max(0, p.length - 6)) + p.slice(-2);
}

export async function requestOtp(ctx: Ctx, sc: SignerCtx) {
  requireActive(sc);
  const method = sc.rec.auth_method;
  if (method !== 'email_otp' && method !== 'sms_otp') throw badRequest('no_otp', 'Für diesen Empfänger ist kein Einmalcode vorgesehen.');
  const hourAgo = new Date(ctx.now().getTime() - 3600_000).toISOString();
  const recent = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM otp_challenges WHERE recipient_id = ? AND channel != 'access_code' AND created_at > ?`).get(sc.rec.id, hourAgo) as any).n;
  if (recent >= 5) throw tooMany('Zu viele Codes angefordert. Bitte in einer Stunde erneut versuchen.');
  const code = numericCode(6);
  const chId = id('otp');
  ctx.db
    .prepare(`INSERT INTO otp_challenges (id, recipient_id, channel, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(chId, sc.rec.id, method === 'sms_otp' ? 'sms' : 'email', hashToken(chId + ':' + code), new Date(ctx.now().getTime() + 10 * 60_000).toISOString(), ctx.now().toISOString());
  if (method === 'email_otp') {
    queueMail(ctx, { orgId: sc.env.org_id, envelopeId: sc.env.id, recipientId: sc.rec.id, to: sc.rec.email, kind: 'otp', locale: sc.env.locale, vars: { code, title: sc.env.title }, suppress: !!sc.env.test_mode });
  } else {
    await sendSms(ctx, sc.rec.phone, `${code} ist Ihr Bestätigungscode für „${sc.env.title.slice(0, 60)}“. Gültig 10 Minuten.`);
  }
  tx(ctx.db, () => appendAudit(ctx.db, sc.env.id, sc.env.org_id, 'recipient.otp_sent', recActor(sc.rec), { channel: method === 'sms_otp' ? 'sms' : 'email', to: method === 'sms_otp' ? maskPhone(sc.rec.phone) : maskEmail(sc.rec.email) }));
  return { channel: method === 'sms_otp' ? 'sms' : 'email', to: method === 'sms_otp' ? maskPhone(sc.rec.phone) : maskEmail(sc.rec.email), testCode: sc.env.test_mode ? code : undefined };
}

export function verifyAuth(ctx: Ctx, sc: SignerCtx, code: string, meta: ReqMeta) {
  requireActive(sc);
  const method = sc.rec.auth_method;
  const now = ctx.now();
  return tx(ctx.db, () => {
    if (method === 'access_code') {
      const since = new Date(now.getTime() - 15 * 60_000).toISOString();
      const fails = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM otp_challenges WHERE recipient_id = ? AND channel = 'access_code' AND created_at > ?`).get(sc.rec.id, since) as any).n;
      if (fails >= 5) throw tooMany('Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.');
      if (!verifySecret(sc.rec.access_code_hash, code)) {
        ctx.db.prepare(`INSERT INTO otp_challenges (id, recipient_id, channel, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 'access_code', '', 1, ?, ?)`).run(id('otp'), sc.rec.id, since, now.toISOString());
        appendAudit(ctx.db, sc.env.id, sc.env.org_id, 'recipient.auth_failed', recActor(sc.rec), { method, ip: meta.ip });
        throw new AppError(401, 'wrong_code', 'Der Zugangscode ist falsch.');
      }
    } else if (method === 'email_otp' || method === 'sms_otp') {
      const ch = ctx.db.prepare(`SELECT * FROM otp_challenges WHERE recipient_id = ? AND channel != 'access_code' AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`).get(sc.rec.id) as any;
      if (!ch || new Date(ch.expires_at) <= now) throw new AppError(401, 'code_expired', 'Der Code ist abgelaufen. Bitte einen neuen anfordern.');
      if (ch.attempts >= 5) throw tooMany('Zu viele Fehlversuche. Bitte einen neuen Code anfordern.');
      const clean = code.replace(/\s/g, '');
      if (!safeEqual(hashToken(ch.id + ':' + clean), ch.code_hash)) {
        ctx.db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(ch.id);
        appendAudit(ctx.db, sc.env.id, sc.env.org_id, 'recipient.auth_failed', recActor(sc.rec), { method, ip: meta.ip });
        throw new AppError(401, 'wrong_code', 'Der Code ist falsch.');
      }
      ctx.db.prepare('UPDATE otp_challenges SET verified_at = ? WHERE id = ?').run(now.toISOString(), ch.id);
    } else {
      return { ok: true };
    }
    ctx.db.prepare('UPDATE signer_sessions SET authenticated = 1, auth_method = ? WHERE id_hash = ?').run(method, sc.session.id_hash);
    ctx.db.prepare('UPDATE recipients SET auth_at = ? WHERE id = ?').run(now.toISOString(), sc.rec.id);
    appendAudit(ctx.db, sc.env.id, sc.env.org_id, 'recipient.authenticated', recActor(sc.rec), {
      method,
      to: method === 'email_otp' ? maskEmail(sc.rec.email) : method === 'sms_otp' ? maskPhone(sc.rec.phone) : undefined,
      ip: meta.ip,
      note:
        method === 'access_code'
          ? 'Kenntnis eines separat mitgeteilten Zugangscodes'
          : method === 'email_otp'
            ? 'Zugriff auf das E-Mail-Postfach zum Zeitpunkt der Prüfung'
            : 'Zugriff auf die Mobilnummer zum Zeitpunkt der Prüfung',
    });
    return { ok: true };
  });
}

// ───────────────────────────── Ansicht ─────────────────────────────

export function signerView(ctx: Ctx, sc: SignerCtx) {
  const org = getOrg(ctx, sc.env.org_id);
  const authed = sc.rec.auth_method === 'none' || !!sc.session.authenticated;
  const recs = recipientsOf(ctx, sc.env.id);
  const base = {
    state: sc.state,
    envelope: {
      id: sc.env.id,
      title: sc.env.title,
      message: sc.env.message,
      status: sc.env.status,
      test_mode: !!sc.env.test_mode,
      expires_at: sc.env.expires_at,
      signature_level: sc.env.signature_level,
      locale: sc.env.locale,
      allow_delegation: !!sc.env.allow_delegation,
      sender: senderName(ctx, sc.env),
    },
    org: { name: org.name, accent: org.branding.accent, logo: org.branding.logoBlobId ? `/api/public/orgs/${org.id}/logo` : null },
    me: { id: sc.rec.id, name: sc.rec.name, email: sc.rec.email, kind: sc.rec.kind, auth_method: sc.rec.auth_method, authenticated: authed, in_person: sc.session.kind === 'inperson' },
    progress: recs
      .filter((r) => r.kind !== 'viewer')
      .map((r) => ({ name: r.id === sc.rec.id ? r.name : r.name, kind: r.kind, status: r.status, routing_order: r.routing_order, me: r.id === sc.rec.id })),
    consent: consentText((sc.rec.kind === 'viewer' ? 'signer' : sc.rec.kind) as ConsentKind, sc.env.locale),
  };
  if (!authed || sc.state === 'waiting') return { ...base, documents: [], fields: [] };
  const docs = documentsOf(ctx, sc.env.id);
  const fields = fieldsOf(ctx, sc.env.id);
  const nameOf = new Map(recs.map((r) => [r.id, r]));
  return {
    ...base,
    documents: docs.map((d) => ({ id: d.id, name: d.name, sha256: d.sha256, pages: d.pages })),
    fields: fields.map((f) => {
      const mine = f.recipient_id === sc.rec.id;
      const owner = nameOf.get(f.recipient_id);
      const done = owner?.status === 'completed';
      return {
        id: f.id,
        key: f.key,
        type: f.type,
        document_id: f.document_id,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        required: f.required,
        label: f.label,
        config: f.config,
        mine,
        owner: owner ? { name: owner.name, color: RECIPIENT_COLORS[owner.color % RECIPIENT_COLORS.length] } : null,
        // Fremde Werte nur, wenn die andere Person bereits abgeschlossen hat; Unterschriften nur als Vermerk
        value: mine ? (f.type === 'signature' || f.type === 'initials' ? null : f.value) : done && f.type !== 'signature' && f.type !== 'initials' && f.type !== 'attachment' ? f.value : f.config.readonly ? f.value : null,
        signed_by_other: !mine && done && (f.type === 'signature' || f.type === 'initials') ? { name: owner!.name, at: owner!.completed_at } : null,
      };
    }),
  };
}

export async function documentBytes(ctx: Ctx, sc: SignerCtx, docId: string) {
  requireAuth(sc);
  if (sc.state === 'waiting') throw conflict('not_your_turn', 'Sie sind noch nicht an der Reihe.');
  const d = ctx.db.prepare('SELECT * FROM envelope_documents WHERE id = ? AND envelope_id = ?').get(docId, sc.env.id) as any;
  if (!d) throw notFound();
  return ctx.blobs.get(d.blob_id);
}

// ───────────────────────────── Eingaben ─────────────────────────────

export function saveDraftValues(ctx: Ctx, sc: SignerCtx, values: Record<string, string>) {
  requireActive(sc);
  requireAuth(sc);
  tx(ctx.db, () => {
    const mine = ctx.db.prepare('SELECT * FROM fields WHERE envelope_id = ? AND recipient_id = ?').all(sc.env.id, sc.rec.id) as any[];
    const byKey = new Map(mine.map((f) => [f.key, f]));
    for (const [k, v] of Object.entries(values)) {
      const f = byKey.get(k);
      if (!f) throw forbidden('Dieses Feld gehört nicht zu Ihnen.');
      const cfg = JSON.parse(f.config);
      if (['signature', 'initials', 'formula', 'signed_date', 'attachment'].includes(f.type) || cfg.readonly) continue;
      if (typeof v !== 'string' || v.length > 5000) throw badRequest('invalid_value', 'Ungültiger Wert');
      ctx.db.prepare('UPDATE fields SET value = ? WHERE id = ?').run(v, f.id);
    }
  });
}

const MAX_SIG_BYTES = 1_500_000;

/** Prüft und bereinigt ein Unterschriftsbild: dekodieren, Größe begrenzen, neu kodieren (entfernt Metadaten). */
export function sanitizePng(input: Buffer): Buffer {
  if (input.length > MAX_SIG_BYTES) throw badRequest('signature_too_large', 'Das Bild ist zu groß (max. 1,5 MB).');
  let png: PNG;
  try {
    png = PNG.sync.read(input);
  } catch {
    throw badRequest('signature_invalid', 'Das Unterschriftsbild ist kein gültiges PNG.');
  }
  if (png.width < 20 || png.height < 10 || png.width > 2400 || png.height > 1200) throw badRequest('signature_dimensions', 'Ungültige Bildgröße.');
  // Nicht leer: mindestens 0,2 % deckende Pixel
  let ink = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    const a = png.data[i];
    const lum = png.data[i - 3] + png.data[i - 2] + png.data[i - 1];
    if (a > 40 && lum < 600) ink++;
  }
  if (ink < png.width * png.height * 0.002) throw badRequest('signature_empty', 'Die Unterschrift ist leer.');
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  return PNG.sync.write(out, { colorType: 6 });
}

export async function adoptSignature(ctx: Ctx, sc: SignerCtx, input: { purpose: 'signature' | 'initials'; method: 'drawn' | 'typed' | 'uploaded'; png_base64: string; typed_text?: string }) {
  requireActive(sc);
  requireAuth(sc);
  if (sc.rec.kind !== 'signer' && sc.rec.kind !== 'witness') throw forbidden('Für Ihre Rolle ist keine Unterschrift vorgesehen.');
  const clean = sanitizePng(Buffer.from(input.png_base64, 'base64'));
  const blob = await ctx.blobs.put(clean, { orgId: sc.env.org_id, mime: 'image/png', kind: 'signature' });
  const sigId = id('sig');
  const count = (ctx.db.prepare('SELECT COUNT(*) AS n FROM signatures WHERE recipient_id = ?').get(sc.rec.id) as any).n;
  if (count > 50) throw tooMany('Zu viele Unterschriftsversuche.');
  ctx.db
    .prepare(`INSERT INTO signatures (id, recipient_id, purpose, method, blob_id, sha256, typed_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sigId, sc.rec.id, input.purpose, input.method, blob.id, blob.sha256, input.typed_text?.slice(0, 200) ?? null, ctx.now().toISOString());
  return { id: sigId, sha256: blob.sha256 };
}

const ATTACH_TYPES: Record<string, string> = { '%PDF': 'application/pdf', '\x89PNG': 'image/png', '\xff\xd8\xff': 'image/jpeg' };

export async function uploadAttachment(ctx: Ctx, sc: SignerCtx, fieldKey: string, file: { name: string; bytes: Buffer }) {
  requireActive(sc);
  requireAuth(sc);
  const f = ctx.db.prepare(`SELECT * FROM fields WHERE envelope_id = ? AND recipient_id = ? AND key = ? AND type = 'attachment'`).get(sc.env.id, sc.rec.id, fieldKey) as any;
  if (!f) throw forbidden('Dieses Feld gehört nicht zu Ihnen.');
  if (file.bytes.length > 10 * 1024 * 1024) throw new AppError(413, 'file_too_large', 'Datei zu groß (max. 10 MB).');
  const head = file.bytes.subarray(0, 4).toString('latin1');
  const mime = Object.entries(ATTACH_TYPES).find(([m]) => head.startsWith(m))?.[1];
  if (!mime) throw badRequest('file_type', 'Erlaubt sind PDF, PNG und JPEG.');
  const blob = await ctx.blobs.put(file.bytes, { orgId: sc.env.org_id, mime, kind: 'attachment' });
  const attId = id('att');
  const name = file.name.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').slice(0, 160) || 'Anhang';
  tx(ctx.db, () => {
    ctx.db.prepare('DELETE FROM recipient_attachments WHERE recipient_id = ? AND field_key = ?').run(sc.rec.id, fieldKey);
    ctx.db
      .prepare('INSERT INTO recipient_attachments (id, recipient_id, field_key, name, blob_id, sha256, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(attId, sc.rec.id, fieldKey, name, blob.id, blob.sha256, blob.size, ctx.now().toISOString());
    ctx.db.prepare('UPDATE fields SET value = ? WHERE id = ?').run(attId, f.id);
  });
  return { id: attId, name, sha256: blob.sha256, size: blob.size };
}

// ───────────────────────────── Abschluss ─────────────────────────────

export interface CompleteInput {
  values: Record<string, string>;
  signatures: Record<string, string>; // field key → signature id
  consent: { accepted: boolean; version: string };
  document_hashes: string[];
  completion_key: string;
}

function todayIn(tz: string, d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // YYYY-MM-DD
}

export function complete(ctx: Ctx, sc0: SignerCtx, input: CompleteInput, meta: ReqMeta) {
  if (!input.completion_key || !/^[A-Za-z0-9_-]{8,80}$/.test(input.completion_key)) throw badRequest('completion_key', 'completion_key fehlt');
  const result = tx(ctx.db, () => {
    // Alles innerhalb der Schreibsperre neu laden – kein Zustand von vorher wird vertraut
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(sc0.rec.id) as any;
    const env = envRow(ctx, rec.envelope_id)!;
    const session = ctx.db.prepare('SELECT * FROM signer_sessions WHERE id_hash = ?').get(sc0.session.id_hash) as any;
    if (!session) throw unauthorized();
    if (rec.status === 'completed') {
      if (rec.completion_key === input.completion_key) return { idempotent: true, env, rec };
      throw conflict('already_completed', 'Sie haben bereits unterschrieben.');
    }
    const state = envGate(ctx, env, rec);
    const sc: SignerCtx = { session, rec, env, state };
    requireActive(sc);
    requireAuth(sc);
    if (!input.consent?.accepted) throw badRequest('consent_required', 'Bitte bestätigen Sie die Erklärung.');
    if (input.consent.version !== CONSENT_VERSION) throw conflict('consent_outdated', 'Die Erklärung wurde aktualisiert. Bitte Seite neu laden.');

    // Bindung an die maßgebliche Dokumentversion
    const docs = documentsOf(ctx, env.id);
    const expected = docs.map((d) => d.sha256);
    if (!Array.isArray(input.document_hashes) || input.document_hashes.length !== expected.length || input.document_hashes.some((h, i) => h !== expected[i])) {
      throw conflict('document_changed', 'Die angezeigte Dokumentfassung stimmt nicht mit der maßgeblichen Fassung überein. Bitte Seite neu laden.');
    }

    const all = fieldsOf(ctx, env.id);
    const mine = all.filter((f) => f.recipient_id === rec.id);
    const myKeys = new Set(mine.map((f) => f.key));
    for (const k of [...Object.keys(input.values ?? {}), ...Object.keys(input.signatures ?? {})]) {
      if (!myKeys.has(k)) throw forbidden(`Feld „${k}“ gehört nicht zu Ihnen.`);
    }
    const org = getOrg(ctx, env.org_id);
    const now = ctx.now();
    const values: Record<string, string> = {};
    for (const f of all) values[f.key] = f.value ?? '';
    for (const f of mine) {
      if (f.config.readonly || f.type === 'formula' || f.type === 'signature' || f.type === 'initials' || f.type === 'attachment') continue;
      if (f.type === 'signed_date') {
        values[f.key] = todayIn(org.settings.timezone, now);
        continue;
      }
      const v = input.values?.[f.key];
      if (v !== undefined) {
        if (typeof v !== 'string') throw badRequest('invalid_value', 'Ungültiger Wert');
        values[f.key] = f.type === 'checkbox' ? (v === 'true' ? 'true' : '') : v.trim();
      } else if (f.type === 'name' && !values[f.key]) values[f.key] = rec.name;
      else if (f.type === 'email' && !values[f.key]) values[f.key] = rec.email;
    }
    // Unterschriften: nur eigene, passend zum Zweck
    const sigs = new Map<string, any>();
    for (const f of mine.filter((x) => x.type === 'signature' || x.type === 'initials')) {
      const sid = input.signatures?.[f.key];
      if (!sid) {
        values[f.key] = '';
        continue;
      }
      const s = ctx.db.prepare('SELECT * FROM signatures WHERE id = ? AND recipient_id = ?').get(sid, rec.id) as any;
      if (!s) throw forbidden('Unbekannte Unterschrift.');
      if (s.purpose !== (f.type === 'initials' ? 'initials' : 'signature')) throw badRequest('signature_purpose', 'Unterschrift und Paraphe vertauscht.');
      values[f.key] = s.id;
      sigs.set(f.key, s);
    }
    const logic: LogicField[] = all.map((f) => ({ key: f.key, type: f.type, required: f.required, config: f.config }));
    const computed = computeFormulas(logic, values, env.locale);
    const active = activeKeys(logic, computed);
    const errors: { key: string; label: string; message: string }[] = [];
    for (const f of mine) {
      if (!active.has(f.key)) continue;
      if (f.type === 'signature' || f.type === 'initials') {
        if (f.required && !sigs.has(f.key)) errors.push({ key: f.key, label: f.label, message: 'Unterschrift fehlt' });
        continue;
      }
      if (f.type === 'attachment') {
        if (f.required && !f.value) errors.push({ key: f.key, label: f.label, message: 'Anhang fehlt' });
        continue;
      }
      if (f.type === 'formula') continue;
      const err = validateValue({ key: f.key, type: f.type, required: f.required, config: f.config }, computed[f.key], env.locale);
      if (err) errors.push({ key: f.key, label: f.label, message: err });
    }
    if (errors.length) throw new AppError(422, 'validation_failed', 'Bitte prüfen Sie die markierten Felder.', { errors });

    // Speichern: nur eigene Felder; inaktive (bedingt ausgeblendete) Felder werden geleert
    const upd = ctx.db.prepare('UPDATE fields SET value = ?, filled_at = ? WHERE id = ? AND recipient_id = ?');
    for (const f of mine) {
      const v = active.has(f.key) ? (computed[f.key] ?? '') : '';
      upd.run(v === '' ? null : v, now.toISOString(), f.id, rec.id);
    }
    // Formelfelder anderer Empfänger hängen ggf. von meinen Werten ab: neu berechnen
    for (const f of all.filter((x) => x.type === 'formula' && x.recipient_id !== rec.id)) {
      ctx.db.prepare('UPDATE fields SET value = ? WHERE id = ?').run(computed[f.key] || null, f.id);
    }
    const r = ctx.db
      .prepare(`UPDATE recipients SET status = 'completed', completed_at = ?, consent_at = ?, completion_key = ? WHERE id = ? AND status IN ('sent','opened')`)
      .run(now.toISOString(), now.toISOString(), input.completion_key, rec.id);
    if (r.changes !== 1) throw conflict('state_changed', 'Der Status hat sich zwischenzeitlich geändert. Bitte Seite neu laden.');
    // Einmalig: Signatursitzung beenden, Link-Token bleibt nur für Downloads nach Abschluss nutzbar
    ctx.db.prepare(`DELETE FROM signer_sessions WHERE recipient_id = ? AND id_hash != ?`).run(rec.id, session.id_hash);

    const consent = consentText(rec.kind as ConsentKind, env.locale);
    const myValues = Object.fromEntries(mine.map((f) => [f.key, active.has(f.key) ? computed[f.key] ?? '' : '']));
    appendAudit(ctx.db, env.id, env.org_id, 'recipient.consented', recActor(rec), {
      recipient_id: rec.id,
      consent_version: consent.version,
      consent_sha256: sha256Hex(consent.full),
      consent_text: consent.full,
      action: consent.action,
      ip: meta.ip,
      user_agent: meta.ua.slice(0, 300),
    });
    appendAudit(ctx.db, env.id, env.org_id, rec.kind === 'approver' ? 'recipient.approved' : rec.kind === 'filler' ? 'recipient.submitted' : 'recipient.signed', recActor(rec), {
      recipient_id: rec.id,
      kind: rec.kind,
      auth_method: rec.auth_method === 'none' ? 'link' : rec.auth_method,
      session_kind: session.kind,
      in_person_host: session.host_user_id ?? undefined,
      document_hashes: expected,
      values_sha256: sha256Hex(canonicalJson(myValues)),
      field_count: mine.length,
      signatures: [...sigs.entries()].map(([key, s]) => ({ field: key, signature_id: s.id, method: s.method, image_sha256: s.sha256 })),
      ip: meta.ip,
      user_agent: meta.ua.slice(0, 300),
      signature_level: env.signature_level,
    });
    emit(ctx, env.org_id, 'recipient.signed', { envelope_id: env.id, recipient_id: rec.id, kind: rec.kind }, { testMode: !!env.test_mode });

    // Nächste Station
    const recs = recipientsOf(ctx, env.id);
    const { group } = nextRoutingGroup(recs);
    if (group.length === 0) {
      enqueue(ctx, 'finalize_envelope', { envelopeId: env.id }, { uniqueKey: `finalize:${env.id}` });
    } else {
      for (const g of group.filter((x) => x.status === 'waiting')) activateRecipient(ctx, env, g, { notify: env.notify !== 0, actor: { type: 'system' } });
    }
    return { idempotent: false, env, rec };
  });
  return { ok: true, idempotent: result.idempotent };
}

export function decline(ctx: Ctx, sc0: SignerCtx, reason: string, meta: ReqMeta) {
  tx(ctx.db, () => {
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(sc0.rec.id) as any;
    const env = envRow(ctx, rec.envelope_id)!;
    const sc: SignerCtx = { ...sc0, rec, env, state: envGate(ctx, env, rec) };
    requireActive(sc);
    requireAuth(sc);
    const now = ctx.now().toISOString();
    const clean = (reason ?? '').toString().slice(0, 1000);
    const r = ctx.db.prepare(`UPDATE recipients SET status = 'declined', declined_at = ?, decline_reason = ? WHERE id = ? AND status IN ('sent','opened')`).run(now, clean, rec.id);
    if (r.changes !== 1) throw conflict('state_changed', 'Der Status hat sich geändert.');
    const e = ctx.db.prepare(`UPDATE envelopes SET status = 'declined', finished_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status = 'sent'`).run(now, now, env.id);
    if (e.changes !== 1) throw conflict('state_changed', 'Der Vorgang ist nicht mehr aktiv.');
    ctx.db.prepare(`UPDATE recipients SET token_hash = NULL WHERE envelope_id = ? AND status NOT IN ('completed')`).run(env.id);
    ctx.db.prepare(`DELETE FROM signer_sessions WHERE recipient_id IN (SELECT id FROM recipients WHERE envelope_id = ?)`).run(env.id);
    appendAudit(ctx.db, env.id, env.org_id, 'recipient.declined', recActor(rec), { recipient_id: rec.id, reason: clean, ip: meta.ip, user_agent: meta.ua.slice(0, 300) });
    appendAudit(ctx.db, env.id, env.org_id, 'envelope.declined', { type: 'system' }, { declined_by: rec.id });
    const owner = env.owner_id ? (ctx.db.prepare('SELECT email, name FROM users WHERE id = ?').get(env.owner_id) as any) : null;
    if (owner) queueMail(ctx, { orgId: env.org_id, envelopeId: env.id, to: owner.email, kind: 'owner_declined', link: `${ctx.cfg.appUrl}/envelopes/${env.id}`, suppress: !!env.test_mode, vars: { title: env.title, actor: rec.name, reason: clean || '—' } });
    for (const other of recipientsOf(ctx, env.id).filter((x) => x.id !== rec.id && x.sent_at)) {
      queueMail(ctx, { orgId: env.org_id, envelopeId: env.id, recipientId: other.id, to: other.email, kind: 'declined', locale: env.locale, suppress: !!env.test_mode, vars: { title: env.title, actor: rec.name, recipient: other.name } });
    }
    emit(ctx, env.org_id, 'recipient.declined', { envelope_id: env.id, recipient_id: rec.id, reason: clean }, { testMode: !!env.test_mode });
    emit(ctx, env.org_id, 'envelope.declined', { envelope_id: env.id }, { testMode: !!env.test_mode });
  });
}

export function delegate(ctx: Ctx, sc0: SignerCtx, input: { name: string; email: string; reason?: string }, meta: ReqMeta) {
  return tx(ctx.db, () => {
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(sc0.rec.id) as any;
    const env = envRow(ctx, rec.envelope_id)!;
    const sc: SignerCtx = { ...sc0, rec, env, state: envGate(ctx, env, rec) };
    requireActive(sc);
    requireAuth(sc);
    if (!env.allow_delegation) throw forbidden('Für diesen Vorgang ist keine Vertretung vorgesehen.');
    const name = input.name?.trim().slice(0, 160);
    const email = input.email?.trim().toLowerCase().slice(0, 254);
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('invalid_delegate', 'Bitte Name und gültige E-Mail-Adresse angeben.');
    if (email === rec.email) throw badRequest('invalid_delegate', 'Die Vertretung muss eine andere Person sein.');
    const now = ctx.now().toISOString();
    const newId = id('rcp');
    ctx.db
      .prepare(
        `INSERT INTO recipients (id, envelope_id, role, kind, name, email, routing_order, status, auth_method, delegated_from, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?)`,
      )
      .run(newId, env.id, rec.role, rec.kind, name, email, rec.routing_order, rec.auth_method === 'access_code' || rec.auth_method === 'sms_otp' ? 'email_otp' : rec.auth_method, rec.id, rec.color, now);
    ctx.db.prepare(`UPDATE fields SET recipient_id = ?, value = CASE WHEN type IN ('signature','initials') THEN NULL ELSE value END WHERE recipient_id = ?`).run(newId, rec.id);
    ctx.db.prepare(`UPDATE recipients SET status = 'delegated', token_hash = NULL, decline_reason = ? WHERE id = ?`).run(input.reason?.slice(0, 500) ?? null, rec.id);
    ctx.db.prepare(`DELETE FROM signer_sessions WHERE recipient_id = ?`).run(rec.id);
    appendAudit(ctx.db, env.id, env.org_id, 'recipient.delegated', recActor(rec), { from: rec.id, to: newId, to_name: name, to_email: email, reason: input.reason ?? '', ip: meta.ip });
    const fresh = ctx.db.prepare('SELECT * FROM recipients WHERE id = ?').get(newId);
    activateRecipient(ctx, env, fresh, { notify: env.notify !== 0, actor: recActor(rec) });
    emit(ctx, env.org_id, 'recipient.delegated', { envelope_id: env.id, from: rec.id, to: newId }, { testMode: !!env.test_mode });
    return { ok: true };
  });
}

export function inPersonSession(ctx: Ctx, envelopeId: string, recipientId: string, hostUserId: string, meta: ReqMeta) {
  const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ? AND envelope_id = ?').get(recipientId, envelopeId) as any;
  if (!rec) throw notFound('Empfänger nicht gefunden');
  const env = envRow(ctx, envelopeId)!;
  const state = envGate(ctx, env, rec);
  if (state !== 'active') throw conflict('not_your_turn', 'Diese Person ist gerade nicht an der Reihe.');
  return createSession(ctx, rec, env, 'inperson', meta, hostUserId);
}

export function sessionCookieMaxAge() {
  return SESSION_HOURS * 3600;
}

export { maskEmail };
