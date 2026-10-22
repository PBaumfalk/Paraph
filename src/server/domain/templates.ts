// Vorlagen: Entwurf bearbeiten, Versionen veröffentlichen (unveränderlich), Vorgänge erzeugen, Massenversand.
import { z } from 'zod';
import Papa from 'papaparse';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { canonicalJson, id, sha256Hex } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { actorOf, require as requirePerm, type Principal } from './authz.js';
import { appendAudit } from './audit.js';
import { createEnvelope, FieldInput, replaceFields, replaceRecipients, sendEnvelope, storeDocument, envRow } from './envelopes.js';
import { emit } from './webhooks.js';
import { logActivity } from './users.js';
import { AUTH_METHODS, RECIPIENT_KINDS, type PageInfo } from '../../shared/model.js';
import { suggestRules } from '../../shared/formrules.js';

export const RoleDef = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(RECIPIENT_KINDS).default('signer'),
  routing_order: z.number().int().min(1).max(50).default(1),
  auth_method: z.enum(AUTH_METHODS).default('none'),
  default_name: z.string().max(160).optional(),
  default_email: z.string().max(254).optional(),
  public: z.boolean().optional(), // Rolle, die im öffentlichen Formular von Besuchern ausgefüllt wird
});

export const TemplateSettings = z.object({
  title: z.string().max(200).default(''),
  message: z.string().max(4000).default(''),
  signing_order: z.enum(['parallel', 'sequential']).default('parallel'),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  reminder_days: z.number().int().min(0).max(30).optional(),
  allow_delegation: z.boolean().default(false),
  form_classes: z.array(z.string()).max(20).default([]),
});

export interface TemplateDoc {
  id: string;
  name: string;
  blob_id: string;
  sha256: string;
  source_blob_id: string;
  source_sha256: string;
  source_kind: string;
  pages: PageInfo[];
  warnings: string[];
  text_excerpt: string;
}

export interface TemplateContent {
  documents: TemplateDoc[];
  roles: z.infer<typeof RoleDef>[];
  fields: (z.infer<typeof FieldInput> & { document: number; recipient: string })[];
  settings: z.infer<typeof TemplateSettings>;
}

const EMPTY: TemplateContent = { documents: [], roles: [{ key: 'unterzeichner', name: 'Unterzeichner', kind: 'signer', routing_order: 1, auth_method: 'none' }], fields: [], settings: TemplateSettings.parse({}) };

function row(ctx: Ctx, templateId: string) {
  return ctx.db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as any;
}

export function loadTemplate(ctx: Ctx, p: Principal, templateId: string, write = false) {
  const t = row(ctx, templateId);
  if (!t || t.org_id !== p.orgId) throw notFound('Vorlage nicht gefunden');
  if (t.visibility === 'private' && (p.kind !== 'user' || t.owner_id !== p.userId)) throw notFound('Vorlage nicht gefunden');
  requirePerm(p, write ? 'template.write' : 'template.read');
  if (write && p.kind === 'user' && p.role === 'member' && t.owner_id !== p.userId) throw forbidden('Nur die Person, die die Vorlage angelegt hat, oder Administratoren dürfen sie ändern.');
  return t;
}

export function serializeTemplate(ctx: Ctx, t: any, withDraft = true) {
  const versions = ctx.db.prepare('SELECT id, version, note, created_at, created_by, content_sha256 FROM template_versions WHERE template_id = ? ORDER BY version DESC').all(t.id) as any[];
  const draft = JSON.parse(t.draft) as TemplateContent;
  const usage = (ctx.db.prepare(`SELECT COUNT(*) AS n, MAX(e.created_at) AS last FROM envelopes e JOIN template_versions v ON v.id = e.template_version_id WHERE v.template_id = ?`).get(t.id) as any);
  const current = versions[0] ? (JSON.parse((ctx.db.prepare('SELECT content FROM template_versions WHERE id = ?').get(versions[0].id) as any).content) as TemplateContent) : null;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    folder_id: t.folder_id,
    visibility: t.visibility,
    owner_id: t.owner_id,
    current_version: t.current_version,
    archived: !!t.archived_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
    usage_count: usage.n,
    last_used_at: usage.last,
    has_unpublished_changes: !current || sha256Hex(canonicalJson(draft)) !== versions[0].content_sha256,
    published: current ? { roles: current.roles, fields: current.fields.map((f) => ({ key: f.key, type: f.type, label: f.label, recipient: f.recipient, required: f.required, config: f.config })), documents: current.documents.map((d) => ({ name: d.name, pages: d.pages.length })), settings: current.settings } : null,
    versions,
    draft: withDraft ? { ...draft, documents: draft.documents.map(({ text_excerpt, ...d }) => d) } : undefined,
  };
}

export function listTemplates(ctx: Ctx, p: Principal, q: { folder?: string; search?: string; archived?: boolean }) {
  requirePerm(p, 'template.read');
  const where = ['org_id = ?', q.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];
  const args: any[] = [p.orgId];
  if (p.kind === 'user') {
    where.push(`(visibility = 'org' OR owner_id = ?)`);
    args.push(p.userId);
  } else where.push(`visibility = 'org'`);
  if (q.folder) {
    where.push('folder_id = ?');
    args.push(q.folder);
  }
  if (q.search) {
    where.push(`name LIKE ? ESCAPE '\\'`);
    args.push('%' + q.search.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
  }
  return (ctx.db.prepare(`SELECT * FROM templates WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`).all(...args) as any[]).map((t) => serializeTemplate(ctx, t, false));
}

export function createTemplate(ctx: Ctx, p: Principal, input: { name: string; description?: string; folder_id?: string | null; visibility?: 'private' | 'org' }) {
  requirePerm(p, 'template.write');
  if (input.folder_id && !ctx.db.prepare('SELECT 1 FROM folders WHERE id = ? AND org_id = ?').get(input.folder_id, p.orgId)) throw badRequest('folder', 'Ordner nicht gefunden');
  const tid = id('tpl');
  const now = ctx.now().toISOString();
  ctx.db
    .prepare('INSERT INTO templates (id, org_id, folder_id, owner_id, visibility, name, description, draft, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tid, p.orgId, input.folder_id ?? null, p.kind === 'user' ? p.userId : p.createdBy, input.visibility ?? 'org', input.name.trim().slice(0, 160), (input.description ?? '').slice(0, 1000), JSON.stringify({ ...EMPTY, settings: { ...EMPTY.settings, title: input.name } }), now, now);
  logActivity(ctx, { orgId: p.orgId, userId: p.kind === 'user' ? p.userId : null, apiKeyId: p.kind === 'apikey' ? p.keyId : null }, 'template.created', tid);
  return row(ctx, tid);
}

export function updateTemplateMeta(ctx: Ctx, p: Principal, templateId: string, patch: { name?: string; description?: string; folder_id?: string | null; visibility?: 'private' | 'org'; archived?: boolean }) {
  const t = loadTemplate(ctx, p, templateId, true);
  if (patch.folder_id && !ctx.db.prepare('SELECT 1 FROM folders WHERE id = ? AND org_id = ?').get(patch.folder_id, p.orgId)) throw badRequest('folder', 'Ordner nicht gefunden');
  if (patch.visibility === 'private' && p.kind === 'user' && t.owner_id !== p.userId) throw forbidden('Nur die Person, die die Vorlage angelegt hat, kann sie privat stellen.');
  ctx.db
    .prepare(
      `UPDATE templates SET name = COALESCE(?, name), description = COALESCE(?, description), folder_id = CASE WHEN ? THEN ? ELSE folder_id END,
       visibility = COALESCE(?, visibility), archived_at = CASE WHEN ? IS NULL THEN archived_at WHEN ? = 1 THEN ? ELSE NULL END, updated_at = ? WHERE id = ?`,
    )
    .run(
      patch.name?.trim().slice(0, 160) ?? null,
      patch.description?.slice(0, 1000) ?? null,
      patch.folder_id !== undefined ? 1 : 0,
      patch.folder_id ?? null,
      patch.visibility ?? null,
      patch.archived === undefined ? null : 1,
      patch.archived ? 1 : 0,
      ctx.now().toISOString(),
      ctx.now().toISOString(),
      templateId,
    );
  return row(ctx, templateId);
}

export async function addTemplateDocument(ctx: Ctx, p: Principal, templateId: string, file: { name: string; bytes: Buffer }) {
  loadTemplate(ctx, p, templateId, true);
  const stored = await storeDocument(ctx, p.orgId, file);
  const doc: TemplateDoc = {
    id: id('tdoc'),
    name: stored.name,
    blob_id: stored.pdf.id,
    sha256: stored.pdf.sha256,
    source_blob_id: stored.source.id,
    source_sha256: stored.source.sha256,
    source_kind: stored.kind,
    pages: stored.pages,
    warnings: stored.warnings,
    text_excerpt: stored.text.slice(0, 40000),
  };
  tx(ctx.db, () => {
    const t = row(ctx, templateId);
    const draft = JSON.parse(t.draft) as TemplateContent;
    if (draft.documents.length >= 20) throw badRequest('too_many_documents', 'Höchstens 20 Dokumente.');
    draft.documents.push(doc);
    ctx.db.prepare('UPDATE templates SET draft = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(draft), ctx.now().toISOString(), templateId);
  });
  return { document: { ...doc, text_excerpt: undefined }, suggestions: suggestRules(stored.text), textItems: stored.textItems };
}

const DraftInput = z.object({
  documents: z.array(z.object({ id: z.string(), name: z.string().max(180) })).optional(),
  roles: z.array(RoleDef).min(1).max(30).optional(),
  fields: z.array(FieldInput).max(1000).optional(),
  settings: TemplateSettings.partial().optional(),
});

/** Speichert den Entwurf. Dokumente können nur umbenannt, umsortiert oder entfernt werden (Hochladen separat). */
export function saveTemplateDraft(ctx: Ctx, p: Principal, templateId: string, input: z.infer<typeof DraftInput>) {
  loadTemplate(ctx, p, templateId, true);
  const parsed = DraftInput.parse(input);
  return tx(ctx.db, () => {
    const t = row(ctx, templateId);
    const draft = JSON.parse(t.draft) as TemplateContent;
    if (parsed.documents) {
      const byId = new Map(draft.documents.map((d) => [d.id, d]));
      draft.documents = parsed.documents.map((d) => {
        const doc = byId.get(d.id);
        if (!doc) throw badRequest('document', 'Unbekanntes Dokument');
        return { ...doc, name: d.name };
      });
    }
    if (parsed.roles) {
      const keys = new Set<string>();
      for (const r of parsed.roles) {
        if (keys.has(r.key)) throw badRequest('role_key', `Rolle „${r.name}“ ist doppelt.`);
        keys.add(r.key);
      }
      if (parsed.roles.filter((r) => r.public).length > 1) throw badRequest('role_public', 'Nur eine Rolle kann im öffentlichen Formular ausgefüllt werden.');
      draft.roles = parsed.roles;
    }
    if (parsed.fields) {
      const roleKeys = new Set(draft.roles.map((r) => r.key));
      const keys = new Set<string>();
      draft.fields = parsed.fields.map((f, i) => {
        const docIndex = typeof f.document === 'number' ? f.document : draft.documents.findIndex((d) => d.id === f.document);
        const doc = draft.documents[docIndex];
        if (!doc) throw badRequest('field_document', `Feld ${i + 1}: Dokument fehlt.`);
        if (f.page >= doc.pages.length) throw badRequest('field_page', `Feld ${i + 1}: Seite existiert nicht.`);
        if (!roleKeys.has(f.recipient)) throw badRequest('field_role', `Feld ${i + 1}: Rolle „${f.recipient}“ unbekannt.`);
        let key = f.key ?? `${f.type}_${i + 1}`;
        while (keys.has(key)) key += '_';
        keys.add(key);
        return { ...f, key, document: docIndex };
      });
    }
    if (parsed.settings) draft.settings = TemplateSettings.parse({ ...draft.settings, ...parsed.settings });
    ctx.db.prepare('UPDATE templates SET draft = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(draft), ctx.now().toISOString(), templateId);
    return serializeTemplate(ctx, row(ctx, templateId));
  });
}

export function publishTemplate(ctx: Ctx, p: Principal, templateId: string, note = '') {
  loadTemplate(ctx, p, templateId, true);
  return tx(ctx.db, () => {
    const t = row(ctx, templateId);
    const draft = JSON.parse(t.draft) as TemplateContent;
    if (!draft.documents.length) throw new AppError(422, 'not_ready', 'Die Vorlage enthält noch kein Dokument.');
    for (const r of draft.roles) {
      if ((r.kind === 'signer' || r.kind === 'witness') && !draft.fields.some((f) => f.recipient === r.key && f.type === 'signature')) {
        throw new AppError(422, 'not_ready', `Die Rolle „${r.name}“ hat noch kein Unterschriftsfeld.`);
      }
    }
    const contentJson = canonicalJson(draft);
    const sha = sha256Hex(contentJson);
    const last = ctx.db.prepare('SELECT content_sha256 FROM template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1').get(templateId) as any;
    if (last?.content_sha256 === sha) throw conflict('no_changes', 'Keine Änderungen seit der letzten Version.');
    const version = t.current_version + 1;
    const vid = id('tpv');
    ctx.db
      .prepare('INSERT INTO template_versions (id, template_id, version, content, content_sha256, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(vid, templateId, version, contentJson, sha, note.slice(0, 500), p.kind === 'user' ? p.userId : p.keyId, ctx.now().toISOString());
    ctx.db.prepare('UPDATE templates SET current_version = ?, updated_at = ? WHERE id = ?').run(version, ctx.now().toISOString(), templateId);
    emit(ctx, p.orgId, 'template.published', { template_id: templateId, version, version_id: vid });
    logActivity(ctx, { orgId: p.orgId, userId: p.kind === 'user' ? p.userId : null, apiKeyId: p.kind === 'apikey' ? p.keyId : null }, 'template.published', templateId, { version });
    return { id: vid, version };
  });
}

export function versionContent(ctx: Ctx, templateId: string, version?: number): { id: string; version: number; content: TemplateContent } {
  const v = (version
    ? ctx.db.prepare('SELECT * FROM template_versions WHERE template_id = ? AND version = ?').get(templateId, version)
    : ctx.db.prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1').get(templateId)) as any;
  if (!v) throw new AppError(422, 'not_published', 'Die Vorlage wurde noch nicht veröffentlicht.');
  return { id: v.id, version: v.version, content: JSON.parse(v.content) };
}

export const UseTemplateInput = z.object({
  version: z.number().int().min(1).optional(),
  title: z.string().max(200).optional(),
  message: z.string().max(4000).optional(),
  recipients: z.record(
    z.string(),
    z.object({
      name: z.string().trim().min(1).max(160),
      email: z.string().trim().email().max(254),
      phone: z.string().max(40).optional(),
      auth_method: z.enum(AUTH_METHODS).optional(),
      access_code: z.string().min(4).max(64).optional(),
    }),
  ),
  prefill: z.record(z.string(), z.string().max(5000)).default({}),
  send: z.boolean().default(true),
  notify: z.boolean().default(true),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  external_ref: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
  acknowledge_form_risk: z.boolean().optional(),
});

function fillPlaceholders(s: string, recipients: Record<string, { name: string; email: string }>, roles: TemplateContent['roles'], prefill: Record<string, string>) {
  return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, expr: string) => {
    const [a, b] = expr.split('.');
    const role = roles.find((r) => r.key === a || r.name === a);
    if (role && (b === 'name' || b === 'email')) return recipients[role.key]?.[b] ?? m;
    if (prefill[expr] !== undefined) return prefill[expr];
    return m;
  });
}

export function useTemplate(ctx: Ctx, p: Principal, templateId: string, raw: unknown, extra: { publicFormId?: string } = {}) {
  const input = UseTemplateInput.parse(raw);
  if (!extra.publicFormId) loadTemplate(ctx, p, templateId, false);
  requirePerm(p, 'envelope.write');
  const v = versionContent(ctx, templateId, input.version);
  const c = v.content;
  const recipients: Record<string, { name: string; email: string; phone?: string; auth_method?: any; access_code?: string }> = {};
  for (const r of c.roles) {
    const given = input.recipients[r.key] ?? input.recipients[r.name];
    const name = given?.name ?? r.default_name;
    const email = given?.email ?? r.default_email;
    if (!name || !email) throw badRequest('recipient_missing', `Für die Rolle „${r.name}“ fehlen Name oder E-Mail.`);
    recipients[r.key] = { name, email: email.toLowerCase(), phone: given?.phone, auth_method: given?.auth_method ?? r.auth_method, access_code: given?.access_code };
  }
  const title = fillPlaceholders(input.title ?? (c.settings.title || (row(ctx, templateId)?.name ?? 'Dokument')), recipients, c.roles, input.prefill);
  const env = createEnvelope(
    ctx,
    p,
    {
      title: title.slice(0, 200),
      message: fillPlaceholders(input.message ?? c.settings.message, recipients, c.roles, input.prefill),
      signing_order: c.settings.signing_order,
      expires_in_days: input.expires_in_days ?? c.settings.expires_in_days,
      reminder_days: c.settings.reminder_days,
      allow_delegation: c.settings.allow_delegation,
      form_classes: c.settings.form_classes,
      external_ref: input.external_ref,
      metadata: input.metadata,
    },
    { templateVersionId: v.id, publicFormId: extra.publicFormId },
  );
  // Dokumente: unveränderliche Blobs der Vorlagenversion werden referenziert (nicht kopiert)
  tx(ctx.db, () => {
    c.documents.forEach((d, i) => {
      ctx.db
        .prepare(
          `INSERT INTO envelope_documents (id, envelope_id, position, name, source_blob_id, source_sha256, source_kind, blob_id, sha256, pages, warnings, text_excerpt, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id('doc'), env.id, i, d.name, d.source_blob_id, d.source_sha256, d.source_kind, d.blob_id, d.sha256, JSON.stringify(d.pages), JSON.stringify(d.warnings), d.text_excerpt ?? '', ctx.now().toISOString());
    });
    appendAudit(ctx.db, env.id, p.orgId, 'template.applied', actorOf(p), {
      template_id: templateId,
      template_version: v.version,
      template_version_id: v.id,
      documents: c.documents.map((d) => ({ name: d.name, sha256: d.sha256 })),
    });
  });
  const roleOrder = [...c.roles];
  const { refs } = replaceRecipients(
    ctx,
    p,
    env.id,
    roleOrder.map((r) => ({
      ref: r.key,
      role: r.name,
      kind: r.kind,
      name: recipients[r.key].name,
      email: recipients[r.key].email,
      phone: recipients[r.key].phone ?? null,
      routing_order: r.routing_order,
      auth_method: recipients[r.key].auth_method ?? 'none',
      access_code: recipients[r.key].access_code,
    })),
  );
  const docIds = (ctx.db.prepare('SELECT id FROM envelope_documents WHERE envelope_id = ? ORDER BY position').all(env.id) as any[]).map((d) => d.id);
  const fieldKeys = new Set(c.fields.map((f) => f.key));
  for (const k of Object.keys(input.prefill)) if (!fieldKeys.has(k) && !/\./.test(k)) throw badRequest('prefill_unknown', `Vorbelegung für unbekanntes Feld „${k}“.`);
  replaceFields(
    ctx,
    p,
    env.id,
    c.fields.map((f) => ({
      ...f,
      document: docIds[f.document],
      recipient: refs[f.recipient],
      value: input.prefill[f.key!] ?? f.config.prefill,
      config: input.prefill[f.key!] !== undefined && f.config.readonly !== false ? { ...f.config, readonly: f.config.readonly ?? true } : f.config,
    })),
  );
  if (!input.send) return { envelope: envRow(ctx, env.id)!, links: [] };
  return sendEnvelope(ctx, p, env.id, { notify: input.notify, acknowledgeFormRisk: input.acknowledge_form_risk });
}

// ───────────────────────────── Massenversand ─────────────────────────────

export async function parseBulkFile(bytes: Buffer, name: string): Promise<Record<string, string>[]> {
  if (bytes.length > 5 * 1024 * 1024) throw badRequest('file_too_large', 'Datei zu groß (max. 5 MB).');
  if (/\.xlsx$/i.test(name)) {
    if (bytes.subarray(0, 4).toString('latin1') !== 'PK\u0003\u0004') throw badRequest('file_type', 'Keine gültige XLSX-Datei.');
    const { default: readXlsx } = await import('read-excel-file/node');
    const rows = (await readXlsx(bytes)) as unknown as unknown[][];
    const [head, ...rest] = rows;
    if (!head) return [];
    const keys = head.map((h) => String(h ?? '').trim());
    return rest
      .filter((r) => r.some((c) => c !== null && String(c).trim() !== ''))
      .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] == null ? '' : r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : String(r[i]).trim()])));
  }
  const text = bytes.toString('utf8').replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', delimiter: '', transformHeader: (h) => h.trim() });
  if (parsed.errors.length && !parsed.data.length) throw badRequest('csv_invalid', 'Die CSV-Datei konnte nicht gelesen werden.');
  return parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '').trim()])));
}

export function bulkColumns(c: TemplateContent) {
  const cols: string[] = [];
  for (const r of c.roles) {
    if (!r.default_email) cols.push(`${r.key}.name`, `${r.key}.email`);
  }
  for (const f of c.fields) if (!['signature', 'initials', 'signed_date', 'formula', 'attachment'].includes(f.type)) cols.push(f.key!);
  return cols;
}

export function bulkSend(ctx: Ctx, p: Principal, templateId: string, rows: Record<string, string>[], opts: { dryRun: boolean; acknowledgeFormRisk?: boolean }) {
  loadTemplate(ctx, p, templateId, false);
  const v = versionContent(ctx, templateId);
  if (rows.length === 0) throw badRequest('empty', 'Die Datei enthält keine Zeilen.');
  if (rows.length > 500) throw badRequest('too_many_rows', 'Höchstens 500 Zeilen je Durchgang.');
  const results: { row: number; ok: boolean; envelope_id?: string; error?: string; email?: string }[] = [];
  const pick = (r: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(r).find((x) => x.toLowerCase() === k.toLowerCase());
      if (hit && r[hit]) return r[hit];
    }
    return undefined;
  };
  rows.forEach((r, i) => {
    const recipients: Record<string, any> = {};
    const errs: string[] = [];
    for (const role of v.content.roles) {
      const name = pick(r, `${role.key}.name`, `${role.name}.name`, `${role.name} Name`) ?? role.default_name;
      const email = pick(r, `${role.key}.email`, `${role.name}.email`, `${role.name} E-Mail`, `${role.name} Email`) ?? role.default_email;
      if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.push(`Rolle „${role.name}“: Name/E-Mail fehlt oder ungültig`);
      else recipients[role.key] = { name, email };
    }
    const prefill: Record<string, string> = {};
    for (const f of v.content.fields) {
      const val = pick(r, f.key!);
      if (val !== undefined) prefill[f.key!] = val;
    }
    if (errs.length) {
      results.push({ row: i + 2, ok: false, error: errs.join('; ') });
      return;
    }
    if (opts.dryRun) {
      results.push({ row: i + 2, ok: true, email: Object.values(recipients)[0]?.email });
      return;
    }
    try {
      const out = useTemplate(ctx, p, templateId, { recipients, prefill, send: true, notify: true, acknowledge_form_risk: opts.acknowledgeFormRisk });
      results.push({ row: i + 2, ok: true, envelope_id: out.envelope.id, email: Object.values(recipients)[0]?.email });
    } catch (e: any) {
      results.push({ row: i + 2, ok: false, error: e?.message ?? String(e) });
    }
  });
  return { template_version: v.version, total: rows.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export function bulkCsvTemplate(ctx: Ctx, p: Principal, templateId: string) {
  loadTemplate(ctx, p, templateId, false);
  const v = versionContent(ctx, templateId);
  const cols = bulkColumns(v.content);
  return '﻿' + cols.join(';') + '\n' + cols.map((c) => (c.endsWith('.email') ? 'name@example.org' : c.endsWith('.name') ? 'Vorname Nachname' : '')).join(';') + '\n';
}

export function duplicateTemplate(ctx: Ctx, p: Principal, templateId: string) {
  const t = loadTemplate(ctx, p, templateId, false);
  const copy = createTemplate(ctx, p, { name: `${t.name} (Kopie)`, description: t.description, folder_id: t.folder_id, visibility: 'private' });
  ctx.db.prepare('UPDATE templates SET draft = ? WHERE id = ?').run(t.draft, copy.id);
  return row(ctx, copy.id);
}
