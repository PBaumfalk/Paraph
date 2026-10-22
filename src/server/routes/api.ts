// REST-API v1 – dieselben Endpunkte nutzt die Oberfläche (Sitzung + CSRF) und Fremdsysteme (API-Schlüssel).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { authenticate, idempotent, sendFile, meta } from '../http.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { id, secretToken } from '../lib/crypto.js';
import { tx } from '../db/index.js';
import { require as requirePerm, can, seesAllEnvelopes, actorOf, type Principal, type Role, SCOPES } from '../domain/authz.js';
import * as E from '../domain/envelopes.js';
import * as T from '../domain/templates.js';
import { listAudit, verifyChain } from '../domain/audit.js';
import { getOrg, DEFAULT_SETTINGS, type Branding, type OrgSettings } from '../domain/orgs.js';
import { createApiKey, inviteMember, listMembers, logActivity, removeMember, setMemberRole, createOrg } from '../domain/users.js';
import { encryptSecret, newWebhookSecret, WEBHOOK_EVENTS } from '../domain/webhooks.js';
import { enqueue } from '../domain/jobs.js';
import { checkUrlShape, resolveSafe, SsrfError } from '../lib/ssrf.js';
import { inPersonSession, issueEmbedToken } from '../domain/signing.js';
import { FORM_RULES, suggestRules } from '../../shared/formrules.js';
import { getSealKey, importOrgSealKey } from '../domain/sealkeys.js';
import { detectFields } from '../domain/autodetect.js';
import { RECIPIENT_COLORS } from '../../shared/model.js';
import { appendAudit } from '../domain/audit.js';

async function readUpload(req: FastifyRequest, maxBytes: number): Promise<{ name: string; bytes: Buffer }> {
  if (req.isMultipart()) {
    const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
    if (!file) throw badRequest('file_missing', 'Keine Datei übermittelt.');
    const bytes = await file.toBuffer();
    if ((file.file as any).truncated) throw new AppError(413, 'file_too_large', 'Datei zu groß.');
    return { name: file.filename, bytes };
  }
  const b = z.object({ name: z.string().max(200), file_base64: z.string() }).parse(req.body);
  const bytes = Buffer.from(b.file_base64, 'base64');
  if (bytes.length > maxBytes) throw new AppError(413, 'file_too_large', 'Datei zu groß.');
  return { name: b.name, bytes };
}

const p = (req: FastifyRequest) => req.params as Record<string, string>;
const q = (req: FastifyRequest) => req.query as Record<string, string>;

export function apiRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = (req: FastifyRequest) => authenticate(ctx, req);
  const userOnly = (req: FastifyRequest) => {
    const pr = authenticate(ctx, req, { allowApiKey: false });
    if (pr.kind !== 'user') throw forbidden();
    return pr;
  };
  const actorRef = (pr: Principal) => ({ orgId: pr.orgId, userId: pr.kind === 'user' ? pr.userId : null, apiKeyId: pr.kind === 'apikey' ? pr.keyId : null });

  // ───────────── Kontext ─────────────
  app.get('/api/v1/me', async (req) => {
    const pr = auth(req);
    const org = getOrg(ctx, pr.orgId);
    return {
      principal: pr.kind === 'user' ? { kind: 'user', id: pr.userId, name: pr.name, email: pr.email, role: pr.role, instance_admin: pr.instanceAdmin } : { kind: 'api_key', id: pr.keyId, name: pr.name, scopes: pr.scopes, mode: pr.mode },
      org: { id: org.id, name: org.name, slug: org.slug, branding: org.branding, settings: org.settings, custom_domain: org.custom_domain },
      permissions: (['envelope.read', 'envelope.write', 'template.read', 'template.write', 'org.manage', 'members.manage', 'webhooks.manage', 'apikeys.manage', 'contacts.read', 'activity.read'] as const).filter((x) => can(pr, x)),
      features: { smtp: !!ctx.cfg.smtp, office_conversion: !!ctx.cfg.gotenbergUrl, sms: !!ctx.cfg.sms, qes: ctx.cfg.qes ? { name: ctx.cfg.qes.name, verified: false } : null, timestamp_authority: ctx.cfg.tsaUrl ?? null, oidc: !!ctx.cfg.oidc },
    };
  });

  app.patch('/api/v1/me', async (req) => {
    const pr = userOnly(req);
    const b = z.object({ name: z.string().trim().min(1).max(120).optional(), locale: z.enum(['de', 'en']).optional() }).parse(req.body);
    ctx.db.prepare('UPDATE users SET name = COALESCE(?, name), locale = COALESCE(?, locale) WHERE id = ?').run(b.name ?? null, b.locale ?? null, pr.userId);
    return { ok: true };
  });

  // ───────────── Vorgänge ─────────────
  app.get('/api/v1/envelopes', async (req) => {
    const pr = auth(req);
    const qq = q(req);
    return { data: E.listEnvelopes(ctx, pr, { status: qq.status, search: qq.search, limit: qq.limit ? Number(qq.limit) : undefined, before: qq.before, test: qq.test === 'true', external_ref: qq.external_ref }) };
  });

  app.get('/api/v1/envelopes/stats', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'envelope.read');
    const org = getOrg(ctx, pr.orgId);
    const own = !seesAllEnvelopes(pr, org.settings.envelopeVisibility) && pr.kind === 'user';
    const rows = ctx.db.prepare(`SELECT status, COUNT(*) AS n FROM envelopes WHERE org_id = ? AND test_mode = ? ${own ? 'AND owner_id = ?' : ''} GROUP BY status`).all(pr.orgId, pr.kind === 'apikey' && pr.mode === 'test' ? 1 : 0, ...(own ? [(pr as any).userId] : [])) as any[];
    const waitingOnMe = pr.kind === 'user' ? (ctx.db.prepare(`SELECT COUNT(*) AS n FROM recipients r JOIN envelopes e ON e.id = r.envelope_id WHERE e.org_id = ? AND e.status = 'sent' AND r.email = ? AND r.status IN ('sent','opened')`).get(pr.orgId, pr.email) as any).n : 0;
    return { by_status: Object.fromEntries(rows.map((r) => [r.status, r.n])), waiting_on_me: waitingOnMe };
  });

  // Vorgang anlegen – einfach (nur Entwurf) oder komplett in einem Aufruf (Dokumente, Empfänger, Felder, Versand)
  const FullCreate = E.EnvelopeInput.extend({
    documents: z.array(z.object({ name: z.string().max(200), file_base64: z.string() })).max(20).optional(),
    recipients: z.array(E.RecipientInput).max(30).optional(),
    fields: z
      .array(
        z.union([
          E.FieldInput,
          E.FieldInput.omit({ page: true, x: true, y: true, w: true, h: true, document: true }).extend({
            document: z.union([z.string(), z.number().int()]).optional(),
            anchor: z.object({ text: z.string().min(2).max(200), occurrence: z.number().int().min(1).default(1), offset_x: z.number().default(0), offset_y: z.number().default(0), width: z.number().min(5).max(600).default(160), height: z.number().min(5).max(300).default(40) }),
          }),
        ]),
      )
      .max(1000)
      .optional(),
    send: z.boolean().default(false),
    notify: z.boolean().default(true),
    acknowledge_form_risk: z.boolean().optional(),
  });

  app.post('/api/v1/envelopes', { bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const pr = auth(req);
    return idempotent(ctx, req, reply, pr, async () => {
      const b = FullCreate.parse(req.body);
      const env = E.createEnvelope(ctx, pr, b);
      try {
        const textItems: any[][][] = [];
        for (const d of b.documents ?? []) {
          const r = await E.addDocument(ctx, pr, env.id, { name: d.name, bytes: Buffer.from(d.file_base64, 'base64') });
          textItems.push(r.textItems);
        }
        if (b.recipients?.length) {
          const { refs } = E.replaceRecipients(ctx, pr, env.id, b.recipients);
          if (b.fields?.length) {
            const docs = E.documentsOf(ctx, env.id);
            const used = new Map<string, number>();
            const fields = b.fields.map((f: any) => {
              const recipient = refs[f.recipient] ?? f.recipient;
              if (!f.anchor) return { ...f, recipient };
              // Ankertext suchen und Feld relativ dazu platzieren (Angaben in pt)
              const docIdx = f.document === undefined ? null : typeof f.document === 'number' ? f.document : docs.findIndex((d) => d.id === f.document);
              const want = f.anchor.occurrence;
              const k = `${docIdx}:${f.anchor.text}`;
              let seen = 0;
              for (let di = 0; di < docs.length; di++) {
                if (docIdx !== null && di !== docIdx) continue;
                for (let pi = 0; pi < (textItems[di]?.length ?? 0); pi++) {
                  for (const it of textItems[di][pi]) {
                    if (!it.str.includes(f.anchor.text)) continue;
                    seen++;
                    if (seen < want) continue;
                    const pg = docs[di].pages[pi];
                    used.set(k, seen);
                    const { anchor, ...rest } = f;
                    return {
                      ...rest,
                      recipient,
                      document: di,
                      page: pi,
                      x: Math.min(Math.max(it.x + anchor.offset_x / pg.width, 0), 0.99),
                      y: Math.min(Math.max(it.y + it.h + anchor.offset_y / pg.height, 0), 0.99),
                      w: Math.min(anchor.width / pg.width, 1),
                      h: Math.min(anchor.height / pg.height, 1),
                    };
                  }
                }
              }
              throw badRequest('anchor_not_found', `Ankertext „${f.anchor.text}“ (Vorkommen ${want}) nicht gefunden.`);
            });
            E.replaceFields(ctx, pr, env.id, fields);
          }
        }
        let links: any[] = [];
        if (b.send) links = E.sendEnvelope(ctx, pr, env.id, { notify: b.notify, acknowledgeFormRisk: b.acknowledge_form_risk }).links;
        return { status: 201, body: { ...E.serializeEnvelope(ctx, E.envRow(ctx, env.id)!), signing_links: links } };
      } catch (e) {
        // Bei Fehlern im Komplettaufruf keinen halben Entwurf hinterlassen
        if (b.documents?.length || b.recipients?.length) {
          try {
            if (E.envRow(ctx, env.id)?.status === 'draft') E.deleteDraft(ctx, pr, env.id);
          } catch {}
        }
        throw e;
      }
    });
  });

  app.get('/api/v1/envelopes/:id', async (req) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const out = E.serializeEnvelope(ctx, env);
    const docs = E.documentsOf(ctx, env.id);
    const formSuggestions = env.status === 'draft' ? suggestRules(env.title + '\n' + docs.map((d) => d.text_excerpt).join('\n')) : [];
    const finals = ctx.db.prepare('SELECT document_id, name, sha256 FROM final_documents WHERE envelope_id = ?').all(env.id);
    return { ...out, form_suggestions: formSuggestions, final_documents: finals, can_edit: can(pr, 'envelope.write') };
  });

  app.patch('/api/v1/envelopes/:id', async (req) => {
    const pr = auth(req);
    const env = E.updateEnvelope(ctx, pr, p(req).id, E.EnvelopeInput.partial().parse(req.body));
    return E.serializeEnvelope(ctx, env);
  });

  app.delete('/api/v1/envelopes/:id', async (req) => {
    const pr = auth(req);
    E.deleteDraft(ctx, pr, p(req).id);
    return { ok: true };
  });

  app.post('/api/v1/envelopes/:id/documents', { bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const pr = auth(req);
    const file = await readUpload(req, ctx.cfg.maxUploadBytes);
    const r = await E.addDocument(ctx, pr, p(req).id, file);
    return reply.code(201).send({ id: r.id, name: r.name, pages: r.pages, warnings: r.warnings, sha256: r.pdf.sha256, form_suggestions: r.suggestions, field_suggestions: detectFields(r.textItems, r.pages) });
  });

  app.delete('/api/v1/envelopes/:id/documents/:docId', async (req) => {
    const pr = auth(req);
    E.removeDocument(ctx, pr, p(req).id, p(req).docId);
    return { ok: true };
  });

  app.get('/api/v1/envelopes/:id/documents/:docId/pdf', async (req, reply) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const d = ctx.db.prepare('SELECT * FROM envelope_documents WHERE id = ? AND envelope_id = ?').get(p(req).docId, env.id) as any;
    if (!d) throw notFound();
    return sendFile(reply, await ctx.blobs.get(d.blob_id), 'application/pdf', `${d.name}.pdf`, true);
  });

  app.get('/api/v1/envelopes/:id/documents/:docId/field-suggestions', async (req) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const d = ctx.db.prepare('SELECT * FROM envelope_documents WHERE id = ? AND envelope_id = ?').get(p(req).docId, env.id) as any;
    if (!d) throw notFound();
    const { extractText } = await import('../pdf/inspect.js');
    const pages = JSON.parse(d.pages);
    const { items } = await extractText(await ctx.blobs.get(d.blob_id), pages);
    return { data: detectFields(items, pages) };
  });

  app.put('/api/v1/envelopes/:id/recipients', async (req) => {
    const pr = auth(req);
    const list = z.array(E.RecipientInput).parse(req.body);
    const r = E.replaceRecipients(ctx, pr, p(req).id, list);
    return { data: E.serializeEnvelope(ctx, E.envRow(ctx, p(req).id)!, { withFields: false }).recipients, refs: r.refs };
  });

  app.put('/api/v1/envelopes/:id/fields', async (req) => {
    const pr = auth(req);
    const list = z.array(E.FieldInput).parse(req.body);
    return { data: E.replaceFields(ctx, pr, p(req).id, list) };
  });

  app.get('/api/v1/envelopes/:id/send-check', async (req) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const v = E.validateForSend(ctx, env);
    return { problems: v.problems, form_warnings: v.formWarnings.map((r) => ({ id: r.id, norm: r.norm, label: r.label, hint: r.hint, min_level: r.minLevel, source: r.source, confidence: r.confidence })) };
  });

  app.post('/api/v1/envelopes/:id/send', async (req, reply) => {
    const pr = auth(req);
    return idempotent(ctx, req, reply, pr, async () => {
      const b = z.object({ notify: z.boolean().default(true), acknowledge_form_risk: z.boolean().optional() }).parse(req.body ?? {});
      const r = E.sendEnvelope(ctx, pr, p(req).id, { notify: b.notify, acknowledgeFormRisk: b.acknowledge_form_risk });
      return { status: 200, body: { ...E.serializeEnvelope(ctx, r.envelope), signing_links: r.links } };
    });
  });

  app.post('/api/v1/envelopes/:id/void', async (req) => {
    const pr = auth(req);
    const { reason } = z.object({ reason: z.string().max(1000).default('') }).parse(req.body ?? {});
    E.voidEnvelope(ctx, pr, p(req).id, reason);
    return E.serializeEnvelope(ctx, E.envRow(ctx, p(req).id)!);
  });

  app.post('/api/v1/envelopes/:id/recipients/:rid/remind', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const pr = auth(req);
    const r = E.remindRecipient(ctx, pr, p(req).id, p(req).rid);
    return { ok: true, signing_url: r.url };
  });

  app.post('/api/v1/envelopes/:id/recipients/:rid/link', async (req) => {
    const pr = auth(req);
    return E.issueLink(ctx, pr, p(req).id, p(req).rid);
  });

  app.post('/api/v1/envelopes/:id/recipients/:rid/embed', async (req) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id, true);
    const rec = ctx.db.prepare(`SELECT * FROM recipients WHERE id = ? AND envelope_id = ? AND status IN ('sent','opened')`).get(p(req).rid, env.id) as any;
    if (!rec) throw notFound('Empfänger ist nicht an der Reihe');
    // Herkunft ist Pflicht: nur so sind iframe-Einbettung (frame-ancestors) und Rückmeldung per postMessage sicher begrenzt
    const { origin } = z.object({ origin: z.string().url() }).parse(req.body ?? {});
    const org = getOrg(ctx, pr.orgId);
    if (!org.settings.embedOrigins.includes(new URL(origin).origin)) throw badRequest('origin_not_allowed', 'Diese Herkunft ist für Einbettungen nicht freigegeben (Einstellungen → API).');
    const token = issueEmbedToken(ctx, rec, new URL(origin).origin);
    return { url: `${E.signingUrl(ctx, pr.orgId, token).replace('/s/', '/embed/s/')}`, expires_in: 600 };
  });

  app.post('/api/v1/envelopes/:id/recipients/:rid/in-person', async (req, reply) => {
    const pr = userOnly(req);
    E.loadEnvelope(ctx, pr, p(req).id, true);
    const s = inPersonSession(ctx, p(req).id, p(req).rid, pr.userId, meta(req));
    // Die Sitzung wird nur an den Browser der gastgebenden Person übergeben (Bildschirm wird geteilt)
    return reply.send({ session: s.sessionToken, url: '/s/session' });
  });

  app.post('/api/v1/envelopes/:id/duplicate', async (req, reply) => {
    const pr = auth(req);
    const src = E.loadEnvelope(ctx, pr, p(req).id);
    const env = E.createEnvelope(ctx, pr, { title: `${src.title}`, message: src.message, signing_order: src.signing_order, reminder_days: src.reminder_days, allow_delegation: !!src.allow_delegation, form_classes: JSON.parse(src.form_classes) });
    const docs = E.documentsOf(ctx, src.id);
    const docMap: Record<string, string> = {};
    tx(ctx.db, () => {
      docs.forEach((d, i) => {
        const nid = id('doc');
        docMap[d.id] = nid;
        ctx.db
          .prepare(`INSERT INTO envelope_documents (id, envelope_id, position, name, source_blob_id, source_sha256, source_kind, blob_id, sha256, pages, warnings, text_excerpt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(nid, env.id, i, d.name, d.source_blob_id, d.source_sha256, d.source_kind, d.blob_id, d.sha256, JSON.stringify(d.pages), JSON.stringify(d.warnings), d.text_excerpt, ctx.now().toISOString());
      });
      appendAudit(ctx.db, env.id, pr.orgId, 'envelope.duplicated', actorOf(pr), { from: src.id });
    });
    const recs = E.recipientsOf(ctx, src.id).filter((r) => r.status !== 'delegated');
    const { refs } = E.replaceRecipients(ctx, pr, env.id, recs.map((r) => ({ ref: r.id, role: r.role, kind: r.kind, name: r.name, email: r.email, phone: r.phone, routing_order: r.routing_order, auth_method: r.auth_method === 'access_code' ? 'email_otp' : r.auth_method })));
    E.replaceFields(ctx, pr, env.id, E.fieldsOf(ctx, src.id).filter((f) => refs[f.recipient_id]).map((f) => ({ key: f.key, type: f.type, document: docMap[f.document_id], recipient: refs[f.recipient_id], page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required, label: f.label, config: f.config, value: f.config.readonly ? f.value : undefined })));
    return reply.code(201).send(E.serializeEnvelope(ctx, E.envRow(ctx, env.id)!));
  });

  app.get('/api/v1/envelopes/:id/audit', async (req) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const events = listAudit(ctx.db, env.id);
    return { chain: verifyChain(env.id, events), events };
  });

  app.get('/api/v1/envelopes/:id/files/:kind', async (req, reply) => {
    const pr = auth(req);
    const env = E.loadEnvelope(ctx, pr, p(req).id);
    const res = ctx.db.prepare('SELECT * FROM envelope_results WHERE envelope_id = ?').get(env.id) as any;
    if (!res) throw new AppError(409, 'not_completed', 'Der Vorgang ist noch nicht abgeschlossen.');
    const base = env.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120);
    const kinds: Record<string, [string, string, string]> = {
      final: [res.final_blob_id, 'application/pdf', `${base} – unterschrieben.pdf`],
      certificate: [res.certificate_blob_id, 'application/pdf', `${base} – Abschlussbestätigung.pdf`],
      audit: [res.audit_blob_id, 'application/json', `${base} – Audit-Trail.json`],
      evidence: [res.evidence_blob_id, 'application/zip', `${base} – Nachweispaket.zip`],
    };
    const k = kinds[p(req).kind];
    if (!k) {
      const fd = ctx.db.prepare('SELECT * FROM final_documents WHERE envelope_id = ? AND document_id = ?').get(env.id, p(req).kind) as any;
      if (!fd) throw notFound();
      logActivity(ctx, actorRef(pr), 'envelope.downloaded', env.id, { kind: 'final_document' }, req.ip);
      return sendFile(reply, await ctx.blobs.get(fd.blob_id), 'application/pdf', `${fd.name} – unterschrieben.pdf`);
    }
    logActivity(ctx, actorRef(pr), 'envelope.downloaded', env.id, { kind: p(req).kind }, req.ip);
    return sendFile(reply, await ctx.blobs.get(k[0]), k[1], k[2], q(req).inline === '1' && k[1] === 'application/pdf');
  });

  // ───────────── Vorlagen ─────────────
  app.get('/api/v1/templates', async (req) => {
    const pr = auth(req);
    return { data: T.listTemplates(ctx, pr, { folder: q(req).folder, search: q(req).search, archived: q(req).archived === 'true' }) };
  });
  app.post('/api/v1/templates', async (req, reply) => {
    const pr = auth(req);
    const b = z.object({ name: z.string().min(1).max(160), description: z.string().max(1000).optional(), folder_id: z.string().nullable().optional(), visibility: z.enum(['private', 'org']).optional() }).parse(req.body);
    return reply.code(201).send(T.serializeTemplate(ctx, T.createTemplate(ctx, pr, b)));
  });
  app.get('/api/v1/templates/:id', async (req) => {
    const pr = auth(req);
    const t = T.loadTemplate(ctx, pr, p(req).id);
    return T.serializeTemplate(ctx, t, can(pr, 'template.write'));
  });
  app.patch('/api/v1/templates/:id', async (req) => {
    const pr = auth(req);
    const b = z.object({ name: z.string().min(1).max(160).optional(), description: z.string().max(1000).optional(), folder_id: z.string().nullable().optional(), visibility: z.enum(['private', 'org']).optional(), archived: z.boolean().optional() }).parse(req.body);
    return T.serializeTemplate(ctx, T.updateTemplateMeta(ctx, pr, p(req).id, b));
  });
  app.put('/api/v1/templates/:id/draft', async (req) => {
    const pr = auth(req);
    return T.saveTemplateDraft(ctx, pr, p(req).id, req.body as any);
  });
  app.post('/api/v1/templates/:id/documents', { bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const pr = auth(req);
    const file = await readUpload(req, ctx.cfg.maxUploadBytes);
    const r = await T.addTemplateDocument(ctx, pr, p(req).id, file);
    return reply.code(201).send({ document: r.document, form_suggestions: r.suggestions, field_suggestions: detectFields(r.textItems, r.document.pages) });
  });
  app.get('/api/v1/templates/:id/documents/:docId/pdf', async (req, reply) => {
    const pr = auth(req);
    const t = T.loadTemplate(ctx, pr, p(req).id);
    const draft = JSON.parse(t.draft) as T.TemplateContent;
    let doc = draft.documents.find((d) => d.id === p(req).docId);
    if (!doc) {
      for (const v of ctx.db.prepare('SELECT content FROM template_versions WHERE template_id = ?').all(t.id) as any[]) {
        doc = (JSON.parse(v.content) as T.TemplateContent).documents.find((d) => d.id === p(req).docId);
        if (doc) break;
      }
    }
    if (!doc) throw notFound();
    return sendFile(reply, await ctx.blobs.get(doc.blob_id), 'application/pdf', `${doc.name}.pdf`, true);
  });
  app.post('/api/v1/templates/:id/publish', async (req) => {
    const pr = auth(req);
    const { note } = z.object({ note: z.string().max(500).default('') }).parse(req.body ?? {});
    return T.publishTemplate(ctx, pr, p(req).id, note);
  });
  app.post('/api/v1/templates/:id/duplicate', async (req, reply) => {
    const pr = auth(req);
    return reply.code(201).send(T.serializeTemplate(ctx, T.duplicateTemplate(ctx, pr, p(req).id)));
  });
  app.get('/api/v1/templates/:id/versions/:version', async (req) => {
    const pr = auth(req);
    T.loadTemplate(ctx, pr, p(req).id);
    const v = T.versionContent(ctx, p(req).id, Number(p(req).version));
    return { id: v.id, version: v.version, content: { ...v.content, documents: v.content.documents.map(({ text_excerpt, ...d }) => d) } };
  });
  app.post('/api/v1/templates/:id/envelopes', async (req, reply) => {
    const pr = auth(req);
    return idempotent(ctx, req, reply, pr, async () => {
      const r = T.useTemplate(ctx, pr, p(req).id, req.body);
      return { status: 201, body: { ...E.serializeEnvelope(ctx, r.envelope), signing_links: r.links } };
    });
  });
  app.get('/api/v1/templates/:id/bulk-template.csv', async (req, reply) => {
    const pr = auth(req);
    const csv = T.bulkCsvTemplate(ctx, pr, p(req).id);
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="massenversand-vorlage.csv"').send(csv);
  });
  app.post('/api/v1/templates/:id/bulk', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const pr = auth(req);
    const file = await readUpload(req, 5 * 1024 * 1024);
    const rows = await T.parseBulkFile(file.bytes, file.name);
    const qq = q(req);
    return T.bulkSend(ctx, pr, p(req).id, rows, { dryRun: qq.dry_run !== 'false', acknowledgeFormRisk: qq.acknowledge_form_risk === 'true' });
  });

  // ───────────── Ordner ─────────────
  app.get('/api/v1/folders', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.read');
    return { data: ctx.db.prepare('SELECT id, name, created_at FROM folders WHERE org_id = ? ORDER BY name').all(pr.orgId) };
  });
  app.post('/api/v1/folders', async (req, reply) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const fid = id('fld');
    ctx.db.prepare('INSERT INTO folders (id, org_id, name, created_at) VALUES (?, ?, ?, ?)').run(fid, pr.orgId, name, ctx.now().toISOString());
    return reply.code(201).send({ id: fid, name });
  });
  app.patch('/api/v1/folders/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const r = ctx.db.prepare('UPDATE folders SET name = ? WHERE id = ? AND org_id = ?').run(name, p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });
  app.delete('/api/v1/folders/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const r = ctx.db.prepare('DELETE FROM folders WHERE id = ? AND org_id = ?').run(p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });

  // ───────────── Kontakte (wiederkehrende Unterzeichner) ─────────────
  app.get('/api/v1/contacts', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'contacts.read');
    const s = q(req).search ? '%' + q(req).search.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : '%';
    return { data: ctx.db.prepare(`SELECT id, name, email, phone, note, last_used_at, use_count FROM contacts WHERE org_id = ? AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY use_count DESC, last_used_at DESC LIMIT 50`).all(pr.orgId, s, s) };
  });
  app.delete('/api/v1/contacts/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'envelope.write');
    const r = ctx.db.prepare('DELETE FROM contacts WHERE id = ? AND org_id = ?').run(p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    logActivity(ctx, actorRef(pr), 'contact.deleted', p(req).id);
    return { ok: true };
  });

  // ───────────── Öffentliche Formulare ─────────────
  app.get('/api/v1/public-forms', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.read');
    return { data: ctx.db.prepare(`SELECT f.*, t.name AS template_name FROM public_forms f JOIN templates t ON t.id = f.template_id WHERE f.org_id = ? ORDER BY f.created_at DESC`).all(pr.orgId).map((f: any) => ({ ...f, url: `${ctx.cfg.appUrl}/f/${f.slug}`, active: !!f.active, require_otp: !!f.require_otp })) };
  });
  app.post('/api/v1/public-forms', async (req, reply) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const b = z.object({ template_id: z.string(), title: z.string().min(1).max(160), require_otp: z.boolean().default(true), max_submissions: z.number().int().min(1).max(100000).nullable().optional(), expires_at: z.string().datetime().nullable().optional() }).parse(req.body);
    const t = T.loadTemplate(ctx, pr, b.template_id);
    const v = T.versionContent(ctx, t.id);
    const pub = v.content.roles.filter((r) => r.public);
    if (pub.length !== 1) throw badRequest('public_role', 'Die Vorlage braucht genau eine Rolle „im öffentlichen Formular ausfüllen“.');
    for (const r of v.content.roles) if (!r.public && (!r.default_name || !r.default_email)) throw badRequest('fixed_roles', `Die Rolle „${r.name}“ braucht feste Angaben (Name und E-Mail) in der Vorlage.`);
    const fid = id('pf');
    const slug = secretToken(9);
    ctx.db.prepare('INSERT INTO public_forms (id, org_id, template_id, slug, title, require_otp, max_submissions, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(fid, pr.orgId, t.id, slug, b.title, b.require_otp ? 1 : 0, b.max_submissions ?? null, b.expires_at ?? null, pr.kind === 'user' ? pr.userId : pr.keyId, ctx.now().toISOString());
    logActivity(ctx, actorRef(pr), 'public_form.created', fid);
    return reply.code(201).send({ id: fid, slug, url: `${ctx.cfg.appUrl}/f/${slug}` });
  });
  app.patch('/api/v1/public-forms/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const b = z.object({ active: z.boolean().optional(), title: z.string().min(1).max(160).optional(), max_submissions: z.number().int().min(1).nullable().optional() }).parse(req.body);
    const r = ctx.db.prepare('UPDATE public_forms SET active = COALESCE(?, active), title = COALESCE(?, title), max_submissions = CASE WHEN ? THEN ? ELSE max_submissions END WHERE id = ? AND org_id = ?').run(b.active === undefined ? null : b.active ? 1 : 0, b.title ?? null, b.max_submissions !== undefined ? 1 : 0, b.max_submissions ?? null, p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });
  app.delete('/api/v1/public-forms/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'template.write');
    const r = ctx.db.prepare('DELETE FROM public_forms WHERE id = ? AND org_id = ?').run(p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });

  // ───────────── Organisation, Branding, Einstellungen ─────────────
  app.patch('/api/v1/org', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'org.manage');
    const b = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        custom_domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).nullable().optional(),
        branding: z
          .object({
            accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            senderName: z.string().max(120).optional(),
            replyTo: z.string().email().or(z.literal('')).optional(),
            footer: z.string().max(500).optional(),
            mail: z.record(z.enum(['signing_request', 'reminder', 'completed']), z.object({ subject: z.string().max(250), body: z.string().max(4000) })).optional(),
          })
          .optional(),
        settings: z
          .object({
            envelopeVisibility: z.enum(['own', 'org']).optional(),
            retentionDays: z.number().int().min(30).max(36500).nullable().optional(),
            attachCompletedPdf: z.boolean().optional(),
            appendCertificate: z.boolean().optional(),
            defaultExpiryDays: z.number().int().min(1).max(365).optional(),
            defaultReminderDays: z.number().int().min(0).max(30).optional(),
            embedOrigins: z.array(z.string().url().max(200)).max(20).optional(),
            timezone: z.string().max(60).optional(),
            locale: z.enum(['de', 'en']).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const org = getOrg(ctx, pr.orgId);
    if (b.settings?.timezone) {
      try {
        new Intl.DateTimeFormat('de', { timeZone: b.settings.timezone });
      } catch {
        throw badRequest('timezone', 'Unbekannte Zeitzone');
      }
    }
    if (b.custom_domain && ctx.db.prepare('SELECT 1 FROM orgs WHERE custom_domain = ? AND id != ?').get(b.custom_domain, pr.orgId)) throw badRequest('domain_taken', 'Diese Domain ist bereits vergeben.');
    const branding: Branding = { ...org.branding, ...(b.branding ?? {}) };
    if (b.branding?.mail) branding.mail = { ...(org.branding.mail ?? {}), ...b.branding.mail };
    const settings: OrgSettings = { ...org.settings, ...(b.settings ?? {}) } as OrgSettings;
    if (b.settings?.embedOrigins) settings.embedOrigins = b.settings.embedOrigins.map((o) => new URL(o).origin);
    ctx.db.prepare('UPDATE orgs SET name = ?, branding = ?, settings = ?, custom_domain = CASE WHEN ? THEN ? ELSE custom_domain END WHERE id = ?').run(b.name ?? org.name, JSON.stringify(branding), JSON.stringify(settings), b.custom_domain !== undefined ? 1 : 0, b.custom_domain ?? null, pr.orgId);
    logActivity(ctx, actorRef(pr), 'org.updated', pr.orgId, { fields: Object.keys(b) });
    return { ok: true, org: getOrg(ctx, pr.orgId) };
  });

  app.post('/api/v1/org/logo', { bodyLimit: 3 * 1024 * 1024 }, async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'org.manage');
    const f = await readUpload(req, 1024 * 1024);
    const head = f.bytes.subarray(0, 4).toString('latin1');
    const { sanitizePng } = await import('../domain/signing.js');
    if (!head.startsWith('\x89PNG')) throw badRequest('logo_type', 'Bitte ein PNG-Logo hochladen (max. 1 MB).');
    let clean: Buffer;
    try {
      clean = sanitizePng(f.bytes);
    } catch {
      throw badRequest('logo_invalid', 'Das Logo ist ungültig oder leer.');
    }
    const blob = await ctx.blobs.put(clean, { orgId: pr.orgId, mime: 'image/png', kind: 'logo' });
    const org = getOrg(ctx, pr.orgId);
    ctx.db.prepare('UPDATE orgs SET branding = ? WHERE id = ?').run(JSON.stringify({ ...org.branding, logoBlobId: blob.id }), pr.orgId);
    return { ok: true };
  });
  app.delete('/api/v1/org/logo', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'org.manage');
    const org = getOrg(ctx, pr.orgId);
    const { logoBlobId, ...rest } = org.branding;
    ctx.db.prepare('UPDATE orgs SET branding = ? WHERE id = ?').run(JSON.stringify(rest), pr.orgId);
    return { ok: true };
  });

  app.post('/api/v1/orgs', async (req, reply) => {
    const pr = userOnly(req);
    if (!pr.instanceAdmin) throw forbidden('Nur Instanz-Administratoren können neue Organisationen anlegen.');
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
    const orgId = tx(ctx.db, () => {
      const oid = createOrg(ctx, name);
      ctx.db.prepare(`INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`).run(oid, pr.userId, ctx.now().toISOString());
      return oid;
    });
    logActivity(ctx, { orgId, userId: pr.userId }, 'org.created', orgId);
    return reply.code(201).send({ id: orgId });
  });

  app.get('/api/v1/org/seal', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'org.manage');
    const s = await getSealKey(ctx, pr.orgId);
    return { subject: s.info.subject, certificate_sha256: s.info.sha256, not_after: s.info.notAfter, source: s.source, pem: s.info.pem, timestamp_authority: ctx.cfg.tsaUrl ?? null };
  });
  app.post('/api/v1/org/seal', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'org.manage');
    if (pr.role !== 'owner') throw forbidden('Nur Inhaber können das Siegelzertifikat ersetzen.');
    const b = z.object({ key_pem: z.string().max(20000), chain_pem: z.string().max(60000), label: z.string().max(120).default('Eigenes Siegelzertifikat') }).parse(req.body);
    try {
      const info = await importOrgSealKey(ctx, pr.orgId, b.key_pem, b.chain_pem, b.label);
      logActivity(ctx, actorRef(pr), 'seal.imported', pr.orgId, { subject: info.subject });
      return { ok: true, subject: info.subject, certificate_sha256: info.sha256 };
    } catch (e: any) {
      throw badRequest('seal_invalid', e?.message ?? 'Ungültiger Schlüssel');
    }
  });

  // ───────────── Team ─────────────
  app.get('/api/v1/members', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'envelope.read');
    const members = listMembers(ctx, pr.orgId) as any[];
    const invites = can(pr, 'members.manage') ? ctx.db.prepare('SELECT id, email, role, expires_at, created_at FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').all(pr.orgId, ctx.now().toISOString()) : [];
    return { data: members.map((m) => ({ ...m, totp_enabled: !!m.totp_enabled })), invitations: invites };
  });
  app.post('/api/v1/members/invite', async (req, reply) => {
    const pr = userOnly(req);
    requirePerm(pr, 'members.manage');
    const b = z.object({ email: z.string().email(), role: z.enum(['owner', 'admin', 'member', 'viewer']) }).parse(req.body);
    return reply.code(201).send(inviteMember(ctx, pr, b.email, b.role as Role));
  });
  app.delete('/api/v1/invitations/:id', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'members.manage');
    const r = ctx.db.prepare('UPDATE invitations SET revoked_at = ? WHERE id = ? AND org_id = ?').run(ctx.now().toISOString(), p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });
  app.patch('/api/v1/members/:userId', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'members.manage');
    setMemberRole(ctx, pr, p(req).userId, z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) }).parse(req.body).role as Role);
    return { ok: true };
  });
  app.delete('/api/v1/members/:userId', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'members.manage');
    removeMember(ctx, pr, p(req).userId);
    return { ok: true };
  });

  // ───────────── API-Schlüssel ─────────────
  app.get('/api/v1/api-keys', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'apikeys.manage');
    return { data: (ctx.db.prepare('SELECT id, name, prefix, scopes, mode, created_at, last_used_at, expires_at, revoked_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC').all(pr.orgId) as any[]).map((k) => ({ ...k, scopes: JSON.parse(k.scopes) })), scopes: SCOPES };
  });
  app.post('/api/v1/api-keys', async (req, reply) => {
    const pr = userOnly(req);
    requirePerm(pr, 'apikeys.manage');
    const b = z.object({ name: z.string().max(80), scopes: z.array(z.string()), mode: z.enum(['live', 'test']).default('live'), expires_in_days: z.number().int().min(1).max(3650).optional() }).parse(req.body);
    return reply.code(201).send(createApiKey(ctx, pr, b));
  });
  app.delete('/api/v1/api-keys/:id', async (req) => {
    const pr = userOnly(req);
    requirePerm(pr, 'apikeys.manage');
    const r = ctx.db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL').run(ctx.now().toISOString(), p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    logActivity(ctx, actorRef(pr), 'apikey.revoked', p(req).id);
    return { ok: true };
  });

  // ───────────── Webhooks ─────────────
  const validateHookUrl = async (url: string) => {
    try {
      const policy = { allowPrivate: ctx.cfg.webhookAllowPrivate, allowHosts: ctx.cfg.webhookAllowHosts };
      // Schon beim Anlegen auflösen: interne Ziele sofort ablehnen (bei der Zustellung wird erneut geprüft)
      await resolveSafe(checkUrlShape(url, policy), policy);
    } catch (e) {
      if (e instanceof SsrfError) throw badRequest('webhook_url', e.message);
      throw e;
    }
  };
  app.get('/api/v1/webhooks', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const hooks = ctx.db.prepare('SELECT id, url, events, description, mode, active, created_at FROM webhooks WHERE org_id = ? ORDER BY created_at DESC').all(pr.orgId) as any[];
    return {
      data: hooks.map((h) => ({ ...h, events: JSON.parse(h.events), active: !!h.active, recent: ctx.db.prepare('SELECT id, event_type, status, attempts, last_status_code, last_error, created_at, delivered_at FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 10').all(h.id) })),
      events: WEBHOOK_EVENTS,
    };
  });
  app.post('/api/v1/webhooks', async (req, reply) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const b = z.object({ url: z.string().url().max(500), events: z.array(z.string()).min(1), description: z.string().max(200).default(''), mode: z.enum(['live', 'test']).optional() }).parse(req.body);
    await validateHookUrl(b.url);
    const events = b.events.filter((e) => e === '*' || (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (!events.length) throw badRequest('events', 'Keine gültigen Ereignisse gewählt.');
    const wid = id('wh');
    const secret = newWebhookSecret();
    const mode = pr.kind === 'apikey' ? pr.mode : b.mode ?? 'live';
    ctx.db.prepare('INSERT INTO webhooks (id, org_id, url, events, secret_enc, description, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(wid, pr.orgId, b.url, JSON.stringify(events), encryptSecret(ctx, wid, secret), b.description, mode, ctx.now().toISOString());
    logActivity(ctx, actorRef(pr), 'webhook.created', wid, { url: b.url });
    return reply.code(201).send({ id: wid, secret, url: b.url, events, mode });
  });
  app.patch('/api/v1/webhooks/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const b = z.object({ url: z.string().url().max(500).optional(), events: z.array(z.string()).min(1).optional(), description: z.string().max(200).optional(), active: z.boolean().optional() }).parse(req.body);
    if (b.url) await validateHookUrl(b.url);
    const r = ctx.db.prepare('UPDATE webhooks SET url = COALESCE(?, url), events = COALESCE(?, events), description = COALESCE(?, description), active = COALESCE(?, active) WHERE id = ? AND org_id = ?').run(b.url ?? null, b.events ? JSON.stringify(b.events) : null, b.description ?? null, b.active === undefined ? null : b.active ? 1 : 0, p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });
  app.delete('/api/v1/webhooks/:id', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const r = ctx.db.prepare('DELETE FROM webhooks WHERE id = ? AND org_id = ?').run(p(req).id, pr.orgId);
    if (!r.changes) throw notFound();
    return { ok: true };
  });
  app.post('/api/v1/webhooks/:id/test', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const h = ctx.db.prepare('SELECT * FROM webhooks WHERE id = ? AND org_id = ?').get(p(req).id, pr.orgId) as any;
    if (!h) throw notFound();
    const did = id('whd');
    const payload = JSON.stringify({ id: id('evt'), type: 'webhook.test', created_at: ctx.now().toISOString(), test_mode: h.mode === 'test', data: { message: 'Testereignis von Paraph' } });
    ctx.db.prepare(`INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status, created_at) VALUES (?, ?, 'webhook.test', ?, 'pending', ?)`).run(did, h.id, payload, ctx.now().toISOString());
    enqueue(ctx, 'webhook_delivery', { deliveryId: did });
    return { ok: true, delivery_id: did };
  });
  app.post('/api/v1/webhooks/deliveries/:id/retry', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'webhooks.manage');
    const d = ctx.db.prepare('SELECT d.id FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = ? AND w.org_id = ?').get(p(req).id, pr.orgId) as any;
    if (!d) throw notFound();
    ctx.db.prepare(`UPDATE webhook_deliveries SET status = 'pending', attempts = 0 WHERE id = ?`).run(d.id);
    enqueue(ctx, 'webhook_delivery', { deliveryId: d.id });
    return { ok: true };
  });

  // ───────────── Aktivität ─────────────
  app.get('/api/v1/activity', async (req) => {
    const pr = auth(req);
    requirePerm(pr, 'activity.read');
    const rows = ctx.db.prepare(`SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.org_id = ? ORDER BY a.id DESC LIMIT 200`).all(pr.orgId) as any[];
    const events = ctx.db.prepare(`SELECT ae.envelope_id, ae.ts, ae.type, ae.actor, e.title FROM audit_events ae JOIN envelopes e ON e.id = ae.envelope_id WHERE ae.org_id = ? AND e.test_mode = 0 ORDER BY ae.id DESC LIMIT 200`).all(pr.orgId) as any[];
    return { activity: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail) })), envelope_events: events.map((e) => ({ ...e, actor: JSON.parse(e.actor) })) };
  });

  // ───────────── Systemzustand (Instanz-Administration) ─────────────
  app.get('/api/v1/system', async (req) => {
    const pr = userOnly(req);
    if (!pr.instanceAdmin) throw forbidden('Nur für Instanz-Administratoren.');
    const lastBackup = ctx.db.prepare(`SELECT value FROM meta WHERE key = 'last_backup'`).get() as any;
    const failedJobs = ctx.db.prepare(`SELECT type, last_error, finished_at, run_at FROM jobs WHERE status = 'failed' ORDER BY run_at DESC LIMIT 10`).all();
    const failedMails = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM emails WHERE status = 'failed'`).get() as any).n;
    return {
      version: ctx.cfg.version,
      storage: ctx.cfg.s3 ? 's3' : 'local',
      master_key: ctx.cfg.masterKeySource,
      smtp: !!ctx.cfg.smtp,
      office_conversion: !!ctx.cfg.gotenbergUrl,
      timestamp_authority: ctx.cfg.tsaUrl ?? null,
      oidc: ctx.cfg.oidc ? { issuer: ctx.cfg.oidc.issuer, name: ctx.cfg.oidc.name } : null,
      sms: !!ctx.cfg.sms,
      qes: ctx.cfg.qes ? { name: ctx.cfg.qes.name, base_url: ctx.cfg.qes.baseUrl } : null,
      backup: { interval_hours: ctx.cfg.backup.intervalHours, keep: ctx.cfg.backup.keep, last: lastBackup ? JSON.parse(lastBackup.value) : null },
      failed_jobs: failedJobs,
      failed_mails: failedMails,
      counts: Object.fromEntries(['users', 'orgs', 'envelopes', 'templates', 'blobs'].map((t) => [t, (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n])),
    };
  });

  // ───────────── Formhinweise (Katalog) ─────────────
  app.get('/api/v1/form-rules', async (req) => {
    auth(req);
    return { data: FORM_RULES.map((r) => ({ id: r.id, norm: r.norm, label: r.label, min_level: r.minLevel, hint: r.hint, source: r.source, confidence: r.confidence, checklist: r.checklist ?? [] })) };
  });

  // ───────────── Live-Aktualisierung (Server-Sent Events) ─────────────
  app.get('/api/v1/events', async (req, reply) => {
    const pr = auth(req);
    requirePerm(pr, 'envelope.read');
    const org = getOrg(ctx, pr.orgId);
    const all = seesAllEnvelopes(pr, org.settings.envelopeVisibility);
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    reply.raw.write(': ok\n\n');
    const handler = (ev: any) => {
      const envId = ev.data?.envelope_id;
      if (!all && envId && pr.kind === 'user') {
        const e = ctx.db.prepare('SELECT owner_id FROM envelopes WHERE id = ?').get(envId) as any;
        if (!e || e.owner_id !== pr.userId) return;
      }
      reply.raw.write(`event: ${ev.type}\ndata: ${JSON.stringify({ type: ev.type, data: ev.data, ts: ev.ts })}\n\n`);
    };
    ctx.bus.on('org:' + pr.orgId, handler);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      ctx.bus.off('org:' + pr.orgId, handler);
    });
    return reply;
  });

  void DEFAULT_SETTINGS;
  void RECIPIENT_COLORS;
}
