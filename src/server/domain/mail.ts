// E-Mail über eine Outbox: erst in der Datenbank (verschlüsselt), dann per Job versendet.
// Inhalte mit Signaturlinks werden nach dem Versand gelöscht, damit die Datenbank keine gültigen Links hält.
import nodemailer, { type Transporter } from 'nodemailer';
import type { Ctx } from '../context.js';
import { id, openString, sealString } from '../lib/crypto.js';
import { registerJob, enqueue } from './jobs.js';
import { getOrg, type Branding } from './orgs.js';

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
  | 'form_otp';

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
      body: 'Guten Tag {{recipient}},\n\nalle Beteiligten haben „{{title}}“ unterschrieben. Über den Link können Sie das fertige Dokument und die Abschlussbestätigung herunterladen.',
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
      body: 'Hello {{recipient}},\n\neveryone has signed “{{title}}”. Use the link to download the final document and the completion certificate.',
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
    owner_declined: { subject: 'Declined: {{title}}', body: '{{actor}} declined “{{title}}”.\n\nReason: {{reason}}', button: 'Open' },
  },
};

export function fill(tpl: string, vars: Vars): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function safeColor(c: string | undefined) {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#3D5AFE';
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
      `INSERT INTO emails (id, org_id, envelope_id, recipient_id, to_addr, subject, text_body, html_body, reply_to, from_name, attachments, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  if (!m.suppress) enqueue(ctx, 'send_email', { emailId });
  // Nur für Entwicklung und lokale Tests: Link im Log, wenn kein SMTP konfiguriert ist
  if (!ctx.cfg.smtp && ctx.cfg.devMode && m.link) ctx.log.info({ to: m.to, kind: m.kind, link: m.link }, 'E-Mail (kein SMTP konfiguriert)');
  return emailId;
}

let transporter: Transporter | null = null;
let transporterUrl = '';

function getTransport(ctx: Ctx): Transporter | null {
  if (!ctx.cfg.smtp) return null;
  if (!transporter || transporterUrl !== ctx.cfg.smtp.url) {
    transporter = nodemailer.createTransport(ctx.cfg.smtp.url);
    transporterUrl = ctx.cfg.smtp.url;
  }
  return transporter;
}

registerJob('send_email', async (ctx, { emailId }) => {
  const e = ctx.db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId) as any;
  if (!e || e.status !== 'queued') return;
  const t = getTransport(ctx);
  if (!t) {
    ctx.db.prepare(`UPDATE emails SET status = 'failed', last_error = ? WHERE id = ?`).run('SMTP ist nicht konfiguriert (SMTP_URL).', emailId);
    return;
  }
  const aad = 'mail:' + emailId;
  const fromCfg = ctx.cfg.smtp!.from;
  const fromAddr = /<([^>]+)>/.exec(fromCfg)?.[1] ?? fromCfg;
  const atts = JSON.parse(e.attachments) as { filename: string; blobId: string }[];
  const attachments = [];
  for (const a of atts) attachments.push({ filename: a.filename, content: await ctx.blobs.get(a.blobId) });
  try {
    await t.sendMail({
      from: { name: e.from_name ?? 'Paraph', address: fromAddr },
      to: e.to_addr,
      replyTo: e.reply_to ?? undefined,
      subject: e.subject,
      text: openString(ctx.keys.secrets, e.text_body, aad),
      html: openString(ctx.keys.secrets, e.html_body, aad),
      attachments,
    });
    // Inhalt verwerfen: enthält ggf. einen gültigen Signaturlink
    ctx.db.prepare(`UPDATE emails SET status = 'sent', sent_at = ?, attempts = attempts + 1, text_body = '', html_body = '' WHERE id = ?`).run(ctx.now().toISOString(), emailId);
  } catch (err: any) {
    const attempts = (e.attempts ?? 0) + 1;
    // Nach dem letzten Versuch endgültig als fehlgeschlagen markieren (sichtbar unter Einstellungen → System)
    ctx.db.prepare(`UPDATE emails SET attempts = ?, last_error = ?, status = CASE WHEN ? >= 8 THEN 'failed' ELSE status END WHERE id = ?`).run(attempts, String(err?.message ?? err).slice(0, 500), attempts, emailId);
    throw err;
  }
});
