// Öffentliche Endpunkte: Gesundheit, Prüfstelle, öffentliche Formulare, Logos.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessSync, constants } from 'node:fs';
import type { Ctx } from '../context.js';
import { meta } from '../http.js';
import { AppError, badRequest, gone, notFound, tooMany } from '../lib/errors.js';
import { hashToken, id, numericCode, safeEqual, sha256Hex } from '../lib/crypto.js';
import { schemaVersion } from '../db/index.js';
import { listAudit, verifyChain } from '../domain/audit.js';
import { getOrg } from '../domain/orgs.js';
import { useTemplate, versionContent } from '../domain/templates.js';
import { queueMail } from '../domain/mail.js';
import { createSession, signerView, sessionFrom } from '../domain/signing.js';
import { verifyPdfSignatures } from '../pdf/verify.js';
import { metrics } from '../domain/diagnostics.js';
import { envRow } from '../domain/envelopes.js';
import type { Principal } from '../domain/authz.js';

const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/health', { config: { rateLimit: false } } as any, async () => ({ status: 'ok', version: ctx.cfg.version }));

  app.get('/api/health/ready', { config: { rateLimit: false } } as any, async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      ctx.db.prepare('SELECT 1').get();
      checks.database = true;
    } catch {
      checks.database = false;
    }
    try {
      accessSync(ctx.cfg.dataDir, constants.W_OK);
      checks.storage = true;
    } catch {
      checks.storage = false;
    }
    const failedJobs = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'failed'`).get() as any).n;
    const ok = Object.values(checks).every(Boolean);
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks, schema: schemaVersion(ctx.db), failed_jobs: failedJobs, version: ctx.cfg.version });
  });

  // Prometheus-Metriken (nur Zählwerte). Ohne METRICS_TOKEN abgeschaltet.
  app.get('/metrics', { config: { rateLimit: false } } as any, async (req, reply) => {
    const tok = ctx.cfg.metricsToken;
    const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!tok || !given || !safeEqual(given, tok)) return reply.code(404).send({ error: { code: 'not_found', message: 'Nicht gefunden' } });
    return reply.type('text/plain; version=0.0.4; charset=utf-8').header('cache-control', 'no-store').send(metrics(ctx));
  });

  app.get('/api/public/orgs/:id/logo', limit(120), async (req, reply) => {
    const org = getOrg(ctx, (req.params as any).id);
    if (!org.branding.logoBlobId) throw notFound();
    const meta_ = ctx.blobs.meta(org.branding.logoBlobId);
    if (!meta_ || meta_.org_id !== org.id) throw notFound();
    return reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=3600').header('x-content-type-options', 'nosniff').send(await ctx.blobs.get(org.branding.logoBlobId));
  });

  // ───────────── Prüfstelle ─────────────
  // Hash-Abfrage: der Browser berechnet den SHA-256 lokal; das Dokument verlässt das Gerät nicht.
  app.post('/api/public/verify/hash', limit(30), async (req) => {
    const { sha256 } = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) }).parse(req.body);
    const all = ctx.db.prepare('SELECT * FROM hash_register WHERE sha256 = ?').all(sha256) as any[];
    if (!all.length) return { found: false };
    // Bei einem Einzeldokument sind Gesamt-PDF und Einzeldokument dieselbe Datei: je Vorgang nur ein Treffer
    const rank = ['final', 'final_document', 'certificate', 'evidence', 'audit', 'authoritative', 'source'];
    const hits = [...new Map(all.sort((a, b) => rank.indexOf(b.kind) - rank.indexOf(a.kind)).map((h) => [h.envelope_id, h])).values()]; // letzter Eintrag gewinnt → höchster Rang zuletzt
    const out = hits.map((h) => {
      const env = envRow(ctx, h.envelope_id);
      const org = getOrg(ctx, h.org_id);
      const events = listAudit(ctx.db, h.envelope_id);
      const chain = verifyChain(h.envelope_id, events);
      const signers = (ctx.db.prepare(`SELECT name, kind, completed_at FROM recipients WHERE envelope_id = ? AND status = 'completed' AND kind != 'viewer' ORDER BY completed_at`).all(h.envelope_id) as any[]);
      return {
        kind: h.kind,
        label: h.label,
        envelope: { id: h.envelope_id, title: env?.title, status: env?.status, completed_at: env?.completed_at, test_mode: !!env?.test_mode },
        org: org.name,
        signers,
        audit_chain: { ok: chain.ok, events: chain.count },
        registered_at: h.created_at,
      };
    });
    return { found: true, matches: out };
  });

  // Optionale Siegelprüfung: Datei wird nur im Arbeitsspeicher verarbeitet und nicht gespeichert.
  app.post('/api/public/verify/signature', { ...limit(10), bodyLimit: 60 * 1024 * 1024 }, async (req) => {
    if (!req.isMultipart()) throw badRequest('multipart', 'Datei als multipart/form-data senden.');
    const f = await req.file({ limits: { fileSize: ctx.cfg.maxUploadBytes, files: 1 } });
    if (!f) throw badRequest('file_missing', 'Keine Datei.');
    const bytes = await f.toBuffer();
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('pdf_invalid', 'Kein PDF.');
    const sha = sha256Hex(bytes);
    const sigs = await verifyPdfSignatures(bytes);
    const known = new Set((ctx.db.prepare('SELECT cert_chain FROM seal_keys').all() as any[]).map((r) => sha256Hex(Buffer.from(JSON.parse(r.cert_chain)[0], 'base64'))));
    const registered = !!ctx.db.prepare('SELECT 1 FROM hash_register WHERE sha256 = ?').get(sha);
    return {
      sha256: sha,
      registered,
      signatures: sigs.map((s, i) => {
        const own = known.has(s.certSha256);
        const intact = s.signatureOk && s.digestOk && s.contentsOk && !s.error;
        // Gesamturteil: nur die letzte Signatur muss die ganze Datei abdecken; Zeitstempel muss – falls vorhanden – geprüft sein
        const last = i === sigs.length - 1;
        const verdict = !intact ? 'invalid' : !own ? 'foreign' : last && !s.coversWholeFile ? 'modified' : s.timestampOk === false ? 'timestamp_invalid' : 'valid';
        return { ...s, issued_by_this_instance: own, verdict };
      }),
    };
  });

  // ───────────── Öffentliche Formulare ─────────────
  function loadForm(slug: string) {
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) throw notFound('Formular nicht gefunden');
    const f = ctx.db.prepare('SELECT * FROM public_forms WHERE slug = ?').get(slug) as any;
    if (!f || !f.active) throw notFound('Formular nicht gefunden oder deaktiviert');
    if (f.expires_at && new Date(f.expires_at) <= ctx.now()) throw gone('form_expired', 'Dieses Formular ist nicht mehr verfügbar.');
    if (f.max_submissions && f.submissions >= f.max_submissions) throw gone('form_full', 'Dieses Formular nimmt keine weiteren Einsendungen an.');
    return f;
  }

  app.get('/api/public/forms/:slug', limit(60), async (req) => {
    const f = loadForm((req.params as any).slug);
    const org = getOrg(ctx, f.org_id);
    const v = versionContent(ctx, f.template_id);
    return {
      title: f.title,
      require_otp: !!f.require_otp,
      org: { name: org.name, accent: org.branding.accent, logo: org.branding.logoBlobId ? `/api/public/orgs/${org.id}/logo` : null },
      documents: v.content.documents.map((d) => ({ name: d.name, pages: d.pages.length })),
      role: v.content.roles.find((r) => r.public)?.name,
    };
  });

  function startEnvelope(f: any, name: string, email: string, req: any) {
    const principal: Principal = { kind: 'apikey', keyId: `public_form:${f.id}`, orgId: f.org_id, scopes: ['envelopes:write', 'templates:read'], mode: 'live', name: `Öffentliches Formular „${f.title}“`, createdBy: f.created_by };
    const v = versionContent(ctx, f.template_id);
    const role = v.content.roles.find((r) => r.public)!;
    const r = useTemplate(ctx, principal, f.template_id, { recipients: { [role.key]: { name, email } }, send: true, notify: false }, { publicFormId: f.id });
    ctx.db.prepare('UPDATE public_forms SET submissions = submissions + 1 WHERE id = ?').run(f.id);
    const rec = ctx.db.prepare('SELECT * FROM recipients WHERE envelope_id = ? AND email = ? ORDER BY routing_order LIMIT 1').get(r.envelope.id, email.toLowerCase()) as any;
    // Andere, bereits aktive Rollen bekommen ihre E-Mail; die öffentliche Rolle signiert sofort
    const env = envRow(ctx, r.envelope.id)!;
    if (rec.status === 'waiting') throw new AppError(409, 'not_first', 'Die öffentliche Rolle ist nicht als Erste an der Reihe. Bitte Vorlage prüfen.');
    const s = createSession(ctx, rec, env, 'session', meta(req));
    ctx.db.prepare('UPDATE signer_sessions SET authenticated = 1, auth_method = ? WHERE id_hash = ?').run(f.require_otp ? 'email_otp' : 'link', hashToken(s.sessionToken));
    return s.sessionToken;
  }

  app.post('/api/public/forms/:slug/start', limit(5), async (req) => {
    const f = loadForm((req.params as any).slug);
    const b = z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().toLowerCase().email().max(254) }).parse(req.body);
    if (!f.require_otp) {
      const session = startEnvelope(f, b.name, b.email, req);
      return { session, view: signerView(ctx, sessionFrom(ctx, session)) };
    }
    const recent = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM meta WHERE key LIKE ? ESCAPE '\\'`).get(`pfotp:${f.id}:${hashToken(b.email)}:%`.replace(/_/g, '\\_')) as any).n;
    if (recent >= 3) throw tooMany('Zu viele Codes angefordert. Bitte später erneut versuchen.');
    const code = numericCode(6);
    const chId = id('pfc');
    ctx.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(`pfotp:${f.id}:${hashToken(b.email)}:${chId}`, JSON.stringify({ chId, name: b.name, email: b.email, code: hashToken(chId + code), exp: ctx.now().getTime() + 600_000, tries: 0 }));
    queueMail(ctx, { orgId: f.org_id, to: b.email, kind: 'form_otp', vars: { code, title: f.title } });
    return { challenge: chId, otp_required: true };
  });

  app.post('/api/public/forms/:slug/confirm', limit(10), async (req) => {
    const f = loadForm((req.params as any).slug);
    const b = z.object({ challenge: z.string().regex(/^pfc_[A-Za-z0-9_-]{10,40}$/), code: z.string().max(12) }).parse(req.body);
    // LIKE-Platzhalter in den Bestandteilen maskieren: die Kennung muss exakt passen
    const like = (x: string) => x.replace(/[\\%_]/g, (c) => '\\' + c);
    const row = ctx.db.prepare(`SELECT key, value FROM meta WHERE key LIKE ? ESCAPE '\\'`).get(`${like(`pfotp:${f.id}:`)}%${like(`:${b.challenge}`)}`) as any;
    if (!row) throw new AppError(401, 'code_expired', 'Der Code ist abgelaufen. Bitte erneut anfordern.');
    const ch = JSON.parse(row.value);
    if (ch.exp < ctx.now().getTime() || ch.tries >= 5) {
      ctx.db.prepare('DELETE FROM meta WHERE key = ?').run(row.key);
      throw new AppError(401, 'code_expired', 'Der Code ist abgelaufen. Bitte erneut anfordern.');
    }
    if (!safeEqual(hashToken(ch.chId + b.code.replace(/\s/g, '')), ch.code)) {
      ch.tries++;
      ctx.db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(JSON.stringify(ch), row.key);
      throw new AppError(401, 'wrong_code', 'Der Code ist falsch.');
    }
    ctx.db.prepare('DELETE FROM meta WHERE key = ?').run(row.key);
    const session = startEnvelope(f, ch.name, ch.email, req);
    return { session, view: signerView(ctx, sessionFrom(ctx, session)) };
  });
}
