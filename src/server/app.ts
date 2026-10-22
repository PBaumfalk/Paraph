import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import type { Ctx } from './context.js';
import { AppError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { signRoutes } from './routes/sign.js';
import { publicRoutes } from './routes/public.js';
import { openapiRoutes } from './routes/openapi.js';
import { hashToken } from './lib/crypto.js';
import { getOrg } from './domain/orgs.js';
// Job-Handler registrieren
import './domain/mail.js';
import './domain/webhooks.js';
import './domain/finalize.js';
import './domain/maintenance.js';
import './domain/backup.js';

function webRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, '../web'), join(here, '../../dist/web'), join(process.cwd(), 'dist/web')]) {
    // Nur gebaute Oberflächen (mit assets/); src/web/index.html ist die Vite-Quelle (Start per tsx)
    if (existsSync(join(p, 'index.html')) && existsSync(join(p, 'assets'))) return p;
  }
  return null;
}

export function csp(frameAncestors: string) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

export async function buildApp(ctx: Ctx): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: ctx.cfg.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: false,
    genReqId: () => Math.random().toString(36).slice(2, 10),
  });

  await app.register(cookie);
  // Begrenzung nur für die API; statische Dateien der Oberfläche bleiben immer erreichbar
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', keyGenerator: (req) => req.ip, allowList: (req) => !req.url.startsWith('/api/') });
  await app.register(multipart, { limits: { fileSize: ctx.cfg.maxUploadBytes, files: 1, fields: 10 } });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-opener-policy', 'same-origin');
    reply.header('cross-origin-resource-policy', 'same-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (ctx.cfg.appUrl.startsWith('https://')) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    if (!reply.getHeader('content-security-policy')) reply.header('content-security-policy', csp("'none'"));
    if (!reply.getHeader('x-frame-options') && !String(reply.getHeader('content-security-policy')).includes('frame-ancestors http')) reply.header('x-frame-options', 'DENY');
    if (req.url.startsWith('/api/') && !reply.getHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    // Datensparsam: keine Query-Strings (können Tokens enthalten), keine Bodies
    const path = req.url.split('?')[0].replace(/\/(s|embed\/s|invite|reset|f)\/[A-Za-z0-9_-]+/, '/$1/…');
    ctx.log.info({ method: req.method, path, status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, 'request');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'invalid_request', message: 'Ungültige Eingabe', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
    }
    if (err.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Zu viele Anfragen. Bitte kurz warten.' } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) return reply.code(413).send({ error: { code: 'file_too_large', message: 'Datei zu groß.' } });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: err.code ?? 'bad_request', message: err.message } });
    ctx.log.error({ err, path: req.url.split('?')[0] }, 'Unerwarteter Fehler');
    return reply.code(500).send({ error: { code: 'internal', message: 'Interner Fehler. Bitte erneut versuchen.' } });
  });

  authRoutes(app, ctx);
  apiRoutes(app, ctx);
  signRoutes(app, ctx);
  publicRoutes(app, ctx);
  openapiRoutes(app, ctx);

  const root = webRoot();
  const indexHtml = root ? readFileSync(join(root, 'index.html'), 'utf8') : null;
  if (root) {
    await app.register(fstatic, {
      root,
      prefix: '/',
      wildcard: false,
      index: false,
      setHeaders: (res: any, path: string) => {
        if (/\/assets\//.test(path)) (res.header ?? res.setHeader).call(res, 'cache-control', 'public, max-age=31536000, immutable');
      },
    });
  }

  // SPA: alle übrigen GET-Routen liefern die Oberfläche
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: { code: 'not_found', message: 'Nicht gefunden' } });
    if (!indexHtml) return reply.code(503).type('text/plain').send('Oberfläche nicht gebaut (npm run build).');
    let ancestors = "'none'";
    const m = /^\/embed\/s\/([A-Za-z0-9_-]{20,100})/.exec(req.url);
    if (m) {
      const s = ctx.db.prepare(`SELECT s.origin, e.org_id FROM signer_sessions s JOIN recipients r ON r.id = s.recipient_id JOIN envelopes e ON e.id = r.envelope_id WHERE s.id_hash = ? AND s.kind = 'embed'`).get(hashToken(m[1])) as any;
      if (s) {
        const origins = s.origin ? [s.origin] : getOrg(ctx, s.org_id).settings.embedOrigins;
        if (origins.length) ancestors = origins.join(' ');
      }
    }
    reply.header('content-security-policy', csp(ancestors));
    reply.header('cache-control', 'no-store');
    return reply.type('text/html; charset=utf-8').send(indexHtml);
  });

  return app;
}
