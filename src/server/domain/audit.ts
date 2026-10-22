// Audit-Trail als Hash-Kette je Vorgang.
// Manipulationserkennung: Jede Änderung eines Eintrags bricht die Kette ab dem Eintrag.
// Manipulationsverhinderung (begrenzt): UPDATE/DELETE werden per Datenbank-Trigger abgewiesen.
// Gegen jemanden mit direktem Schreibzugriff auf die Datenbankdatei schützt nur die Erkennung –
// und ab Abschluss das versiegelte Nachweispaket, dessen Kettenkopf kryptografisch signiert ist.
import type { DB } from '../db/index.js';
import { canonicalJson, sha256Hex } from '../lib/crypto.js';

export type Actor =
  | { type: 'user'; id: string; name: string; email: string }
  | { type: 'api'; id: string; name: string }
  | { type: 'recipient'; id: string; name: string; email: string }
  | { type: 'system' }
  | { type: 'public'; ip?: string };

export interface AuditEvent {
  seq: number;
  ts: string;
  type: string;
  actor: Actor;
  data: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);

export function eventHash(envelopeId: string, e: Omit<AuditEvent, 'hash'>): string {
  return sha256Hex(canonicalJson({ envelope_id: envelopeId, seq: e.seq, ts: e.ts, type: e.type, actor: e.actor, data: e.data, prev_hash: e.prev_hash }));
}

/** Muss innerhalb einer Transaktion aufgerufen werden, damit seq/prev_hash konsistent bleiben. */
export function appendAudit(db: DB, envelopeId: string, orgId: string, type: string, actor: Actor, data: Record<string, unknown> = {}, ts = new Date()): AuditEvent {
  const last = db.prepare('SELECT seq, hash FROM audit_events WHERE envelope_id = ? ORDER BY seq DESC LIMIT 1').get(envelopeId) as { seq: number; hash: string } | undefined;
  const base = { seq: (last?.seq ?? 0) + 1, ts: ts.toISOString(), type, actor, data, prev_hash: last?.hash ?? GENESIS };
  const hash = eventHash(envelopeId, base);
  db.prepare('INSERT INTO audit_events (envelope_id, org_id, seq, ts, type, actor, data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    envelopeId,
    orgId,
    base.seq,
    base.ts,
    type,
    JSON.stringify(actor),
    JSON.stringify(data),
    base.prev_hash,
    hash,
  );
  return { ...base, hash };
}

export function listAudit(db: DB, envelopeId: string): AuditEvent[] {
  return (db.prepare('SELECT seq, ts, type, actor, data, prev_hash, hash FROM audit_events WHERE envelope_id = ? ORDER BY seq').all(envelopeId) as any[]).map((r) => ({
    ...r,
    actor: JSON.parse(r.actor),
    data: JSON.parse(r.data),
  }));
}

export interface ChainCheck {
  ok: boolean;
  count: number;
  head: string;
  brokenAt?: number;
  reason?: string;
}

export function verifyChain(envelopeId: string, events: AuditEvent[]): ChainCheck {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i + 1) return { ok: false, count: events.length, head: prev, brokenAt: e.seq, reason: 'Lücke in der Reihenfolge' };
    if (e.prev_hash !== prev) return { ok: false, count: events.length, head: prev, brokenAt: e.seq, reason: 'Verkettung unterbrochen' };
    const { hash, ...rest } = e;
    if (eventHash(envelopeId, rest) !== hash) return { ok: false, count: events.length, head: prev, brokenAt: e.seq, reason: 'Eintrag verändert' };
    prev = hash;
  }
  return { ok: true, count: events.length, head: prev };
}
