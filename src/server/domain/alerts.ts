// Benachrichtigung der Instanz-Administration bei endgültig gescheiterten Hintergrundaufgaben.
// Höchstens eine E-Mail je Aufgabentyp und 24 Stunden; Mailfehler selbst werden nur protokolliert
// (sonst würde ein defekter Mailserver eine Benachrichtigungsschleife auslösen).
import type { Ctx } from '../context.js';
import { onJobFailed } from './jobs.js';
import { queueMail } from './mail.js';

const JOB_LABEL: Record<string, string> = {
  send_email: 'E-Mail-Versand',
  finalize_envelope: 'Abschluss eines Vorgangs',
  backup_auto: 'Automatische Sicherung',
  audit_anchor: 'Verankerung der Audit-Ketten',
  webhook_delivery: 'Webhook-Zustellung',
  retention_purge: 'Löschung nach Aufbewahrungsfrist',
};

export function alertAdmins(ctx: Ctx, job: { type: string; error: string }) {
  const key = `alert:${job.type}`;
  const last = ctx.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  if (last && ctx.now().getTime() - new Date(last.value).getTime() < 24 * 3600_000) return false;
  ctx.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, ctx.now().toISOString());
  const org = ctx.db.prepare('SELECT id FROM orgs ORDER BY created_at LIMIT 1').get() as { id: string } | undefined;
  if (!org) return false;
  const admins = ctx.db.prepare('SELECT email FROM users WHERE is_instance_admin = 1 AND disabled_at IS NULL').all() as { email: string }[];
  for (const a of admins) {
    queueMail(ctx, { orgId: org.id, to: a.email, kind: 'system_alert', link: `${ctx.cfg.appUrl}/settings/system`, vars: { job: JOB_LABEL[job.type] ?? job.type, error: job.error.slice(0, 400) } });
  }
  return admins.length > 0;
}

onJobFailed((ctx, job) => {
  if (job.type === 'send_email') return;
  alertAdmins(ctx, job);
});
