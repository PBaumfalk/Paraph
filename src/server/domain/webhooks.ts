// Webhooks nach dem Schema von „Standard Webhooks“: webhook-id, webhook-timestamp, webhook-signature (v1, HMAC-SHA256).
import { createHmac, randomBytes } from 'node:crypto';
import type { Ctx } from '../context.js';
import { id, openString, sealString } from '../lib/crypto.js';
import { registerJob, enqueue } from './jobs.js';
import { safeFetch, SsrfError } from '../lib/ssrf.js';

export const WEBHOOK_EVENTS = [
  'envelope.sent',
  'envelope.completed',
  'envelope.declined',
  'envelope.voided',
  'envelope.expired',
  'recipient.notified',
  'recipient.viewed',
  'recipient.signed',
  'recipient.declined',
  'recipient.delegated',
  'recipient.delivery_failed',
  'template.published',
] as const;

export function newWebhookSecret() {
  return 'whsec_' + randomBytes(24).toString('base64');
}

export function signPayload(secret: string, msgId: string, ts: number, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${msgId}.${ts}.${body}`).digest('base64');
}

export function encryptSecret(ctx: Ctx, webhookId: string, secret: string) {
  return sealString(ctx.keys.secrets, secret, 'webhook:' + webhookId);
}
export function decryptSecret(ctx: Ctx, webhookId: string, enc: string) {
  return openString(ctx.keys.secrets, enc, 'webhook:' + webhookId);
}

/** Veröffentlicht ein Ereignis: Live-Aktualisierung der Oberfläche und Webhook-Zustellung. */
export function emit(ctx: Ctx, orgId: string, type: string, data: Record<string, unknown>, opts: { testMode?: boolean } = {}) {
  const eventId = id('evt');
  const ts = ctx.now().toISOString();
  ctx.bus.emit('org:' + orgId, { id: eventId, type, ts, data, test_mode: !!opts.testMode });
  const hooks = ctx.db.prepare(`SELECT id, events FROM webhooks WHERE org_id = ? AND active = 1 AND mode = ?`).all(orgId, opts.testMode ? 'test' : 'live') as {
    id: string;
    events: string;
  }[];
  for (const h of hooks) {
    const events = JSON.parse(h.events) as string[];
    if (!events.includes('*') && !events.includes(type)) continue;
    const deliveryId = id('whd');
    const payload = JSON.stringify({ id: eventId, type, created_at: ts, test_mode: !!opts.testMode, data });
    ctx.db
      .prepare(`INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`)
      .run(deliveryId, h.id, type, payload, ts);
    enqueue(ctx, 'webhook_delivery', { deliveryId });
  }
}

registerJob('webhook_delivery', async (ctx, { deliveryId }) => {
  const d = ctx.db
    .prepare(`SELECT d.*, w.url, w.secret_enc, w.active FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = ?`)
    .get(deliveryId) as any;
  if (!d || d.status === 'delivered' || !d.active) return;
  const secret = decryptSecret(ctx, d.webhook_id, d.secret_enc);
  const ts = Math.floor(ctx.now().getTime() / 1000);
  const msgId = JSON.parse(d.payload).id as string;
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'Paraph-Webhooks/1',
    'webhook-id': msgId,
    'webhook-timestamp': String(ts),
    'webhook-signature': signPayload(secret, msgId, ts, d.payload),
  };
  let status = 0;
  let error: string | null = null;
  try {
    const r = await safeFetch(d.url, { method: 'POST', headers, body: d.payload }, { allowPrivate: ctx.cfg.webhookAllowPrivate, allowHosts: ctx.cfg.webhookAllowHosts });
    status = r.status;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (e: any) {
    error = e instanceof SsrfError ? `Blockiert: ${e.message}` : String(e?.cause?.code ?? e?.message ?? e);
  }
  const attempts = d.attempts + 1;
  if (!error) {
    ctx.db
      .prepare(`UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_status_code = ?, last_error = NULL, delivered_at = ? WHERE id = ?`)
      .run(attempts, status, ctx.now().toISOString(), deliveryId);
    return;
  }
  const giveUp = attempts >= 8 || error.startsWith('Blockiert');
  ctx.db
    .prepare(`UPDATE webhook_deliveries SET status = ?, attempts = ?, last_status_code = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`)
    .run(giveUp ? 'failed' : 'pending', attempts, status || null, error, giveUp ? null : new Date(ctx.now().getTime() + Math.min(2 ** attempts * 5000, 3600_000)).toISOString(), deliveryId);
  if (!giveUp) throw new Error(`Webhook-Zustellung fehlgeschlagen: ${error}`);
});
