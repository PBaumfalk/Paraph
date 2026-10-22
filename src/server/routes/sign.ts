// Endpunkte für externe Unterzeichner. Die Sitzung wird per Header übertragen (x-signer-session),
// nicht per Cookie: keine CSRF-Angriffsfläche und funktionsfähig in Einbettungen ohne Drittanbieter-Cookies.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { meta, sendFile } from '../http.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import * as S from '../domain/signing.js';
import { getOrg } from '../domain/orgs.js';

const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

export function signRoutes(app: FastifyInstance, ctx: Ctx) {
  const session = (req: FastifyRequest) => S.sessionFrom(ctx, String(req.headers['x-signer-session'] ?? '') || undefined);

  app.post('/api/sign/open', limit(30), async (req) => {
    const { token } = z.object({ token: z.string().max(120) }).parse(req.body);
    const s = S.openFromLink(ctx, token, meta(req));
    const sc = S.sessionFrom(ctx, s.sessionToken);
    return { session: s.sessionToken, view: S.signerView(ctx, sc) };
  });

  app.post('/api/sign/embed', limit(30), async (req) => {
    const { token } = z.object({ token: z.string().max(120) }).parse(req.body);
    const s = S.openFromEmbed(ctx, token, meta(req));
    const sc = S.sessionFrom(ctx, s.sessionToken);
    return { session: s.sessionToken, origin: s.origin, view: S.signerView(ctx, sc) };
  });

  app.get('/api/sign/view', limit(120), async (req) => S.signerView(ctx, session(req)));

  app.get('/api/sign/documents/:docId', limit(120), async (req, reply) => {
    const sc = session(req);
    const bytes = await S.documentBytes(ctx, sc, (req.params as any).docId);
    return sendFile(reply, bytes, 'application/pdf', 'dokument.pdf', true);
  });

  app.post('/api/sign/otp', limit(10), async (req) => S.requestOtp(ctx, session(req)));

  app.post('/api/sign/verify', limit(20), async (req) => {
    const { code } = z.object({ code: z.string().max(64) }).parse(req.body);
    const sc = session(req);
    S.verifyAuth(ctx, sc, code, meta(req));
    return S.signerView(ctx, session(req));
  });

  app.put('/api/sign/draft', limit(120), async (req) => {
    const values = z.record(z.string().max(64), z.string().max(5000)).parse(req.body);
    S.saveDraftValues(ctx, session(req), values);
    return { ok: true };
  });

  app.post('/api/sign/signatures', { ...limit(30), bodyLimit: 3 * 1024 * 1024 }, async (req) => {
    const b = z
      .object({ purpose: z.enum(['signature', 'initials']), method: z.enum(['drawn', 'typed', 'uploaded']), png_base64: z.string().max(2_100_000), typed_text: z.string().max(200).optional() })
      .parse(req.body);
    return S.adoptSignature(ctx, session(req), b);
  });

  app.post('/api/sign/attachments/:key', { ...limit(20), bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const sc = session(req);
    if (!req.isMultipart()) throw badRequest('multipart', 'Datei als multipart/form-data senden.');
    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    if (!file) throw badRequest('file_missing', 'Keine Datei.');
    const bytes = await file.toBuffer();
    if ((file.file as any).truncated) throw new AppError(413, 'file_too_large', 'Datei zu groß (max. 10 MB).');
    return S.uploadAttachment(ctx, sc, (req.params as any).key, { name: file.filename, bytes });
  });

  app.post('/api/sign/complete', limit(20), async (req) => {
    const b = z
      .object({
        values: z.record(z.string().max(64), z.string().max(5000)).default({}),
        signatures: z.record(z.string().max(64), z.string().max(80)).default({}),
        consent: z.object({ accepted: z.boolean(), version: z.string().max(40) }),
        document_hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(20),
        completion_key: z.string().max(80),
      })
      .parse(req.body);
    const sc = S.sessionFrom(ctx, String(req.headers['x-signer-session'] ?? '') || undefined);
    return S.complete(ctx, sc, b, meta(req));
  });

  app.post('/api/sign/decline', limit(10), async (req) => {
    const { reason } = z.object({ reason: z.string().max(1000).default('') }).parse(req.body ?? {});
    S.decline(ctx, session(req), reason, meta(req));
    return { ok: true };
  });

  app.post('/api/sign/delegate', limit(10), async (req) => {
    const b = z.object({ name: z.string().max(160), email: z.string().max(254), reason: z.string().max(500).optional() }).parse(req.body);
    return S.delegate(ctx, session(req), b, meta(req));
  });

  // Downloads nach Abschluss (nur für Beteiligte mit gültigem Link)
  app.get('/api/sign/final/:kind', limit(60), async (req, reply) => {
    const sc = session(req);
    if (sc.env.status !== 'completed') throw new AppError(409, 'not_completed', 'Das Dokument ist noch nicht von allen unterschrieben.');
    const res = ctx.db.prepare('SELECT * FROM envelope_results WHERE envelope_id = ?').get(sc.env.id) as any;
    if (!res) throw notFound();
    const kind = (req.params as any).kind;
    const base = sc.env.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120);
    if (kind === 'final') return sendFile(reply, await ctx.blobs.get(res.final_blob_id), 'application/pdf', `${base} – unterschrieben.pdf`);
    if (kind === 'certificate') return sendFile(reply, await ctx.blobs.get(res.certificate_blob_id), 'application/pdf', `${base} – Abschlussbestätigung.pdf`);
    if (kind === 'evidence') return sendFile(reply, await ctx.blobs.get(res.evidence_blob_id), 'application/zip', `${base} – Nachweispaket.zip`);
    throw notFound();
  });

  app.post('/api/sign/logout', async (req) => {
    const t = String(req.headers['x-signer-session'] ?? '');
    if (t) {
      const { hashToken } = await import('../lib/crypto.js');
      ctx.db.prepare('DELETE FROM signer_sessions WHERE id_hash = ?').run(hashToken(t));
    }
    return { ok: true };
  });

  void getOrg;
}
