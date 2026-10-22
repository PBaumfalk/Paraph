// Externe Verankerung der Audit-Ketten.
//
// Problem: Die Hash-Kette je Vorgang erkennt Änderungen nur, solange niemand die ganze Kette neu berechnet.
// Wer Schreibzugriff auf Datenbank und Server hat, kann alte Ereignisse ändern und alle Hashes neu bilden.
//
// Gegenmaßnahme: In festen Abständen werden die aktuellen Kettenköpfe aller geänderten (versandten) Vorgänge
// in einem Merkle-Baum (RFC 6962) zusammengefasst. Die Anker bilden ihrerseits eine Kette, und jeder Anker
// wird – wenn ein Zeitstempeldienst (TSA_URL) eingerichtet ist – von einem unabhängigen Dritten mit
// RFC-3161-Zeitstempel bestätigt. Eine nachträgliche Fälschung müsste dann neue Anker mit neuen
// Zeitstempeln erzeugen; deren Zeit liegt zwangsläufig nach der Fälschung und verrät sie.
//
// Grenze (ehrlich): Ohne Zeitstempeldienst ist die Ankerkette nur eine weitere interne Kette und schützt
// nicht gegen jemanden mit vollem Serverzugriff. Außerhalb des Servers aufbewahrte Sicherungen und die
// an Unterzeichner versandten Prüfwerte bleiben dann die einzigen externen Zeugen.
import * as pkijs from 'pkijs';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { canonicalJson, sha256Hex } from '../lib/crypto.js';
import { createHash } from 'node:crypto';
import { requestTimestamp, verifyTimestampToken, type TimestampInfo } from '../pdf/timestamp.js';
import { listAudit, verifyChain } from './audit.js';
import { registerJob } from './jobs.js';

// ───────────── Merkle-Baum nach RFC 6962 ─────────────

const h = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();
export const leafHash = (envelopeId: string, seq: number, head: string) => h(Buffer.from([0]), Buffer.from(`${envelopeId}:${seq}:${head}`, 'utf8'));
const nodeHash = (l: Buffer, r: Buffer) => h(Buffer.from([1]), l, r);

function split(n: number) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return h();
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** Prüfpfad (Audit Path) für Blatt m nach RFC 6962, Abschnitt 2.1.1. */
export function inclusionProof(leaves: Buffer[], m: number): Buffer[] {
  if (leaves.length <= 1) return [];
  const k = split(leaves.length);
  if (m < k) return [...inclusionProof(leaves.slice(0, k), m), merkleRoot(leaves.slice(k))];
  return [...inclusionProof(leaves.slice(k), m - k), merkleRoot(leaves.slice(0, k))];
}

/** Rekonstruiert die Wurzel aus Blatt, Index, Baumgröße und Prüfpfad (RFC 9162, 2.1.3.2). */
export function rootFromProof(leaf: Buffer, index: number, size: number, proof: Buffer[]): Buffer {
  if (index >= size) throw new Error('Index außerhalb des Baums');
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of proof) {
    if (sn === 0) throw new Error('Prüfpfad zu lang');
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) {
        fn >>= 1;
        sn >>= 1;
      }
    } else r = nodeHash(r, p);
    fn >>= 1;
    sn >>= 1;
  }
  if (sn !== 0) throw new Error('Prüfpfad zu kurz');
  return r;
}

// ───────────── Anker ─────────────

export interface AnchorRow {
  id: number;
  created_at: string;
  prev_hash: string;
  root: string;
  leaves: number;
  anchor_hash: string;
  tsa_token: Buffer | null;
  tsa_time: string | null;
  tsa_error: string | null;
}

export const ANCHOR_GENESIS = '0'.repeat(64);

export function anchorHash(a: { id: number; created_at: string; prev_hash: string; root: string; leaves: number }) {
  return sha256Hex(canonicalJson({ format: 'paraph-anchor/1', id: a.id, created_at: a.created_at, prev_hash: a.prev_hash, root: a.root, leaves: a.leaves }));
}

/** Verankert alle Vorgänge (außer Entwürfen), deren Kettenkopf sich seit dem letzten Anker geändert hat. */
export async function createAnchor(ctx: Ctx): Promise<AnchorRow | null> {
  // Kandidaten: aktueller Kettenkopf je Vorgang, sofern nicht bereits mit diesem seq verankert
  const heads = ctx.db
    .prepare(
      `SELECT a.envelope_id, a.seq, a.hash FROM audit_events a
       JOIN (SELECT envelope_id, MAX(seq) AS seq FROM audit_events GROUP BY envelope_id) m ON m.envelope_id = a.envelope_id AND m.seq = a.seq
       JOIN envelopes e ON e.id = a.envelope_id
       WHERE e.status != 'draft'
         AND NOT EXISTS (SELECT 1 FROM audit_anchor_leaves l WHERE l.envelope_id = a.envelope_id AND l.seq >= a.seq)
       ORDER BY a.envelope_id`,
    )
    .all() as { envelope_id: string; seq: number; hash: string }[];
  if (!heads.length) return null;
  const leafHashes = heads.map((x) => leafHash(x.envelope_id, x.seq, x.hash));
  const root = merkleRoot(leafHashes).toString('hex');
  // Anker zuerst ohne Zeitstempel festschreiben (Reihenfolge und Kette sind dann gesichert) …
  const row = tx(ctx.db, () => {
    const last = ctx.db.prepare('SELECT id, anchor_hash FROM audit_anchors ORDER BY id DESC LIMIT 1').get() as { id: number; anchor_hash: string } | undefined;
    const base = { id: (last?.id ?? 0) + 1, created_at: ctx.now().toISOString(), prev_hash: last?.anchor_hash ?? ANCHOR_GENESIS, root, leaves: heads.length };
    const ah = anchorHash(base);
    ctx.db.prepare('INSERT INTO audit_anchors (id, created_at, prev_hash, root, leaves, anchor_hash) VALUES (?, ?, ?, ?, ?, ?)').run(base.id, base.created_at, base.prev_hash, base.root, base.leaves, ah);
    const ins = ctx.db.prepare('INSERT INTO audit_anchor_leaves (anchor_id, idx, envelope_id, seq, head) VALUES (?, ?, ?, ?, ?)');
    heads.forEach((x, i) => ins.run(base.id, i, x.envelope_id, x.seq, x.hash));
    return { ...base, anchor_hash: ah };
  });
  // … dann extern bestätigen lassen. Scheitert der Dienst, holt der nächste Lauf den Zeitstempel nach.
  await stampPending(ctx);
  return ctx.db.prepare('SELECT * FROM audit_anchors WHERE id = ?').get(row.id) as AnchorRow;
}

/** Holt fehlende Zeitstempel für Anker nach (älteste zuerst). */
export async function stampPending(ctx: Ctx) {
  if (!ctx.cfg.tsaUrl) return 0;
  const pending = ctx.db.prepare('SELECT id, anchor_hash FROM audit_anchors WHERE tsa_token IS NULL ORDER BY id LIMIT 20').all() as { id: number; anchor_hash: string }[];
  let n = 0;
  for (const a of pending) {
    try {
      const ts = await requestTimestamp(ctx.cfg.tsaUrl, Buffer.from(a.anchor_hash, 'hex'));
      ctx.db.prepare('UPDATE audit_anchors SET tsa_token = ?, tsa_time = ?, tsa_error = NULL WHERE id = ? AND tsa_token IS NULL').run(Buffer.from(ts.token.toSchema().toBER(false)), ts.info.genTime, a.id);
      n++;
    } catch (e: any) {
      ctx.db.prepare('UPDATE audit_anchors SET tsa_error = ? WHERE id = ?').run(String(e?.message ?? e).slice(0, 300), a.id);
      ctx.log.warn({ anchor: a.id, err: String(e?.message ?? e) }, 'Zeitstempel für Anker fehlgeschlagen');
      break;
    }
  }
  return n;
}

export async function verifyAnchorToken(row: Pick<AnchorRow, 'anchor_hash' | 'tsa_token'>): Promise<TimestampInfo> {
  if (!row.tsa_token) throw new Error('kein Zeitstempel');
  return verifyTimestampToken(pkijs.ContentInfo.fromBER(new Uint8Array(row.tsa_token)), Buffer.from(row.anchor_hash, 'hex'));
}

// ───────────── Prüfung ─────────────

export interface AnchorReport {
  ok: boolean;
  anchors: number;
  stamped: number; // mit geprüftem Zeitstempel UND geprüfter Vertrauenskette
  stampedUnverifiedChain: number; // Zeitstempel rechnerisch gültig, Aussteller aber nicht gegen Vertrauensanker geprüft
  unstamped: number;
  problems: string[];
  warnings: string[];
  envelopes: number;
  /** Je Vorgang: bis zu welchem Eintrag extern (mit Zeitstempel) bzw. intern verankert, und ab wann. */
  coverage: Map<string, { seq: number; anchorId: number; externalTime: string | null }[]>;
}

/** Größter zulässiger Abstand zwischen Ankererstellung und Zeitstempel. */
const STAMP_TOLERANCE_MS = 15 * 60_000;

export async function verifyAnchors(ctx: Ctx, opts: { envelopeId?: string } = {}): Promise<AnchorReport> {
  const anchors = ctx.db.prepare('SELECT * FROM audit_anchors ORDER BY id').all() as AnchorRow[];
  const problems: string[] = [];
  const warnings: string[] = [];
  const coverage: AnchorReport['coverage'] = new Map();
  let prev = ANCHOR_GENESIS;
  let stamped = 0;
  let unverifiedChain = 0;
  let lastTsaCert: string | null = null;
  const leafStmt = ctx.db.prepare('SELECT idx, envelope_id, seq, head FROM audit_anchor_leaves WHERE anchor_id = ? ORDER BY idx');
  const evStmt = ctx.db.prepare('SELECT hash FROM audit_events WHERE envelope_id = ? AND seq = ?');
  const envExists = ctx.db.prepare('SELECT 1 FROM envelopes WHERE id = ?');
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (a.id !== i + 1) problems.push(`Anker ${a.id}: Lücke in der Ankerfolge (erwartet ${i + 1})`);
    if (a.prev_hash !== prev) problems.push(`Anker ${a.id}: Verkettung zum Vorgänger unterbrochen`);
    if (anchorHash(a) !== a.anchor_hash) problems.push(`Anker ${a.id}: Ankerdaten verändert`);
    const leaves = leafStmt.all(a.id) as { idx: number; envelope_id: string; seq: number; head: string }[];
    if (leaves.length !== a.leaves) problems.push(`Anker ${a.id}: Anzahl der Einträge stimmt nicht`);
    if (merkleRoot(leaves.map((l) => leafHash(l.envelope_id, l.seq, l.head))).toString('hex') !== a.root) problems.push(`Anker ${a.id}: Merkle-Wurzel stimmt nicht`);
    let externalTime: string | null = null;
    if (a.tsa_token) {
      try {
        const info = await verifyAnchorToken(a);
        if (info.chainTrusted === false) throw new Error(`Aussteller ${info.tsaSubject} gehört nicht zu den Vertrauensankern (TSA_CA_FILE)`);
        if (lastTsaCert && lastTsaCert !== info.tsaCertSha256) warnings.push(`Anker ${a.id}: anderes Zertifikat des Zeitstempeldienstes als beim vorherigen Anker (${info.tsaSubject}) – Zertifikatswechsel des Anbieters oder Fälschung prüfen`);
        lastTsaCert = info.tsaCertSha256;
        if (info.chainTrusted) {
          externalTime = info.genTime;
          stamped++;
        } else unverifiedChain++;
        if (Math.abs(new Date(info.genTime).getTime() - new Date(a.created_at).getTime()) > STAMP_TOLERANCE_MS ) {
          // Nachgeholter Zeitstempel ist zulässig, die externe Zeit gilt dann ab genTime
          warnings.push(`Anker ${a.id}: Zeitstempel ${info.genTime} weicht deutlich von der Erstellung ${a.created_at} ab (nachgeholt?)`);
        }
      } catch (e: any) {
        problems.push(`Anker ${a.id}: Zeitstempel ungültig – ${e.message}`);
      }
    }
    for (const l of leaves) {
      if (opts.envelopeId && l.envelope_id !== opts.envelopeId) continue;
      const ev = evStmt.get(l.envelope_id, l.seq) as { hash: string } | undefined;
      if (!ev) {
        problems.push(envExists.get(l.envelope_id) ? `Vorgang ${l.envelope_id}: verankerter Eintrag ${l.seq} fehlt` : `Vorgang ${l.envelope_id}: verankert, aber gelöscht`);
        continue;
      }
      if (ev.hash !== l.head) problems.push(`Vorgang ${l.envelope_id}: Eintrag ${l.seq} weicht vom verankerten Stand ab (nachträglich verändert)`);
      const list = coverage.get(l.envelope_id) ?? [];
      list.push({ seq: l.seq, anchorId: a.id, externalTime });
      coverage.set(l.envelope_id, list);
    }
    prev = a.anchor_hash;
  }
  if (unverifiedChain) warnings.push(`${unverifiedChain} Anker mit Zeitstempel, dessen Aussteller nicht gegen einen Vertrauensanker geprüft ist (TSA_CA_FILE fehlt). Jemand mit Serverzugriff könnte solche Zeitstempel selbst erzeugen – für den Nachweis TSA_CA_FILE einrichten.`);
  return { ok: problems.length === 0, anchors: anchors.length, stamped, stampedUnverifiedChain: unverifiedChain, unstamped: anchors.length - stamped - unverifiedChain, problems, warnings, envelopes: coverage.size, coverage };
}

/**
 * Bewertet einen Vorgang: Kette intakt? Bis wohin verankert? Liegen Ereignisse deutlich vor ihrer
 * ersten externen Bestätigung (Hinweis auf Rückdatierung)?
 */
export async function envelopeAnchoring(ctx: Ctx, envelopeId: string) {
  const events = listAudit(ctx.db, envelopeId);
  const chain = verifyChain(envelopeId, events);
  const rep = await verifyAnchors(ctx, { envelopeId });
  const cov = (rep.coverage.get(envelopeId) ?? []).sort((a, b) => a.seq - b.seq);
  const ownProblems = rep.problems.filter((p) => p.includes(envelopeId) || p.startsWith('Anker'));
  const lastAnchored = cov.at(-1)?.seq ?? 0;
  const lastExternal = [...cov].reverse().find((c) => c.externalTime);
  // Für jedes Ereignis die erste externe Bestätigung bestimmen (ein Kettenkopf bestätigt alle früheren Einträge)
  let maxDelayMs = 0;
  for (const e of events) {
    const first = cov.find((c) => c.seq >= e.seq && c.externalTime);
    if (first) maxDelayMs = Math.max(maxDelayMs, new Date(first.externalTime!).getTime() - new Date(e.ts).getTime());
  }
  return {
    chain_ok: chain.ok,
    events: chain.count,
    anchored_until_seq: lastAnchored,
    externally_stamped_until_seq: lastExternal?.seq ?? 0,
    externally_stamped_at: lastExternal?.externalTime ?? null,
    max_anchor_delay_hours: Math.round((maxDelayMs / 3600_000) * 10) / 10,
    problems: ownProblems,
    tsa_configured: !!ctx.cfg.tsaUrl,
  };
}

/** Nachweis für das Nachweispaket: alle bisherigen Anker eines Vorgangs mit Prüfpfad und Zeitstempel. */
export function anchorEvidence(ctx: Ctx, envelopeId: string) {
  const rows = ctx.db.prepare('SELECT DISTINCT anchor_id FROM audit_anchor_leaves WHERE envelope_id = ? ORDER BY anchor_id').all(envelopeId) as { anchor_id: number }[];
  return rows.map(({ anchor_id }) => {
    const a = ctx.db.prepare('SELECT * FROM audit_anchors WHERE id = ?').get(anchor_id) as AnchorRow;
    const leaves = ctx.db.prepare('SELECT idx, envelope_id, seq, head FROM audit_anchor_leaves WHERE anchor_id = ? ORDER BY idx').all(anchor_id) as any[];
    const mine = leaves.find((l) => l.envelope_id === envelopeId)!;
    const proof = inclusionProof(leaves.map((l) => leafHash(l.envelope_id, l.seq, l.head)), mine.idx);
    return {
      anchor: { id: a.id, created_at: a.created_at, prev_hash: a.prev_hash, root: a.root, leaves: a.leaves, anchor_hash: a.anchor_hash },
      leaf: { index: mine.idx, envelope_id: envelopeId, seq: mine.seq, head: mine.head },
      proof: proof.map((p) => p.toString('hex')),
      timestamp: a.tsa_token ? { genTime: a.tsa_time, token_der_base64: a.tsa_token.toString('base64') } : null,
    };
  });
}

registerJob('audit_anchor', async (ctx) => {
  await createAnchor(ctx);
  await stampPending(ctx);
});
