// Gemeinsame HTTP-Hilfen: Principal-Auflösung, CSRF, Idempotenz, Metadaten.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from './context.js';
import { AppError, forbidden, unauthorized } from './lib/errors.js';
import type { Principal } from './domain/authz.js';
import { principalFromApiKey, principalFromSession, readSession, type SessionInfo } from './domain/users.js';
import { canonicalJson, safeEqual, sha256Hex, sealString, openString } from './lib/crypto.js';

export const SESSION_COOKIE = 'paraph_session';
export const SIGNER_COOKIE = 'paraph_signer';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    session?: SessionInfo | null;
  }
}

export function meta(req: FastifyRequest) {
  return { ip: req.ip, ua: String(req.headers['user-agent'] ?? '') };
}

export function isSecure(ctx: Ctx) {
  return ctx.cfg.appUrl.startsWith('https://');
}

export function cookieOpts(ctx: Ctx, maxAgeSec: number, path = '/') {
  return { httpOnly: true, secure: isSecure(ctx), sameSite: 'lax' as const, path, maxAge: maxAgeSec };
}

/** Erlaubte Origins für zustandsändernde Anfragen mit Sitzungscookie. */
export function allowedOrigins(ctx: Ctx): Set<string> {
  const set = new Set([new URL(ctx.cfg.appUrl).origin]);
  for (const r of ctx.db.prepare('SELECT custom_domain FROM orgs WHERE custom_domain IS NOT NULL').all() as any[]) {
    set.add(`${new URL(ctx.cfg.appUrl).protocol}//${r.custom_domain}`);
  }
  return set;
}

export function checkOrigin(ctx: Ctx, req: FastifyRequest) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!allowedOrigins(ctx).has(origin)) throw forbidden('Anfrage von fremder Herkunft abgelehnt.');
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Ermittelt den Principal aus API-Schlüssel oder Sitzung; erzwingt CSRF-Schutz für Sitzungen. */
export function authenticate(ctx: Ctx, req: FastifyRequest, opts: { allowApiKey?: boolean } = {}): Principal {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    if (opts.allowApiKey === false) throw forbidden('Diese Funktion ist nur in der Oberfläche verfügbar.');
    const p = principalFromApiKey(ctx, auth.slice(7).trim());
    if (!p) throw new AppError(401, 'invalid_api_key', 'API-Schlüssel ungültig, abgelaufen oder widerrufen.');
    req.principal = p;
    return p;
  }
  const s = readSession(ctx, req.cookies?.[SESSION_COOKIE]);
  req.session = s;
  if (!s) throw unauthorized();
  if (UNSAFE.has(req.method)) {
    checkOrigin(ctx, req);
    const h = String(req.headers['x-csrf-token'] ?? '');
    if (!h || !safeEqual(h, s.csrf)) throw forbidden('Sicherheitsprüfung fehlgeschlagen (CSRF). Bitte Seite neu laden.');
  }
  const p = principalFromSession(ctx, s);
  if (!p) throw unauthorized(s.mfaPending ? 'Zwei-Faktor-Bestätigung ausstehend' : 'Keine Organisation zugeordnet');
  req.principal = p;
  return p;
}

export function principalKey(p: Principal) {
  return p.kind === 'user' ? `u:${p.userId}:${p.orgId}` : `k:${p.keyId}`;
}

/** Idempotency-Key: gleiche Anfrage → gleiche Antwort, abweichende Anfrage → 422. 48 Stunden gültig. */
export async function idempotent(ctx: Ctx, req: FastifyRequest, reply: FastifyReply, p: Principal, fn: () => Promise<{ status: number; body: unknown }>) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    const r = await fn();
    return reply.code(r.status).send(r.body);
  }
  if (key.length > 200) throw new AppError(400, 'idempotency_key', 'Idempotency-Key zu lang');
  const scope = principalKey(p);
  const reqHash = sha256Hex(canonicalJson({ m: req.method, u: req.url, b: req.body ?? null }));
  const prev = ctx.db.prepare('SELECT * FROM idempotency_keys WHERE scope = ? AND key = ?').get(scope, key) as any;
  if (prev) {
    if (prev.request_hash !== reqHash) throw new AppError(422, 'idempotency_mismatch', 'Idempotency-Key wurde bereits für eine andere Anfrage verwendet.');
    reply.header('idempotent-replayed', 'true');
    return reply.code(prev.status_code).send(JSON.parse(openString(ctx.keys.secrets, prev.response, 'idem:' + scope + ':' + key)));
  }
  const r = await fn();
  if (r.status < 500) {
    ctx.db
      .prepare('INSERT OR IGNORE INTO idempotency_keys (scope, key, request_hash, status_code, response, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      // Antworten können Signaturlinks enthalten → nur verschlüsselt zwischenspeichern
      .run(scope, key, reqHash, r.status, sealString(ctx.keys.secrets, JSON.stringify(r.body ?? null), 'idem:' + scope + ':' + key), ctx.now().toISOString());
  }
  return reply.code(r.status).send(r.body);
}

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function sendFile(reply: FastifyReply, data: Buffer, mime: string, filename: string, inline = false) {
  return reply
    .header('content-type', mime)
    .header('content-disposition', inline ? contentDisposition(filename).replace(/^attachment/, 'inline') : contentDisposition(filename))
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff')
    .send(data);
}
