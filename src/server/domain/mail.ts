// E-Mail über eine Outbox: erst in der Datenbank (verschlüsselt), dann per Job versendet.
// Inhalte mit Signaturlinks werden nach dem Versand gelöscht, damit die Datenbank keine gültigen Links hält.
import nodemailer, { type Transporter } from 'nodemailer';
import type { Ctx } from '../context.js';
import { id, openString, sealString } from '../lib/crypto.js';
import { registerJob, enqueue } from './jobs.js';
import { getOrg, DEFAULT_ACCENT, type Branding } from './orgs.js';
import { appendAudit } from './audit.js';
import { emit } from './webhooks.js';

export type MailKind =
  | 'signing_request'
  | 'reminder'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired'
  | 'otp'
  | 'user_invite'
  | 'password_reset'
  | 'owner_completed'
  | 'owner_declined'
  | 'form_otp'
  | 'system_alert'
  | 'delivery_failed'
  | 'test';

type Vars = Record<string, string>;

const T: Record<'de' | 'en', Record<MailKind, { subject: string; body: string; button?: string }>> = {
  de: {
    signing_request: {
      subject: '{{sender}} bittet Sie um Ihre Unterschrift: {{title}}',
      body: 'Guten Tag {{recipient}},\n\n{{sender}} hat Ihnen das Dokument „{{title}}“ zur elektronischen Unterschrift gesendet.\n\n{{message}}\n\nDer Link ist persönlich und gilt bis {{expires}}. Bitte leiten Sie diese E-Mail nicht weiter.',
      button: 'Dokument ansehen und unterschreiben',
    },
    reminder: {
      subject: 'Erinnerung: {{title}} wartet auf Ihre Unterschrift',
      body: 'Guten Tag {{recipient}},\n\ndas Dokument „{{title}}“ von {{sender}} wartet noch auf Ihre Unterschrift. Der Link gilt bis {{expires}}.',
      button: 'Jetzt unterschreiben',
    },
    completed: {
      subject: 'Abgeschlossen: {{title}}',
      body: 'Guten Tag {{recipient}},\n\nalle Beteiligten haben „{{title}}“ unterschrieben. Über den Link können Sie das fertige Dokument und die Abschlussbestätigung herunterladen.\n\nPrüfwert (SHA-256) des unterschriebenen Dokuments:\n{{checksum}}\n\nBewahren Sie diese E-Mail auf: Mit dem Prüfwert lässt sich unter {{verify_url}} jederzeit feststellen, ob eine Datei genau dem unterschriebenen Dokument entspricht.',
      button: 'Dokument herunterladen',
    },
    declined: {
      subject: 'Abgelehnt: {{title}}',
      body: 'Guten Tag {{recipient}},\n\n{{actor}} hat die Unterzeichnung von „{{title}}“ abgelehnt. Der Vorgang ist beendet; es ist keine weitere Handlung nötig.',
    },
    voided: {
      subject: 'Zurückgezogen: {{title}}',
      body: 'Guten Tag {{recipient}},\n\n{{sender}} hat die Signaturanfrage „{{title}}“ zurückgezogen. Der Link ist nicht mehr gültig.\n\n{{reason}}',
    },
    expired: {
      subject: 'Abgelaufen: {{title}}',
      body: 'Guten Tag {{recipient}},\n\ndie Signaturanfrage „{{title}}“ ist abgelaufen und kann nicht mehr unterschrieben werden.',
    },
    otp: {
      subject: 'Ihr Bestätigungscode: {{code}}',
      body: 'Ihr Bestätigungscode für „{{title}}“ lautet:\n\n{{code}}\n\nDer Code gilt 10 Minuten. Wenn Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail.',
    },
    form_otp: {
      subject: 'Ihr Bestätigungscode: {{code}}',
      body: 'Ihr Bestätigungscode für das Formular „{{title}}“ lautet:\n\n{{code}}\n\nDer Code gilt 10 Minuten.',
    },
    user_invite: {
      subject: 'Einladung zu {{org}} auf Paraph',
      body: '{{sender}} lädt Sie ein, im Arbeitsbereich „{{org}}“ mitzuarbeiten. Die Einladung gilt 7 Tage.',
      button: 'Einladung annehmen',
    },
    password_reset: {
      subject: 'Passwort zurücksetzen',
      body: 'Über den folgenden Link können Sie ein neues Passwort festlegen. Der Link gilt 60 Minuten. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.',
      button: 'Neues Passwort festlegen',
    },
    owner_completed: {
      subject: 'Alle haben unterschrieben: {{title}}',
      body: '„{{title}}“ ist vollständig unterschrieben. Fertiges Dokument, Abschlussbestätigung und Nachweispaket stehen bereit.',
      button: 'Vorgang öffnen',
    },
    system_alert: {
      subject: 'Paraph: Störung „{{job}}“',
      body: 'Eine Hintergrundaufgabe ist nach allen Wiederholungen endgültig fehlgeschlagen.\n\nAufgabe: {{job}}\nFehler: {{error}}\n\nDetails und „Erneut versuchen“ unter Einstellungen → System.',
      button: 'System öffnen',
    },
    delivery_failed: {
      subject: 'Zustellung fehlgeschlagen: {{title}}',
      body: 'Die E-Mail an {{recipient}} <{{email}}> zu „{{title}}“ konnte nicht zugestellt werden.\n\nGrund: {{error}}\n\nBitte die Adresse prüfen und im Vorgang erneut senden oder den Link auf anderem Weg übergeben.',
      button: 'Vorgang öffnen',
    },
    test: {
      subject: 'Paraph: Test-E-Mail',
      body: 'Diese Test-E-Mail bestätigt, dass Paraph über den eingerichteten Mailserver versenden kann.\n\nAbsender: {{from}}\nZeitpunkt: {{at}}',
    },
    owner_declined: {
      subject: 'Abgelehnt: {{title}}',
      body: '{{actor}} hat „{{title}}“ abgelehnt.\n\nBegründung: {{reason}}',
      button: 'Vorgang öffnen',
    },
  },
  en: {
    signing_request: {
      subject: '{{sender}} requests your signature: {{title}}',
      body: 'Hello {{recipient}},\n\n{{sender}} sent you “{{title}}” for electronic signature.\n\n{{message}}\n\nThis link is personal and valid until {{expires}}. Please do not forward this email.',
      button: 'Review and sign',
    },
    reminder: {
      subject: 'Reminder: {{title}} is waiting for your signature',
      body: 'Hello {{recipient}},\n\n“{{title}}” from {{sender}} is still waiting for your signature. The link is valid until {{expires}}.',
      button: 'Sign now',
    },
    completed: {
      subject: 'Completed: {{title}}',
      body: 'Hello {{recipient}},\n\neveryone has signed “{{title}}”. Use the link to download the final document and the completion certificate.\n\nChecksum (SHA-256) of the signed document:\n{{checksum}}\n\nKeep this email: with the checksum you can confirm at {{verify_url}} at any time whether a file is exactly the signed document.',
      button: 'Download document',
    },
    declined: { subject: 'Declined: {{title}}', body: 'Hello {{recipient}},\n\n{{actor}} declined to sign “{{title}}”. The request has ended; no further action is needed.' },
    voided: { subject: 'Withdrawn: {{title}}', body: 'Hello {{recipient}},\n\n{{sender}} withdrew the signature request “{{title}}”. The link is no longer valid.\n\n{{reason}}' },
    expired: { subject: 'Expired: {{title}}', body: 'Hello {{recipient}},\n\nthe signature request “{{title}}” has expired and can no longer be signed.' },
    otp: { subject: 'Your verification code: {{code}}', body: 'Your verification code for “{{title}}” is:\n\n{{code}}\n\nThe code is valid for 10 minutes.' },
    form_otp: { subject: 'Your verification code: {{code}}', body: 'Your verification code for the form “{{title}}” is:\n\n{{code}}\n\nThe code is valid for 10 minutes.' },
    user_invite: { subject: 'Invitation to {{org}} on Paraph', body: '{{sender}} invited you to join “{{org}}”. The invitation is valid for 7 days.', button: 'Accept invitation' },
    password_reset: { subject: 'Reset your password', body: 'Use the link below to set a new password. It is valid for 60 minutes.', button: 'Set new password' },
    owner_completed: { subject: 'Everyone signed: {{title}}', body: '“{{title}}” is fully signed. Final document, certificate and evidence package are ready.', button: 'Open' },
    system_alert: { subject: 'Paraph: failure “{{job}}”', body: 'A background task failed permanently after all retries.\n\nTask: {{job}}\nError: {{error}}\n\nDetails and “Retry” under Settings → System.', button: 'Open system' },
    delivery_failed: { subject: 'Delivery failed: {{title}}', body: 'The email to {{recipient}} <{{email}}> about “{{title}}” could not be delivered.\n\nReason: {{error}}\n\nPlease check the address and resend from the envelope, or hand over the link another way.', button: 'Open envelope' },
    test: { subject: 'Paraph: test email', body: 'This test email confirms that Paraph can send through the configured mail server.\n\nSender: {{from}}\nTime: {{at}}' },
    owner_declined: { subject: 'Declined: {{title}}', body: '{{actor}} declined “{{title}}”.\n\nReason: {{reason}}', button: 'Open' },
  },
};

export function fill(tpl: string, vars: Vars): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function safeColor(c: string | undefined) {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_ACCENT;
}

export function renderMail(
  kind: MailKind,
  vars: Vars,
  opts: { locale: 'de' | 'en'; branding: Branding; orgName: string; link?: string; logoUrl?: string },
) {
  const base = T[opts.locale][kind];
  const custom = (opts.branding.mail as any)?.[kind] as { subject?: string; body?: string } | undefined;
  const subject = fill(custom?.subject || base.subject, vars).replace(/[\r\n]+/g, ' ').slice(0, 250);
  const body = fill(custom?.body || base.body, vars).replace(/\n{3,}/g, '\n\n').trim();
  const accent = safeColor(opts.branding.accent);
  const footer = opts.branding.footer ?? '';
  const text = `${body}\n\n${opts.link ? `${base.button ?? 'Link'}: ${opts.link}\n\n` : ''}${footer ? footer + '\n\n' : ''}— ${opts.orgName} · Paraph`;
  const paras = body.split(/\n\n/).map((p) => `<p style="margin:0 0 16px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = opts.link && base.button
    ? `<p style="margin:28px 0"><a href="${esc(opts.link)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:600">${esc(base.button)}</a></p><p style="margin:0 0 16px;font-size:12px;color:#6b6f80;word-break:break-all">${esc(opts.link)}</p>`
    : '';
  const logo = opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="${esc(opts.orgName)}" style="max-height:36px;max-width:180px;margin-bottom:24px">` : `<div style="font-weight:600;font-size:15px;margin-bottom:24px">${esc(opts.orgName)}</div>`;
  const html = `<!doctype html><html lang="${opts.locale}"><body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1c25">
<div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e6e2da">${logo}
<div style="font-size:15px;line-height:1.55">${paras}${button}</div></div>
<p style="font-size:12px;color:#8a8d99;margin:16px 4px">${footer ? esc(footer) + '<br>' : ''}Versendet über Paraph · ${esc(opts.orgName)}</p></div></body></html>`;
  return { subject, text, html };
}

export interface QueueMail {
  orgId: string;
  envelopeId?: string;
  recipientId?: string;
  to: string;
  kind: MailKind;
  vars: Vars;
  link?: string;
  locale?: 'de' | 'en';
  suppress?: boolean; // Testmodus
  attachments?: { filename: string; blobId: string }[];
}

export function queueMail(ctx: Ctx, m: QueueMail) {
  const org = getOrg(ctx, m.orgId);
  const locale = m.locale ?? org.settings.locale;
  const logoUrl = org.branding.logoBlobId ? `${ctx.cfg.appUrl}/api/public/orgs/${org.id}/logo` : undefined;
  const r = renderMail(m.kind, { org: org.name, ...m.vars }, { locale, branding: org.branding, orgName: org.name, link: m.link, logoUrl });
  const emailId = id('mail');
  const aad = 'mail:' + emailId;
  ctx.db
    .prepare(
      `INSERT INTO emails (id, org_id, envelope_id, recipient_id, to_addr, subject, text_body, html_body, reply_to, from_name, attachments, status, created_at, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      emailId,
      m.orgId,
      m.envelopeId ?? null,
      m.recipientId ?? null,
      m.to,
      r.subject,
      sealString(ctx.keys.secrets, r.text, aad),
      sealString(ctx.keys.secrets, r.html, aad),
      org.branding.replyTo ?? null,
      org.branding.senderName ?? org.name,
      JSON.stringify(m.attachments ?? []),
      m.suppress ? 'suppressed' : 'queued',
      ctx.now().toISOString(),
      m.kind,
    );
  if (!m.suppress) enqueue(ctx, 'send_email', { emailId });
  // Nur für Entwicklung und lokale Tests: Link im Log, wenn kein SMTP konfiguriert ist
  if (!ctx.cfg.smtp && ctx.cfg.devMode && m.link) ctx.log.info({ to: m.to, kind: m.kind, link: m.link }, 'E-Mail (kein SMTP konfiguriert)');
  return emailId;
}

let transporter: Transporter | null = null;
let transporterUrl = '';

/** Lokale Testserver (Mailpit) dürfen ohne TLS laufen – alles andere muss verschlüsselt sein. */
function isLocalHost(h: string) {
  return ['localhost', '127.0.0.1', '::1', 'mailpit', 'mailhog'].includes(h.toLowerCase());
}

export function smtpTransportOptions(url: string, allowInsecure = process.env.SMTP_ALLOW_INSECURE === 'true') {
  const u = new URL(url);
  const implicitTls = u.protocol === 'smtps:';
  // Signaturlinks und Codes dürfen nie im Klartext übertragen werden: STARTTLS erzwingen (requireTLS)
  const requireTLS = !implicitTls && !(allowInsecure || isLocalHost(u.hostname));
  if (/rejectUnauthorized=false/i.test(u.search) && !allowInsecure) throw new Error('SMTP_URL deaktiviert die Zertifikatsprüfung (rejectUnauthorized=false). Das ist nur mit SMTP_ALLOW_INSECURE=true zulässig.');
  return {
    url,
    requireTLS,
    pool: true,
    maxConnections: 2,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { minVersion: 'TLSv1.2' as const },
  };
}

/**
 * Erzeugt den SMTP-Transport. Wichtig: Optionen und URL in EINEM Objekt übergeben – das zweite Argument von
 * createTransport sind Nachrichten-Vorgaben, dort würden requireTLS, TLS-Version und Timeouts wirkungslos.
 */
export function createSmtpTransport(url: string, opts: { allowInsecure?: boolean; forceTls?: boolean } = {}): Transporter {
  const o = smtpTransportOptions(url, opts.allowInsecure);
  return nodemailer.createTransport({ ...o, ...(opts.forceTls ? { requireTLS: true } : {}) } as any);
}

function getTransport(ctx: Ctx): Transporter | null {
  if (!ctx.cfg.smtp) return null;
  if (!transporter || transporterUrl !== ctx.cfg.smtp.url) {
    transporter?.close();
    transporter = createSmtpTransport(ctx.cfg.smtp.url);
    transporterUrl = ctx.cfg.smtp.url;
  }
  return transporter;
}

export interface MailError {
  permanent: boolean;
  code: string;
  message: string; // verständlich, ohne Zugangsdaten
}

/** Ordnet SMTP-Fehler ein: dauerhaft (Adresse/Absender abgelehnt) oder vorübergehend (Netz, Server). */
export function classifyMailError(err: any): MailError {
  const rc = Number(err?.responseCode) || 0;
  const smtpText = String(err?.response ?? '').replace(/\s+/g, ' ').slice(0, 200);
  const code = String(err?.code ?? '');
  if (code === 'EAUTH') return { permanent: false, code: 'auth', message: 'Anmeldung am Mailserver fehlgeschlagen – Benutzername oder Passwort in SMTP_URL prüfen.' };
  if (code === 'ETLS' || /STARTTLS|TLS/i.test(String(err?.message)) && code !== 'EENVELOPE') return { permanent: false, code: 'tls', message: 'Verschlüsselte Verbindung zum Mailserver nicht möglich (TLS). Port und Protokoll prüfen (smtps:// für Port 465, smtp:// mit STARTTLS für 587).' };
  if (['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/.test(String(err?.message))) {
    return { permanent: false, code: 'connection', message: 'Mailserver nicht erreichbar (Verbindung oder Zeitüberschreitung). Paraph versucht es automatisch erneut.' };
  }
  if (rc >= 500 && rc < 600) {
    if (rc === 550 || rc === 551 || rc === 553 || /user unknown|mailbox unavailable|no such user|recipient.*reject|does not exist/i.test(smtpText)) {
      return { permanent: true, code: 'recipient_rejected', message: `Empfängeradresse abgelehnt (${rc}). Bitte die E-Mail-Adresse prüfen. Server: ${smtpText}` };
    }
    if (rc === 552) return { permanent: true, code: 'too_large', message: `Nachricht zu groß für das Postfach (${rc}). Ohne PDF-Anhang erneut senden.` };
    if (rc === 554 && /spam|policy|blocked|blacklist|dmarc|spf|dkim/i.test(smtpText)) return { permanent: true, code: 'policy', message: `Als unzulässig abgewiesen (${rc}) – SPF/DKIM/DMARC der Absenderdomain prüfen. Server: ${smtpText}` };
    return { permanent: true, code: 'rejected', message: `Vom Mailserver abgewiesen (${rc}). Server: ${smtpText}` };
  }
  if (rc >= 400 && rc < 500) return { permanent: false, code: 'deferred', message: `Vorübergehend abgewiesen (${rc}). Paraph versucht es erneut. Server: ${smtpText}` };
  return { permanent: false, code: 'unknown', message: `Versand fehlgeschlagen: ${String(err?.message ?? err).replace(/\/\/[^@\s]+@/g, '//***@').slice(0, 200)}` };
}

/** Prüft Verbindung und Anmeldung zum Mailserver (ohne etwas zu versenden). */
export async function verifySmtp(ctx: Ctx): Promise<{ ok: boolean; error?: MailError; secure?: string }> {
  const t = getTransport(ctx);
  if (!t) return { ok: false, error: { permanent: true, code: 'not_configured', message: 'SMTP ist nicht eingerichtet (SMTP_URL).' } };
  try {
    await t.verify();
    const u = new URL(ctx.cfg.smtp!.url);
    return { ok: true, secure: u.protocol === 'smtps:' ? 'TLS (implizit)' : smtpTransportOptions(ctx.cfg.smtp!.url).requireTLS ? 'STARTTLS (erzwungen)' : 'unverschlüsselt (nur lokal zulässig)' };
  } catch (e) {
    return { ok: false, error: classifyMailError(e) };
  }
}

function fromOf(ctx: Ctx, name: string | null) {
  const fromCfg = ctx.cfg.smtp!.from;
  const fromAddr = /<([^>]+)>/.exec(fromCfg)?.[1] ?? fromCfg;
  return { name: name ?? 'Paraph', address: fromAddr };
}

const SYSTEM_KINDS = new Set(['system_alert', 'delivery_failed', 'test', 'owner_completed', 'owner_declined']);

/** Sendet sofort (ohne Warteschlange) – für die Test-E-Mail der Administration. */
export async function sendTestMail(ctx: Ctx, orgId: string, to: string) {
  const t = getTransport(ctx);
  if (!t) return { ok: false, error: { permanent: true, code: 'not_configured', message: 'SMTP ist nicht eingerichtet (SMTP_URL).' } };
  const org = getOrg(ctx, orgId);
  const r = renderMail('test', { from: ctx.cfg.smtp!.from, at: ctx.now().toISOString() }, { locale: org.settings.locale, branding: org.branding, orgName: org.name });
  try {
    const info = await t.sendMail({ from: fromOf(ctx, org.branding.senderName ?? org.name), to, subject: r.subject, text: r.text, html: r.html, headers: { 'Auto-Submitted': 'auto-generated' } });
    return { ok: true, message_id: info.messageId, accepted: info.accepted?.length ?? 0, response: String(info.response ?? '').slice(0, 200) };
  } catch (e) {
    return { ok: false, error: classifyMailError(e) };
  }
}

/** Endgültiger Zustellfehler: Vorgang protokollieren und die versendende Person informieren. */
function onDeliveryFailed(ctx: Ctx, e: any, err: MailError) {
  if (!e.envelope_id || SYSTEM_KINDS.has(e.kind ?? '')) return;
  const env = ctx.db.prepare('SELECT id, org_id, title, owner_id FROM envelopes WHERE id = ?').get(e.envelope_id) as any;
  if (!env) return;
  const rec = e.recipient_id ? (ctx.db.prepare('SELECT id, name, email FROM recipients WHERE id = ?').get(e.recipient_id) as any) : null;
  ctx.db.transaction(() => {
    appendAudit(ctx.db, env.id, env.org_id, 'recipient.delivery_failed', { type: 'system' }, { recipient_id: rec?.id ?? null, email: e.to_addr, kind: e.kind, reason: err.code, detail: err.message.slice(0, 300) });
  }).immediate();
  emit(ctx, env.org_id, 'recipient.delivery_failed', { envelope_id: env.id, recipient_id: rec?.id ?? null, reason: err.code });
  const owner = env.owner_id ? (ctx.db.prepare('SELECT email FROM users WHERE id = ? AND disabled_at IS NULL').get(env.owner_id) as any) : null;
  if (owner && owner.email !== e.to_addr) {
    queueMail(ctx, { orgId: env.org_id, envelopeId: env.id, to: owner.email, kind: 'delivery_failed', link: `${ctx.cfg.appUrl}/envelopes/${env.id}`, vars: { title: env.title, recipient: rec?.name ?? e.to_addr, email: e.to_addr, error: err.message } });
  }
}

registerJob('send_email', async (ctx, { emailId }) => {
  const e = ctx.db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId) as any;
  if (!e || e.status !== 'queued') return;
  const t = getTransport(ctx);
  if (!t) {
    ctx.db.prepare(`UPDATE emails SET status = 'failed', last_error = ? WHERE id = ?`).run('SMTP ist nicht eingerichtet (SMTP_URL).', emailId);
    onDeliveryFailed(ctx, e, { permanent: true, code: 'not_configured', message: 'SMTP ist nicht eingerichtet – E-Mail nicht versendet.' });
    return;
  }
  const aad = 'mail:' + emailId;
  const atts = JSON.parse(e.attachments) as { filename: string; blobId: string }[];
  const attachments = [];
  for (const a of atts) attachments.push({ filename: a.filename, content: await ctx.blobs.get(a.blobId) });
  try {
    const info = await t.sendMail({
      from: fromOf(ctx, e.from_name),
      to: e.to_addr,
      replyTo: e.reply_to ?? undefined,
      subject: e.subject,
      text: openString(ctx.keys.secrets, e.text_body, aad),
      html: openString(ctx.keys.secrets, e.html_body, aad),
      attachments,
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    });
    // Inhalt verwerfen: enthält ggf. einen gültigen Signaturlink
    ctx.db.prepare(`UPDATE emails SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = ?, text_body = '', html_body = '' WHERE id = ?`).run(ctx.now().toISOString(), String(info?.response ?? '').slice(0, 200) || null, emailId);
  } catch (raw: any) {
    const err = classifyMailError(raw);
    const attempts = (e.attempts ?? 0) + 1;
    const final = err.permanent || attempts >= 8;
    // Dauerhafte Fehler nicht achtmal wiederholen; Inhalt dann verwerfen
    ctx.db
      .prepare(`UPDATE emails SET attempts = ?, last_error = ?, status = CASE WHEN ? THEN 'failed' ELSE status END, text_body = CASE WHEN ? THEN '' ELSE text_body END, html_body = CASE WHEN ? THEN '' ELSE html_body END WHERE id = ?`)
      .run(attempts, err.message.slice(0, 500), final ? 1 : 0, final ? 1 : 0, final ? 1 : 0, emailId);
    ctx.log.warn({ email: emailId, kind: e.kind, code: err.code, permanent: err.permanent, attempts }, 'E-Mail nicht zugestellt');
    if (final) {
      onDeliveryFailed(ctx, e, err);
      return;
    }
    throw new Error(err.message);
  }
});
