// Vorgänge (Envelopes): Entwurf, Dokumente, Empfänger, Felder, Versand, Widerruf.
// Zustandsübergänge werden ausschließlich hier und in signing.ts serverseitig validiert.
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { id, secretToken, hashToken } from '../lib/crypto.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { appendAudit } from './audit.js';
import { actorOf, assertEnvelopeAccess, require as requirePerm, seesAllEnvelopes, type Principal } from './authz.js';
import { getOrg, orgBaseUrl } from './orgs.js';
import { inspectAndNormalize } from '../pdf/inspect.js';
import { clampRect } from '../pdf/geometry.js';
import { FIELD_TYPES, RECIPIENT_KINDS, AUTH_METHODS, RECIPIENT_COLORS, type PageInfo } from '../../shared/model.js';
import { suggestRules, needsAck, ruleById } from '../../shared/formrules.js';
import { isSafePattern } from '../../shared/fieldlogic.js';
import { referencedFields } from '../../shared/formula.js';
import { queueMail } from './mail.js';
import { emit } from './webhooks.js';
import { hashSecret } from './secrets.js';
import { convertOffice, isOfficeFile } from './convert.js';

export interface EnvelopeRow {
  id: string;
  org_id: string;
  owner_id: string | null;
  api_key_id: string | null;
  title: string;
  message: string;
  status: 'draft' | 'sent' | 'completed' | 'declined' | 'voided' | 'expired';
  test_mode: number;
  signing_order: 'parallel' | 'sequential';
  template_version_id: string | null;
  form_classes: string;
  form_ack_by: string | null;
  form_ack_at: string | null;
  signature_level: 'ses' | 'qes';
  locale: 'de' | 'en';
  expires_at: string | null;
  reminder_days: number;
  allow_delegation: number;
  metadata: string;
  external_ref: string | null;
  public_form_id: string | null;
  notify: number;
  void_reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  completed_at: string | null;
  finished_at: string | null;
}

export function envRow(ctx: Ctx, envelopeId: string): EnvelopeRow | undefined {
  return ctx.db.prepare('SELECT * FROM envelopes WHERE id = ?').get(envelopeId) as EnvelopeRow | undefined;
}

export function loadEnvelope(ctx: Ctx, p: Principal, envelopeId: string, write = false): EnvelopeRow {
  const env = envRow(ctx, envelopeId);
  const org = getOrg(ctx, p.orgId);
  assertEnvelopeAccess(p, env, org.settings.envelopeVisibility, write);
  return env!;
}

function assertDraft(env: EnvelopeRow) {
  if (env.status !== 'draft') throw conflict('not_draft', 'Der Vorgang wurde bereits versendet und kann nicht mehr geändert werden.');
}

function touch(ctx: Ctx, envelopeId: string) {
  ctx.db.prepare('UPDATE envelopes SET updated_at = ?, revision = revision + 1 WHERE id = ?').run(ctx.now().toISOString(), envelopeId);
}

// ───────────────────────────── Serialisierung ─────────────────────────────

export function documentsOf(ctx: Ctx, envelopeId: string) {
  return (ctx.db.prepare('SELECT * FROM envelope_documents WHERE envelope_id = ? ORDER BY position').all(envelopeId) as any[]).map((d) => ({
    ...d,
    pages: JSON.parse(d.pages) as PageInfo[],
    warnings: JSON.parse(d.warnings) as string[],
  }));
}

export function recipientsOf(ctx: Ctx, envelopeId: string) {
  return ctx.db.prepare('SELECT * FROM recipients WHERE envelope_id = ? ORDER BY routing_order, created_at').all(envelopeId) as any[];
}

export function fieldsOf(ctx: Ctx, envelopeId: string) {
  return (ctx.db.prepare('SELECT * FROM fields WHERE envelope_id = ? ORDER BY page, y, x').all(envelopeId) as any[]).map((f) => ({
    ...f,
    required: !!f.required,
    config: JSON.parse(f.config),
  }));
}

export function serializeEnvelope(ctx: Ctx, env: EnvelopeRow, opts: { withFields?: boolean } = {}) {
  const docs = documentsOf(ctx, env.id);
  const recs = recipientsOf(ctx, env.id);
  const result = ctx.db.prepare('SELECT * FROM envelope_results WHERE envelope_id = ?').get(env.id) as any;
  const owner = env.owner_id ? (ctx.db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(env.owner_id) as any) : null;
  const formClasses = JSON.parse(env.form_classes) as string[];
  return {
    id: env.id,
    title: env.title,
    message: env.message,
    status: env.status,
    test_mode: !!env.test_mode,
    signing_order: env.signing_order,
    signature_level: env.signature_level,
    notify: env.notify !== 0,
    locale: env.locale,
    expires_at: env.expires_at,
    reminder_days: env.reminder_days,
    allow_delegation: !!env.allow_delegation,
    metadata: JSON.parse(env.metadata),
    external_ref: env.external_ref,
    template_version_id: env.template_version_id,
    form_classes: formClasses,
    form_ack: env.form_ack_at ? { by: env.form_ack_by, at: env.form_ack_at } : null,
    void_reason: env.void_reason,
    owner,
    created_via: env.api_key_id ? 'api' : env.public_form_id ? 'public_form' : 'app',
    created_at: env.created_at,
    updated_at: env.updated_at,
    sent_at: env.sent_at,
    completed_at: env.completed_at,
    finished_at: env.finished_at,
    revision: env.revision,
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      position: d.position,
      source_kind: d.source_kind,
      source_sha256: d.source_sha256,
      sha256: d.sha256,
      page_count: d.pages.length,
      pages: d.pages,
      warnings: d.warnings,
    })),
    recipients: recs.map((r) => ({
      id: r.id,
      role: r.role,
      kind: r.kind,
      name: r.name,
      email: r.email,
      phone: r.phone,
      routing_order: r.routing_order,
      status: r.status,
      auth_method: r.auth_method,
      color: RECIPIENT_COLORS[r.color % RECIPIENT_COLORS.length],
      delegated_from: r.delegated_from,
      witness_for: r.witness_for,
      sent_at: r.sent_at,
      opened_at: r.opened_at,
      completed_at: r.completed_at,
      declined_at: r.declined_at,
      decline_reason: r.decline_reason,
    })),
    fields: opts.withFields !== false ? fieldsOf(ctx, env.id).map(serializeField) : undefined,
    result: result
      ? {
          final_sha256: result.final_sha256,
          certificate_sha256: result.certificate_sha256,
          audit_sha256: result.audit_sha256,
          evidence_sha256: result.evidence_sha256,
          seal: JSON.parse(result.seal_info),
          created_at: result.created_at,
        }
      : null,
  };
}

export function serializeField(f: any) {
  return {
    id: f.id,
    key: f.key,
    type: f.type,
    document_id: f.document_id,
    recipient_id: f.recipient_id,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    required: !!f.required,
    label: f.label,
    config: f.config,
    value: f.type === 'signature' || f.type === 'initials' ? (f.value ? 'signed' : null) : f.value,
    filled_at: f.filled_at,
  };
}

// ───────────────────────────── Liste ─────────────────────────────

export function listEnvelopes(ctx: Ctx, p: Principal, q: { status?: string; search?: string; limit?: number; before?: string; test?: boolean; external_ref?: string }) {
  requirePerm(p, 'envelope.read');
  const org = getOrg(ctx, p.orgId);
  const where = ['e.org_id = ?'];
  const args: any[] = [p.orgId];
  const test = p.kind === 'apikey' ? p.mode === 'test' : !!q.test;
  where.push('e.test_mode = ?');
  args.push(test ? 1 : 0);
  if (!seesAllEnvelopes(p, org.settings.envelopeVisibility) && p.kind === 'user') {
    where.push('e.owner_id = ?');
    args.push(p.userId);
  }
  if (q.status) {
    const st = q.status.split(',').filter((s) => ['draft', 'sent', 'completed', 'declined', 'voided', 'expired'].includes(s));
    if (st.length) {
      where.push(`e.status IN (${st.map(() => '?').join(',')})`);
      args.push(...st);
    }
  }
  if (q.external_ref) {
    where.push('e.external_ref = ?');
    args.push(q.external_ref);
  }
  if (q.search) {
    where.push(`(e.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM recipients r WHERE r.envelope_id = e.id AND (r.name LIKE ? ESCAPE '\\' OR r.email LIKE ? ESCAPE '\\')))`);
    const s = '%' + q.search.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    args.push(s, s, s);
  }
  if (q.before) {
    where.push('e.updated_at < ?');
    args.push(q.before);
  }
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const rows = ctx.db.prepare(`SELECT e.* FROM envelopes e WHERE ${where.join(' AND ')} ORDER BY e.updated_at DESC LIMIT ?`).all(...args, limit) as EnvelopeRow[];
  return rows.map((r) => {
    const recs = recipientsOf(ctx, r.id);
    const docs = ctx.db.prepare('SELECT COUNT(*) AS n, SUM(json_array_length(pages)) AS p FROM envelope_documents WHERE envelope_id = ?').get(r.id) as any;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      test_mode: !!r.test_mode,
      external_ref: r.external_ref,
      created_at: r.created_at,
      updated_at: r.updated_at,
      sent_at: r.sent_at,
      completed_at: r.completed_at,
      expires_at: r.expires_at,
      document_count: docs.n,
      page_count: docs.p ?? 0,
      recipients: recs.map((x) => ({ id: x.id, name: x.name, email: x.email, kind: x.kind, status: x.status, routing_order: x.routing_order, color: RECIPIENT_COLORS[x.color % RECIPIENT_COLORS.length] })),
    };
  });
}

// ───────────────────────────── Anlegen und Bearbeiten ─────────────────────────────

export const EnvelopeInput = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().max(4000).optional(),
  signing_order: z.enum(['parallel', 'sequential']).optional(),
  signature_level: z.enum(['ses', 'qes']).optional(),
  locale: z.enum(['de', 'en']).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  reminder_days: z.number().int().min(0).max(30).optional(),
  allow_delegation: z.boolean().optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
  external_ref: z.string().max(200).nullable().optional(),
  form_classes: z.array(z.string().max(60)).max(20).optional(),
});
export type EnvelopeInputT = z.infer<typeof EnvelopeInput>;

export function createEnvelope(ctx: Ctx, p: Principal, input: EnvelopeInputT, extra: { templateVersionId?: string; publicFormId?: string; testMode?: boolean } = {}) {
  requirePerm(p, 'envelope.write');
  const org = getOrg(ctx, p.orgId);
  const now = ctx.now();
  const envId = id('env');
  const testMode = p.kind === 'apikey' ? p.mode === 'test' : !!extra.testMode;
  const expires = input.expires_at ?? new Date(now.getTime() + (input.expires_in_days ?? org.settings.defaultExpiryDays) * 86400_000).toISOString();
  if (input.metadata && JSON.stringify(input.metadata).length > 8000) throw badRequest('metadata_too_large', 'Metadaten zu groß');
  tx(ctx.db, () => {
    ctx.db
      .prepare(
        `INSERT INTO envelopes (id, org_id, owner_id, api_key_id, title, message, status, test_mode, signing_order, template_version_id, form_classes,
         signature_level, locale, expires_at, reminder_days, allow_delegation, metadata, external_ref, public_form_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        envId,
        p.orgId,
        p.kind === 'user' ? p.userId : p.createdBy,
        p.kind === 'apikey' ? p.keyId : null,
        input.title,
        input.message ?? '',
        testMode ? 1 : 0,
        input.signing_order ?? 'parallel',
        extra.templateVersionId ?? null,
        JSON.stringify(input.form_classes ?? []),
        input.signature_level ?? 'ses',
        input.locale ?? org.settings.locale,
        expires,
        input.reminder_days ?? org.settings.defaultReminderDays,
        input.allow_delegation ? 1 : 0,
        JSON.stringify(input.metadata ?? {}),
        input.external_ref ?? null,
        extra.publicFormId ?? null,
        now.toISOString(),
        now.toISOString(),
      );
    appendAudit(ctx.db, envId, p.orgId, 'envelope.created', actorOf(p), { title: input.title, test_mode: testMode, template_version_id: extra.templateVersionId ?? null });
  });
  return envRow(ctx, envId)!;
}

export function updateEnvelope(ctx: Ctx, p: Principal, envelopeId: string, patch: Partial<EnvelopeInputT>) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  const sets: string[] = [];
  const args: any[] = [];
  const map: Record<string, (v: any) => any> = {
    title: (v) => v,
    message: (v) => v,
    signing_order: (v) => v,
    signature_level: (v) => v,
    locale: (v) => v,
    expires_at: (v) => v,
    reminder_days: (v) => v,
    allow_delegation: (v) => (v ? 1 : 0),
    metadata: (v) => JSON.stringify(v),
    external_ref: (v) => v,
    form_classes: (v) => JSON.stringify(v),
  };
  for (const [k, fn] of Object.entries(map)) {
    if ((patch as any)[k] !== undefined) {
      sets.push(`${k} = ?`);
      args.push(fn((patch as any)[k]));
    }
  }
  if (patch.expires_in_days) {
    sets.push('expires_at = ?');
    args.push(new Date(ctx.now().getTime() + patch.expires_in_days * 86400_000).toISOString());
  }
  if (patch.form_classes) {
    // Geänderte Klassifizierung → frühere Bestätigung verfällt
    sets.push('form_ack_by = NULL', 'form_ack_at = NULL');
  }
  if (!sets.length) return env;
  tx(ctx.db, () => {
    ctx.db.prepare(`UPDATE envelopes SET ${sets.join(', ')} WHERE id = ? AND status = 'draft'`).run(...args, envelopeId);
    touch(ctx, envelopeId);
  });
  if (patch.signing_order) resequence(ctx, envelopeId);
  return envRow(ctx, envelopeId)!;
}

export async function addDocument(ctx: Ctx, p: Principal, envelopeId: string, file: { name: string; bytes: Buffer; mime?: string }) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  const count = (ctx.db.prepare('SELECT COUNT(*) AS n FROM envelope_documents WHERE envelope_id = ?').get(envelopeId) as any).n;
  if (count >= 20) throw badRequest('too_many_documents', 'Höchstens 20 Dokumente je Vorgang.');
  const stored = await storeDocument(ctx, p.orgId, file);
  const docId = id('doc');
  tx(ctx.db, () => {
    const e = envRow(ctx, envelopeId)!;
    assertDraft(e);
    ctx.db
      .prepare(
        `INSERT INTO envelope_documents (id, envelope_id, position, name, source_blob_id, source_sha256, source_kind, blob_id, sha256, pages, warnings, text_excerpt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(docId, envelopeId, count, stored.name, stored.source.id, stored.source.sha256, stored.kind, stored.pdf.id, stored.pdf.sha256, JSON.stringify(stored.pages), JSON.stringify(stored.warnings), stored.text.slice(0, 40000), ctx.now().toISOString());
    // Formklassifizierung: Vorschläge ergänzen, nie stillschweigend entfernen
    const current = new Set(JSON.parse(e.form_classes) as string[]);
    const suggestions = suggestRules(e.title + '\n' + stored.text);
    appendAudit(ctx.db, envelopeId, p.orgId, 'document.added', actorOf(p), {
      document_id: docId,
      name: stored.name,
      source_kind: stored.kind,
      source_sha256: stored.source.sha256,
      sha256: stored.pdf.sha256,
      pages: stored.pages.length,
      warnings: stored.warnings,
    });
    touch(ctx, envelopeId);
    return { current, suggestions };
  });
  return { id: docId, ...stored, suggestions: suggestRules(env.title + '\n' + stored.text) };
}

export async function storeDocument(ctx: Ctx, orgId: string, file: { name: string; bytes: Buffer; mime?: string }) {
  if (file.bytes.length > ctx.cfg.maxUploadBytes) throw new AppError(413, 'file_too_large', `Datei zu groß (max. ${Math.round(ctx.cfg.maxUploadBytes / 1048576)} MB).`);
  if (file.bytes.length === 0) throw badRequest('file_empty', 'Die Datei ist leer.');
  const name = (file.name || 'Dokument').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').trim().slice(0, 180) || 'Dokument';
  let pdfBytes = file.bytes;
  let kind = 'pdf';
  if (isOfficeFile(name, file.bytes)) {
    kind = name.toLowerCase().split('.').pop() ?? 'office';
    pdfBytes = await convertOffice(ctx, name, file.bytes);
  }
  const inspected = await inspectAndNormalize(pdfBytes, ctx.cfg.maxPages);
  const source = await ctx.blobs.put(file.bytes, { orgId, mime: kind === 'pdf' ? 'application/pdf' : 'application/octet-stream', kind: 'source' });
  const pdf = await ctx.blobs.put(inspected.bytes, { orgId, mime: 'application/pdf', kind: 'document' });
  return {
    name: name.replace(/\.(pdf|docx?|odt|rtf)$/i, ''),
    kind,
    source,
    pdf,
    pages: inspected.pages,
    warnings: inspected.warnings,
    text: inspected.text.join('\n'),
    textItems: inspected.textItems,
  };
}

export function removeDocument(ctx: Ctx, p: Principal, envelopeId: string, docId: string) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  tx(ctx.db, () => {
    const d = ctx.db.prepare('SELECT * FROM envelope_documents WHERE id = ? AND envelope_id = ?').get(docId, envelopeId) as any;
    if (!d) throw notFound('Dokument nicht gefunden');
    ctx.db.prepare('DELETE FROM envelope_documents WHERE id = ?').run(docId);
    const rest = ctx.db.prepare('SELECT id FROM envelope_documents WHERE envelope_id = ? ORDER BY position').all(envelopeId) as any[];
    rest.forEach((r, i) => ctx.db.prepare('UPDATE envelope_documents SET position = ? WHERE id = ?').run(i, r.id));
    appendAudit(ctx.db, envelopeId, env.org_id, 'document.removed', actorOf(p), { document_id: docId, name: d.name, sha256: d.sha256 });
    touch(ctx, envelopeId);
  });
}

export const RecipientInput = z.object({
  id: z.string().max(80).optional(),
  ref: z.string().max(80).optional(),
  role: z.string().max(80).optional(),
  kind: z.enum(RECIPIENT_KINDS).default('signer'),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).regex(/^\+?[0-9 ()/-]{6,40}$/).nullable().optional(),
  routing_order: z.number().int().min(1).max(50).optional(),
  auth_method: z.enum(AUTH_METHODS).default('none'),
  access_code: z.string().min(4).max(64).optional(),
  witness_for: z.string().max(80).nullable().optional(),
});
export type RecipientInputT = z.infer<typeof RecipientInput>;

/** Ersetzt die Empfängerliste eines Entwurfs. Bestehende IDs bleiben erhalten (Felder hängen daran). */
export function replaceRecipients(ctx: Ctx, p: Principal, envelopeId: string, list: RecipientInputT[]) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  if (list.length > 30) throw badRequest('too_many_recipients', 'Höchstens 30 Empfänger je Vorgang.');
  const refMap: Record<string, string> = {};
  tx(ctx.db, () => {
    const existing = new Map((ctx.db.prepare('SELECT * FROM recipients WHERE envelope_id = ?').all(envelopeId) as any[]).map((r) => [r.id, r]));
    const keep = new Set<string>();
    list.forEach((r, i) => {
      if (r.auth_method === 'sms_otp' && !r.phone) throw badRequest('phone_required', `Für ${r.name} ist eine Mobilnummer für den SMS-Code nötig.`);
      if (r.auth_method === 'sms_otp' && !ctx.cfg.sms) throw badRequest('sms_unavailable', 'SMS-Versand ist nicht eingerichtet (SMS_GATEWAY_URL).');
      if (r.auth_method === 'access_code' && !r.access_code && !(r.id && existing.get(r.id)?.access_code_hash)) {
        throw badRequest('access_code_required', `Für ${r.name} fehlt der Zugangscode.`);
      }
      const order = env.signing_order === 'sequential' ? (r.routing_order ?? i + 1) : (r.routing_order ?? 1);
      const prev = r.id ? existing.get(r.id) : undefined;
      const rid = prev ? prev.id : id('rcp');
      if (r.ref) refMap[r.ref] = rid;
      if (r.id) refMap[r.id] = rid;
      keep.add(rid);
      const codeHash = r.access_code ? hashSecret(r.access_code) : prev?.access_code_hash ?? null;
      if (prev) {
        ctx.db
          .prepare(`UPDATE recipients SET role = ?, kind = ?, name = ?, email = ?, phone = ?, routing_order = ?, auth_method = ?, access_code_hash = ?, color = ? WHERE id = ?`)
          .run(r.role ?? '', r.kind, r.name, r.email, r.phone ?? null, order, r.auth_method, codeHash, i, rid);
      } else {
        ctx.db
          .prepare(
            `INSERT INTO recipients (id, envelope_id, role, kind, name, email, phone, routing_order, status, auth_method, access_code_hash, color, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
          )
          .run(rid, envelopeId, r.role ?? '', r.kind, r.name, r.email, r.phone ?? null, order, r.auth_method, codeHash, i, new Date(ctx.now().getTime() + i).toISOString());
      }
    });
    // Zeugen-Verweise auflösen
    list.forEach((r, i) => {
      if (r.kind === 'witness' && r.witness_for) {
        const target = refMap[r.witness_for];
        if (!target) throw badRequest('witness_target', `Zeuge ${r.name}: unbekannter Bezug.`);
        const rid = [...keep][i];
        ctx.db.prepare('UPDATE recipients SET witness_for = ? WHERE id = ?').run(target, rid);
      }
    });
    for (const [rid] of existing) if (!keep.has(rid)) ctx.db.prepare('DELETE FROM recipients WHERE id = ?').run(rid);
    appendAudit(ctx.db, envelopeId, env.org_id, 'recipients.updated', actorOf(p), {
      recipients: list.map((r) => ({ name: r.name, email: r.email, kind: r.kind, auth_method: r.auth_method })),
    });
    touch(ctx, envelopeId);
  });
  return { recipients: recipientsOf(ctx, envelopeId), refs: refMap };
}

function resequence(ctx: Ctx, envelopeId: string) {
  const env = envRow(ctx, envelopeId)!;
  const recs = recipientsOf(ctx, envelopeId).sort((a, b) => a.color - b.color);
  recs.forEach((r, i) => ctx.db.prepare('UPDATE recipients SET routing_order = ? WHERE id = ?').run(env.signing_order === 'sequential' ? i + 1 : 1, r.id));
}

export const FieldInput = z.object({
  id: z.string().max(80).optional(),
  key: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
  type: z.enum(FIELD_TYPES),
  document: z.union([z.string().max(80), z.number().int().min(0)]),
  recipient: z.string().max(254),
  page: z.number().int().min(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.002).max(1),
  h: z.number().min(0.002).max(1),
  required: z.boolean().default(true),
  label: z.string().max(200).default(''),
  value: z.string().max(5000).optional(),
  config: z
    .object({
      placeholder: z.string().max(200).optional(),
      options: z.array(z.string().max(200)).max(100).optional(),
      validation: z
        .object({
          preset: z.enum(['email', 'iban', 'plz', 'phone', 'number', 'integer', 'regex']).optional(),
          pattern: z.string().max(200).optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          minLength: z.number().int().min(0).max(5000).optional(),
          maxLength: z.number().int().min(1).max(5000).optional(),
          message: z.string().max(200).optional(),
        })
        .optional(),
      condition: z
        .object({ field: z.string().max(64), op: z.enum(['checked', 'unchecked', 'equals', 'not_equals', 'filled', 'empty']), value: z.string().max(200).optional() })
        .optional(),
      formula: z.string().max(500).optional(),
      decimals: z.number().int().min(0).max(6).optional(),
      prefill: z.string().max(5000).optional(),
      readonly: z.boolean().optional(),
      fontSize: z.number().min(5).max(36).optional(),
      dateFormat: z.enum(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']).optional(),
      accept: z.array(z.string().max(100)).max(10).optional(),
    })
    .default({}),
});
export type FieldInputT = z.infer<typeof FieldInput>;

export function replaceFields(ctx: Ctx, p: Principal, envelopeId: string, list: FieldInputT[]) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  if (list.length > 1000) throw badRequest('too_many_fields', 'Höchstens 1000 Felder je Vorgang.');
  const docs = documentsOf(ctx, envelopeId);
  const recs = recipientsOf(ctx, envelopeId);
  const used = new Set<string>();
  const rows = list.map((f, i) => {
    const doc = typeof f.document === 'number' ? docs[f.document] : docs.find((d) => d.id === f.document);
    if (!doc) throw badRequest('field_document', `Feld ${i + 1}: Dokument nicht gefunden.`);
    if (f.page >= doc.pages.length) throw badRequest('field_page', `Feld ${i + 1}: Seite ${f.page + 1} existiert nicht.`);
    const rec = recs.find((r) => r.id === f.recipient) ?? recs.find((r) => r.role && r.role === f.recipient) ?? recs.find((r) => r.email === f.recipient.toLowerCase());
    if (!rec) throw badRequest('field_recipient', `Feld ${i + 1}: Empfänger „${f.recipient}“ nicht gefunden.`);
    if (rec.kind === 'viewer') throw badRequest('field_viewer', `Feld ${i + 1}: Empfänger mit Leserecht können keine Felder ausfüllen.`);
    if ((f.type === 'signature' || f.type === 'initials') && rec.kind === 'filler') throw badRequest('field_filler', `Feld ${i + 1}: Ausfüllende Personen unterschreiben nicht.`);
    let key = f.key ?? `${f.type}_${i + 1}`;
    while (used.has(key)) key = `${key}_${i}`;
    used.add(key);
    if (f.type === 'select' && !(f.config.options?.length)) throw badRequest('field_options', `Feld „${f.label || key}“: Auswahlfeld ohne Optionen.`);
    if (f.config.validation?.preset === 'regex' && (!f.config.validation.pattern || !isSafePattern(f.config.validation.pattern))) {
      throw badRequest('field_pattern', `Feld „${f.label || key}“: Das Prüfmuster ist ungültig oder zu komplex.`);
    }
    if (f.type === 'formula') {
      if (!f.config.formula) throw badRequest('field_formula', `Feld „${f.label || key}“: Formel fehlt.`);
      try {
        referencedFields(f.config.formula);
      } catch (e: any) {
        throw badRequest('field_formula', `Feld „${f.label || key}“: ${e.message}`);
      }
    }
    const r = clampRect(f);
    return { f: { ...f, ...r }, key, doc, rec };
  });
  // Bedingungen und Formeln dürfen nur auf existierende Felder verweisen
  for (const { f, key } of rows) {
    if (f.config.condition && !used.has(f.config.condition.field)) throw badRequest('field_condition', `Feld „${f.label || key}“: Bedingung verweist auf unbekanntes Feld.`);
    if (f.config.formula) for (const ref of referencedFields(f.config.formula)) if (!used.has(ref)) throw badRequest('field_formula', `Feld „${f.label || key}“: Formel verweist auf unbekanntes Feld {${ref}}.`);
  }
  tx(ctx.db, () => {
    ctx.db.prepare('DELETE FROM fields WHERE envelope_id = ?').run(envelopeId);
    const ins = ctx.db.prepare(
      `INSERT INTO fields (id, envelope_id, document_id, recipient_id, key, type, page, x, y, w, h, required, label, config, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const { f, key, doc, rec } of rows) {
      const prefill = f.value ?? f.config.prefill ?? null;
      ins.run(f.id && f.id.startsWith('fld_') ? f.id : id('fld'), envelopeId, doc.id, rec.id, key, f.type, f.page, f.x, f.y, f.w, f.h, f.required ? 1 : 0, f.label, JSON.stringify(f.config), prefill);
    }
    touch(ctx, envelopeId);
  });
  return fieldsOf(ctx, envelopeId).map(serializeField);
}

// ───────────────────────────── Versand ─────────────────────────────

export function signingUrl(ctx: Ctx, orgId: string, token: string) {
  return `${orgBaseUrl(ctx, getOrg(ctx, orgId))}/s/${token}`;
}

function fmtDate(iso: string | null, locale: string, tz: string) {
  if (!iso) return locale === 'de' ? 'auf Weiteres' : 'further notice';
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
}

export function senderName(ctx: Ctx, env: EnvelopeRow) {
  const org = getOrg(ctx, env.org_id);
  const owner = env.owner_id ? (ctx.db.prepare('SELECT name FROM users WHERE id = ?').get(env.owner_id) as any) : null;
  return owner ? `${owner.name} (${org.name})` : org.name;
}

/** Aktiviert einen Empfänger: neuer Link-Token, Status „sent“, Benachrichtigung. Innerhalb einer Transaktion aufrufen. */
export function activateRecipient(ctx: Ctx, env: EnvelopeRow, rec: any, opts: { notify: boolean; actor: any }) {
  const token = secretToken();
  const now = ctx.now().toISOString();
  ctx.db.prepare(`UPDATE recipients SET status = 'sent', token_hash = ?, token_issued_at = ?, sent_at = ? WHERE id = ?`).run(hashToken(token), now, now, rec.id);
  const url = signingUrl(ctx, env.org_id, token);
  const org = getOrg(ctx, env.org_id);
  const willMail = opts.notify && !env.test_mode;
  if (opts.notify) {
    queueMail(ctx, {
      orgId: env.org_id,
      envelopeId: env.id,
      recipientId: rec.id,
      to: rec.email,
      kind: 'signing_request',
      locale: env.locale,
      link: url,
      suppress: !!env.test_mode,
      vars: { sender: senderName(ctx, env), title: env.title, recipient: rec.name, message: env.message, expires: fmtDate(env.expires_at, env.locale, org.settings.timezone) },
    });
  }
  appendAudit(ctx.db, env.id, env.org_id, 'recipient.notified', opts.actor, {
    recipient_id: rec.id,
    email: rec.email,
    channel: willMail ? 'email' : env.test_mode ? 'test_mode' : 'link_handover',
  });
  emit(ctx, env.org_id, 'recipient.notified', { envelope_id: env.id, recipient_id: rec.id, email: rec.email }, { testMode: !!env.test_mode });
  return url;
}

/** Ermittelt die als Nächstes zu aktivierenden Empfänger (kleinste offene Reihenfolge). */
export function nextRoutingGroup(recs: any[]) {
  const open = recs.filter((r) => r.kind !== 'viewer' && !['completed', 'declined', 'delegated', 'voided'].includes(r.status));
  if (open.length === 0) return { order: null as number | null, group: [] as any[] };
  const order = Math.min(...open.map((r) => r.routing_order));
  return { order, group: open.filter((r) => r.routing_order === order) };
}

export function validateForSend(ctx: Ctx, env: EnvelopeRow) {
  const problems: string[] = [];
  const docs = documentsOf(ctx, env.id);
  const recs = recipientsOf(ctx, env.id);
  const fields = fieldsOf(ctx, env.id);
  if (!docs.length) problems.push('Es ist noch kein Dokument hochgeladen.');
  const actors = recs.filter((r) => r.kind !== 'viewer');
  if (!actors.length) problems.push('Es fehlt mindestens eine Person, die unterschreibt oder freigibt.');
  for (const r of recs) {
    const mine = fields.filter((f) => f.recipient_id === r.id);
    if ((r.kind === 'signer' || r.kind === 'witness') && !mine.some((f) => f.type === 'signature')) problems.push(`${r.name} hat noch kein Unterschriftsfeld.`);
    if (r.kind === 'filler' && mine.length === 0) problems.push(`${r.name} hat keine Felder zum Ausfüllen.`);
  }
  if (env.expires_at && new Date(env.expires_at) <= ctx.now()) problems.push('Das Ablaufdatum liegt in der Vergangenheit.');
  if (env.signature_level === 'qes') problems.push('Qualifizierte Signaturen benötigen einen angebundenen QES-Anbieter. Diese Instanz hat keinen eingerichtet.');
  const pending = needsAck(JSON.parse(env.form_classes), env.signature_level);
  return { problems, formWarnings: pending, docs, recs, fields };
}

export function sendEnvelope(ctx: Ctx, p: Principal, envelopeId: string, opts: { notify?: boolean; acknowledgeFormRisk?: boolean } = {}) {
  const env0 = loadEnvelope(ctx, p, envelopeId, true);
  const notify = opts.notify !== false;
  const links: { recipient_id: string; email: string; url: string }[] = [];
  tx(ctx.db, () => {
    const env = envRow(ctx, envelopeId)!;
    if (env.status !== 'draft') {
      // Idempotent: ein bereits versendeter Vorgang ist kein Fehler, aber es wird nichts erneut versendet
      if (env.status === 'sent') throw conflict('already_sent', 'Der Vorgang wurde bereits versendet.');
      throw conflict('not_draft', 'Der Vorgang kann nicht mehr versendet werden.');
    }
    const v = validateForSend(ctx, env);
    if (v.problems.length) throw new AppError(422, 'not_ready', v.problems.join(' '), { problems: v.problems });
    if (v.formWarnings.length && !opts.acknowledgeFormRisk && !env.form_ack_at) {
      throw new AppError(422, 'form_ack_required', 'Formhinweise müssen vor dem Versand ausdrücklich bestätigt werden.', {
        rules: v.formWarnings.map((r) => ({ id: r.id, norm: r.norm, label: r.label, hint: r.hint, min_level: r.minLevel })),
      });
    }
    const now = ctx.now().toISOString();
    if (v.formWarnings.length) {
      ctx.db.prepare('UPDATE envelopes SET form_ack_by = ?, form_ack_at = ? WHERE id = ?').run(p.kind === 'user' ? p.email : `api:${p.keyId}`, now, envelopeId);
      appendAudit(ctx.db, envelopeId, env.org_id, 'form.risk_acknowledged', actorOf(p), {
        rules: v.formWarnings.map((r) => ({ id: r.id, norm: r.norm, min_level: r.minLevel })),
        signature_level: env.signature_level,
      });
    }
    ctx.db.prepare(`UPDATE envelopes SET status = 'sent', sent_at = ?, updated_at = ?, notify = ?, revision = revision + 1 WHERE id = ? AND status = 'draft'`).run(now, now, notify ? 1 : 0, envelopeId);
    ctx.db.prepare(`UPDATE recipients SET status = 'waiting' WHERE envelope_id = ? AND kind != 'viewer'`).run(envelopeId);
    ctx.db.prepare(`UPDATE recipients SET status = 'created' WHERE envelope_id = ? AND kind = 'viewer'`).run(envelopeId);
    // Feldvorbelegungen gelten als Teil des Dokuments, nicht als Eingabe des Empfängers
    appendAudit(ctx.db, envelopeId, env.org_id, 'envelope.sent', actorOf(p), {
      documents: v.docs.map((d) => ({ id: d.id, name: d.name, sha256: d.sha256, source_sha256: d.source_sha256, pages: d.pages.length })),
      recipients: v.recs.map((r) => ({ id: r.id, name: r.name, email: r.email, kind: r.kind, routing_order: r.routing_order, auth_method: r.auth_method })),
      field_count: v.fields.length,
      signing_order: env.signing_order,
      signature_level: env.signature_level,
      expires_at: env.expires_at,
      form_classes: JSON.parse(env.form_classes),
      notify,
    });
    const sentEnv = envRow(ctx, envelopeId)!;
    const { group } = nextRoutingGroup(recipientsOf(ctx, envelopeId));
    for (const r of group) links.push({ recipient_id: r.id, email: r.email, url: activateRecipient(ctx, sentEnv, r, { notify, actor: actorOf(p) }) });
    // Kontakte für die Schnellauswahl merken (nur Name/E-Mail)
    if (!env.test_mode) {
      for (const r of v.recs) {
        ctx.db
          .prepare(
            `INSERT INTO contacts (id, org_id, name, email, phone, last_used_at, use_count, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
             ON CONFLICT(org_id, email) DO UPDATE SET name = excluded.name, phone = COALESCE(excluded.phone, contacts.phone), last_used_at = excluded.last_used_at, use_count = contacts.use_count + 1`,
          )
          .run(id('con'), env.org_id, r.name, r.email, r.phone, now, now);
      }
    }
    emit(ctx, env.org_id, 'envelope.sent', { envelope_id: envelopeId, title: env.title }, { testMode: !!env.test_mode });
  });
  void env0;
  // Links werden nur zurückgegeben, wenn Paraph keine E-Mails versendet (Übergabe an eigene Systeme) oder im Testmodus.
  const env = envRow(ctx, envelopeId)!;
  return { envelope: env, links: !notify || env.test_mode ? links : [] };
}

export function voidEnvelope(ctx: Ctx, p: Principal, envelopeId: string, reason: string) {
  loadEnvelope(ctx, p, envelopeId, true);
  tx(ctx.db, () => {
    const env = envRow(ctx, envelopeId)!;
    if (env.status !== 'sent') throw conflict('not_active', 'Nur laufende Vorgänge können widerrufen werden.');
    const now = ctx.now().toISOString();
    const r = ctx.db.prepare(`UPDATE envelopes SET status = 'voided', void_reason = ?, finished_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status = 'sent'`).run(reason.slice(0, 1000), now, now, envelopeId);
    if (r.changes !== 1) throw conflict('not_active', 'Der Vorgang wurde inzwischen abgeschlossen.');
    const recs = recipientsOf(ctx, envelopeId);
    ctx.db.prepare(`UPDATE recipients SET token_hash = NULL, status = CASE WHEN status IN ('completed','declined','delegated') THEN status ELSE 'voided' END WHERE envelope_id = ?`).run(envelopeId);
    ctx.db.prepare(`DELETE FROM signer_sessions WHERE recipient_id IN (SELECT id FROM recipients WHERE envelope_id = ?)`).run(envelopeId);
    appendAudit(ctx.db, envelopeId, env.org_id, 'envelope.voided', actorOf(p), { reason });
    for (const rec of recs.filter((x) => x.sent_at)) {
      queueMail(ctx, { orgId: env.org_id, envelopeId, recipientId: rec.id, to: rec.email, kind: 'voided', locale: env.locale, suppress: !!env.test_mode, vars: { sender: senderName(ctx, env), title: env.title, recipient: rec.name, reason } });
    }
    emit(ctx, env.org_id, 'envelope.voided', { envelope_id: envelopeId, reason }, { testMode: !!env.test_mode });
  });
}

export function remindRecipient(ctx: Ctx, p: Principal | null, envelopeId: string, recipientId: string, opts: { rotate?: boolean } = {}) {
  const env = p ? loadEnvelope(ctx, p, envelopeId, true) : envRow(ctx, envelopeId)!;
  return tx(ctx.db, () => {
    const e = envRow(ctx, env.id)!;
    if (e.status !== 'sent') throw conflict('not_active', 'Der Vorgang ist nicht mehr aktiv.');
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ? AND envelope_id = ?').get(recipientId, e.id) as any;
    if (!rec) throw notFound('Empfänger nicht gefunden');
    if (!['sent', 'opened'].includes(rec.status)) throw conflict('not_pending', 'Diese Person ist gerade nicht am Zug.');
    const org = getOrg(ctx, e.org_id);
    // Erinnerung erzeugt immer einen neuen Link: der alte wird ungültig (er stand ggf. in einer weitergeleiteten E-Mail)
    const token = secretToken();
    const now = ctx.now().toISOString();
    ctx.db.prepare('UPDATE recipients SET token_hash = ?, token_issued_at = ?, last_reminded_at = ? WHERE id = ?').run(hashToken(token), now, now, rec.id);
    const url = signingUrl(ctx, e.org_id, token);
    queueMail(ctx, {
      orgId: e.org_id,
      envelopeId: e.id,
      recipientId: rec.id,
      to: rec.email,
      kind: 'reminder',
      locale: e.locale,
      link: url,
      suppress: !!e.test_mode,
      vars: { sender: senderName(ctx, e), title: e.title, recipient: rec.name, expires: fmtDate(e.expires_at, e.locale, org.settings.timezone) },
    });
    appendAudit(ctx.db, e.id, e.org_id, 'recipient.reminded', p ? actorOf(p) : { type: 'system' }, { recipient_id: rec.id, email: rec.email, link_rotated: true });
    return { url: e.test_mode || opts.rotate ? url : undefined };
  });
}

/** Neuer Link ohne E-Mail (für Übergabe aus Fremdsystemen). Macht den bisherigen Link ungültig. */
export function issueLink(ctx: Ctx, p: Principal, envelopeId: string, recipientId: string) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  return tx(ctx.db, () => {
    const e = envRow(ctx, env.id)!;
    if (e.status !== 'sent') throw conflict('not_active', 'Der Vorgang ist nicht aktiv.');
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE id = ? AND envelope_id = ?').get(recipientId, e.id) as any;
    if (!rec) throw notFound('Empfänger nicht gefunden');
    if (!['sent', 'opened'].includes(rec.status)) throw conflict('not_pending', 'Diese Person ist gerade nicht am Zug.');
    const token = secretToken();
    ctx.db.prepare('UPDATE recipients SET token_hash = ?, token_issued_at = ? WHERE id = ?').run(hashToken(token), ctx.now().toISOString(), rec.id);
    appendAudit(ctx.db, e.id, e.org_id, 'recipient.link_issued', actorOf(p), { recipient_id: rec.id, previous_link_revoked: true });
    return { url: signingUrl(ctx, e.org_id, token) };
  });
}

export function deleteDraft(ctx: Ctx, p: Principal, envelopeId: string) {
  const env = loadEnvelope(ctx, p, envelopeId, true);
  assertDraft(env);
  tx(ctx.db, () => {
    ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('audit_purge_allowed', '1')`).run();
    try {
      ctx.db.prepare('DELETE FROM audit_events WHERE envelope_id = ?').run(envelopeId);
      ctx.db.prepare(`DELETE FROM envelopes WHERE id = ? AND status = 'draft'`).run(envelopeId);
    } finally {
      ctx.db.prepare(`DELETE FROM meta WHERE key = 'audit_purge_allowed'`).run();
    }
  });
}

export function formInfo(ruleIds: string[]) {
  return ruleIds.map(ruleById).filter(Boolean);
}
