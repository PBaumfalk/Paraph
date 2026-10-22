// Optionaler SMS-Versand über ein beliebiges HTTP-Gateway (z. B. eigener Dienst, seven.io, sipgate über n8n).
// Erwartet: POST SMS_GATEWAY_URL mit JSON { to, text, sender } und optional Bearer-Token.
// Kosten und Datenfluss liegen beim gewählten Anbieter – siehe Handbuch.
import type { Ctx } from '../context.js';
import { AppError } from '../lib/errors.js';

export async function sendSms(ctx: Ctx, to: string, text: string) {
  if (!ctx.cfg.sms) throw new AppError(503, 'sms_unavailable', 'SMS-Versand ist nicht eingerichtet.');
  const res = await fetch(ctx.cfg.sms.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ctx.cfg.sms.token ? { authorization: `Bearer ${ctx.cfg.sms.token}` } : {}) },
    body: JSON.stringify({ to, text, sender: ctx.cfg.sms.sender }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new AppError(502, 'sms_failed', 'Die SMS konnte nicht versendet werden.');
}
