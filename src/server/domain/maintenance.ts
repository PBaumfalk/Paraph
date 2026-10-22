// Periodische Aufgaben: Ablauf, Erinnerungen, Aufbewahrung, Aufräumen.
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { appendAudit } from './audit.js';
import { envRow, recipientsOf, remindRecipient, senderName } from './envelopes.js';
import { registerJob } from './jobs.js';
import { queueMail } from './mail.js';
import { emit } from './webhooks.js';
import { getOrg } from './orgs.js';

export function expireScan(ctx: Ctx) {
  const now = ctx.now().toISOString();
  const due = ctx.db.prepare(`SELECT id FROM envelopes WHERE status = 'sent' AND expires_at IS NOT NULL AND expires_at <= ?`).all(now) as { id: string }[];
  for (const { id: envId } of due) {
    tx(ctx.db, () => {
      const env = envRow(ctx, envId)!;
      if (env.status !== 'sent') return;
      // Läuft gerade der Abschluss (alle haben unterschrieben), nicht ablaufen lassen
      const open = recipientsOf(ctx, envId).filter((r) => r.kind !== 'viewer' && !['completed', 'delegated'].includes(r.status));
      if (open.length === 0) return;
      ctx.db.prepare(`UPDATE envelopes SET status = 'expired', finished_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status = 'sent'`).run(now, now, envId);
      ctx.db.prepare(`UPDATE recipients SET token_hash = NULL WHERE envelope_id = ? AND status != 'completed'`).run(envId);
      ctx.db.prepare(`DELETE FROM signer_sessions WHERE recipient_id IN (SELECT id FROM recipients WHERE envelope_id = ?)`).run(envId);
      appendAudit(ctx.db, envId, env.org_id, 'envelope.expired', { type: 'system' }, { expires_at: env.expires_at });
      for (const r of open.filter((x) => x.sent_at)) {
        queueMail(ctx, { orgId: env.org_id, envelopeId: envId, recipientId: r.id, to: r.email, kind: 'expired', locale: env.locale, suppress: !!env.test_mode, vars: { title: env.title, recipient: r.name, sender: senderName(ctx, env) } });
      }
      emit(ctx, env.org_id, 'envelope.expired', { envelope_id: envId }, { testMode: !!env.test_mode });
    });
  }
  return due.length;
}

export function reminderScan(ctx: Ctx) {
  const now = ctx.now();
  const rows = ctx.db
    .prepare(
      `SELECT r.id AS rid, e.id AS eid, e.reminder_days, COALESCE(r.last_reminded_at, r.sent_at) AS since
       FROM recipients r JOIN envelopes e ON e.id = r.envelope_id
       WHERE e.status = 'sent' AND e.reminder_days > 0 AND e.test_mode = 0 AND e.notify = 1 AND r.status IN ('sent','opened')`,
    )
    .all() as any[];
  let n = 0;
  for (const r of rows) {
    if (!r.since || now.getTime() - new Date(r.since).getTime() < r.reminder_days * 86400_000) continue;
    try {
      remindRecipient(ctx, null, r.eid, r.rid);
      n++;
    } catch (e) {
      ctx.log.warn({ err: String(e), envelope: r.eid }, 'Erinnerung fehlgeschlagen');
    }
  }
  return n;
}

/** Löscht Dokumentinhalte abgeschlossener Vorgänge nach Ablauf der Aufbewahrungsfrist der Organisation.
 *  Der Audit-Trail und das Hash-Register bleiben erhalten (Nachweis, dass und was signiert wurde). */
export async function retentionPurge(ctx: Ctx) {
  const orgs = ctx.db.prepare('SELECT id FROM orgs').all() as { id: string }[];
  let purged = 0;
  for (const o of orgs) {
    const days = getOrg(ctx, o.id).settings.retentionDays;
    if (!days) continue;
    const cutoff = new Date(ctx.now().getTime() - days * 86400_000).toISOString();
    const envs = ctx.db.prepare(`SELECT id FROM envelopes WHERE org_id = ? AND status IN ('completed','declined','voided','expired') AND finished_at < ? AND json_extract(metadata, '$.__purged') IS NULL`).all(o.id, cutoff) as { id: string }[];
    for (const { id: envId } of envs) {
      const blobIds = new Set<string>();
      for (const d of ctx.db.prepare('SELECT blob_id, source_blob_id FROM envelope_documents WHERE envelope_id = ?').all(envId) as any[]) {
        blobIds.add(d.blob_id);
        blobIds.add(d.source_blob_id);
      }
      const res = ctx.db.prepare('SELECT * FROM envelope_results WHERE envelope_id = ?').get(envId) as any;
      if (res) [res.final_blob_id, res.certificate_blob_id, res.evidence_blob_id].forEach((b: string) => blobIds.add(b));
      for (const f of ctx.db.prepare('SELECT blob_id FROM final_documents WHERE envelope_id = ?').all(envId) as any[]) blobIds.add(f.blob_id);
      for (const s of ctx.db.prepare('SELECT s.blob_id FROM signatures s JOIN recipients r ON r.id = s.recipient_id WHERE r.envelope_id = ?').all(envId) as any[]) blobIds.add(s.blob_id);
      for (const a of ctx.db.prepare('SELECT a.blob_id FROM recipient_attachments a JOIN recipients r ON r.id = a.recipient_id WHERE r.envelope_id = ?').all(envId) as any[]) blobIds.add(a.blob_id);
      for (const b of blobIds) {
        // Blobs, die noch von einer Vorlage oder einem anderen Vorgang genutzt werden, bleiben
        const usedElsewhere = ctx.db.prepare(`SELECT 1 FROM envelope_documents WHERE (blob_id = ? OR source_blob_id = ?) AND envelope_id != ? LIMIT 1`).get(b, b, envId)
          || ctx.db.prepare(`SELECT 1 FROM template_versions WHERE content LIKE ? LIMIT 1`).get(`%"${b}"%`)
          || ctx.db.prepare(`SELECT 1 FROM templates WHERE draft LIKE ? LIMIT 1`).get(`%"${b}"%`);
        if (!usedElsewhere) await ctx.blobs.delete(b).catch(() => {});
      }
      tx(ctx.db, () => {
        ctx.db.prepare(`UPDATE fields SET value = NULL WHERE envelope_id = ?`).run(envId);
        // Inhalte auch außerhalb der Dateien entfernen: Textauszug, Nachricht, Ablehnungsgrund, E-Mail-Reste
        ctx.db.prepare(`UPDATE envelope_documents SET text_excerpt = '' WHERE envelope_id = ?`).run(envId);
        ctx.db.prepare(`UPDATE envelopes SET message = '' WHERE id = ?`).run(envId);
        ctx.db.prepare(`UPDATE recipients SET decline_reason = NULL, phone = NULL WHERE envelope_id = ?`).run(envId);
        ctx.db.prepare(`DELETE FROM emails WHERE envelope_id = ?`).run(envId);
        ctx.db.prepare(`UPDATE envelopes SET metadata = json_set(metadata, '$.__purged', ?) WHERE id = ?`).run(ctx.now().toISOString(), envId);
        appendAudit(ctx.db, envId, o.id, 'envelope.content_purged', { type: 'system' }, { retention_days: days, files: blobIds.size });
      });
      purged++;
    }
  }
  return purged;
}

export function cleanup(ctx: Ctx) {
  const now = ctx.now().toISOString();
  ctx.db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL AND revoked_at < ?`).run(now, new Date(ctx.now().getTime() - 7 * 86400_000).toISOString());
  ctx.db.prepare(`DELETE FROM signer_sessions WHERE expires_at < ?`).run(now);
  ctx.db.prepare(`DELETE FROM otp_challenges WHERE expires_at < ?`).run(new Date(ctx.now().getTime() - 86400_000).toISOString());
  ctx.db.prepare(`DELETE FROM idempotency_keys WHERE created_at < ?`).run(new Date(ctx.now().getTime() - 2 * 86400_000).toISOString());
  ctx.db.prepare(`DELETE FROM jobs WHERE status = 'done' AND finished_at < ?`).run(new Date(ctx.now().getTime() - 7 * 86400_000).toISOString());
  // Versandte E-Mails nach 90 Tagen nur noch als Metadaten
  ctx.db.prepare(`DELETE FROM emails WHERE created_at < ?`).run(new Date(ctx.now().getTime() - 90 * 86400_000).toISOString());
  ctx.db.prepare(`DELETE FROM webhook_deliveries WHERE created_at < ?`).run(new Date(ctx.now().getTime() - 30 * 86400_000).toISOString());
  ctx.db.prepare(`DELETE FROM meta WHERE (key LIKE 'pwreset:%' OR key LIKE 'pfotp:%') AND json_extract(value, '$.exp') < ?`).run(ctx.now().getTime());
}

registerJob('expire_scan', async (ctx) => void expireScan(ctx));
registerJob('reminder_scan', async (ctx) => void reminderScan(ctx));
registerJob('retention_purge', async (ctx) => void (await retentionPurge(ctx)));
registerJob('cleanup', async (ctx) => cleanup(ctx));
