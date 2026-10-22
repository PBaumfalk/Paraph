// S3-kompatibler Speicher (AWS Signature V4) für MinIO, Garage, Ceph, AWS S3 u. a.
// Inhalte sind bereits clientseitig verschlüsselt (siehe storage.ts); S3 sieht nur Chiffrat.
// Keine SDK-Abhängigkeit: PUT, GET, HEAD, DELETE und ListObjectsV2 genügen für die Blob-Ablage.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { BlobBackend } from './storage.js';

export interface S3Cfg {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Temporäre Zugangsdaten (STS): wird als x-amz-security-token mitsigniert. */
  sessionToken?: string;
  forcePathStyle: boolean;
  /** Schlüsselpräfix im Bucket, z. B. „paraph/“. Leer = Bucket-Wurzel. */
  prefix?: string;
}

export interface S3Options {
  /** Wiederholungen nach dem ersten Versuch bei 5xx, 429 und Netzwerkfehlern. */
  retries?: number;
  /** Grundwartezeit für den exponentiellen Backoff in ms. */
  retryBaseMs?: number;
  /** Zeitlimit je Versuch in ms. */
  timeoutMs?: number;
}

export interface S3ObjectInfo {
  size: number;
  etag: string;
  lastModified?: string;
}

/** Fehler mit S3-Code (z. B. „NoSuchKey“) und HTTP-Status. Die Meldung enthält nie Zugangsdaten. */
export class S3Error extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
    this.name = 'S3Error';
  }
}

export const PROBE_PREFIX = '_paraph-probe/';
const BLOB_KEY = /^[A-Za-z0-9_-]+$/;

const sha = (d: Buffer | string) => createHash('sha256').update(d).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();

/** URI-Kodierung nach RFC 3986, wie SigV4 sie verlangt (nur A–Z a–z 0–9 - . _ ~ bleiben stehen). */
export function rfc3986(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
const encodePath = (p: string) => p.split('/').map(rfc3986).join('/');

const xmlDecode = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : e === 'amp' ? '&' : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );
const xmlTag = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? xmlDecode(m[1]!) : undefined;
};

/** Bucketnamen, die als Subdomain taugen. Punkte brechen das Wildcard-Zertifikat, daher Pfadstil. */
const dnsCompatible = (b: string) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b);

/** Prüft und normalisiert S3_PREFIX: keine führenden Schrägstriche, immer mit „/“ am Ende. */
export function normalizePrefix(p: string | undefined) {
  const v = (p ?? '').trim().replace(/^\/+/, '');
  if (!v) return '';
  const withSlash = v.endsWith('/') ? v : v + '/';
  if (!/^[A-Za-z0-9!_.*'()\-/]+$/.test(withSlash) || withSlash.includes('//') || withSlash.split('/').some((seg) => seg === '.' || seg === '..'))
    throw new Error('S3_PREFIX enthält unzulässige Zeichen (erlaubt: Buchstaben, Ziffern, - _ . / ; keine leeren oder „.“/„..“-Abschnitte)');
  return withSlash;
}

function describe(code: string, status: number, ctx: { op: string; bucket: string; key?: string; region: string }): { msg: string; retryable: boolean } {
  const b = `„${ctx.bucket}“`;
  switch (code) {
    case 'NoSuchKey':
      return { msg: `Datei fehlt im Speicher (S3-Objekt ${ctx.key ?? ''} nicht gefunden)`, retryable: false };
    case 'NoSuchBucket':
      return { msg: `S3-Bucket ${b} existiert nicht – S3_BUCKET und S3_ENDPOINT prüfen`, retryable: false };
    case 'AccessDenied':
    case 'AllAccessDisabled':
      return { msg: `S3: Zugriff verweigert (${ctx.op}) – Bucket ${b} existiert nicht oder die Policy fehlt; benötigt werden s3:GetObject, s3:PutObject, s3:DeleteObject und s3:ListBucket`, retryable: false };
    case 'InvalidAccessKeyId':
      return { msg: 'S3: Zugangsschlüssel unbekannt – S3_ACCESS_KEY_ID prüfen', retryable: false };
    case 'SignatureDoesNotMatch':
      return { msg: 'S3: Signatur ungültig – S3_SECRET_ACCESS_KEY prüfen (bei Proxys auch, ob der Host-Header unverändert ankommt)', retryable: false };
    case 'RequestTimeTooSkewed':
    case 'RequestExpired':
      return { msg: 'S3: Systemzeit weicht zu stark von der Serverzeit ab (mehr als 15 Minuten) – Uhrzeit/NTP des Servers prüfen', retryable: false };
    case 'AuthorizationHeaderMalformed':
    case 'AuthorizationQueryParametersError':
      return { msg: `S3: Anmeldedaten passen nicht zur Region – S3_REGION prüfen (aktuell „${ctx.region}“)`, retryable: false };
    case 'PermanentRedirect':
    case 'IllegalLocationConstraintException':
      return { msg: `S3: Bucket ${b} liegt in einer anderen Region oder unter einem anderen Endpunkt – S3_REGION/S3_ENDPOINT prüfen`, retryable: false };
    case 'ExpiredToken':
    case 'TokenRefreshRequired':
      return { msg: 'S3: Sitzungstoken abgelaufen – S3_SESSION_TOKEN erneuern', retryable: false };
    case 'InvalidToken':
      return { msg: 'S3: Sitzungstoken ungültig – S3_SESSION_TOKEN prüfen', retryable: false };
    case 'BadDigest':
    case 'XAmzContentSHA256Mismatch':
    case 'InvalidDigest':
      return { msg: `S3: Prüfsumme beim Hochladen stimmt nicht – Übertragung beschädigt`, retryable: true };
    case 'SlowDown':
    case 'ServiceUnavailable':
    case 'InternalError':
    case 'RequestTimeout':
      return { msg: `S3: Dienst vorübergehend nicht verfügbar (${code})`, retryable: true };
  }
  if (status === 404) return ctx.key ? { msg: `Datei fehlt im Speicher (S3-Objekt ${ctx.key} nicht gefunden)`, retryable: false } : { msg: `S3-Bucket ${b} nicht gefunden`, retryable: false };
  if (status === 403) return { msg: `S3: Zugriff verweigert (${ctx.op}) – Zugangsdaten und Bucket-Policy prüfen`, retryable: false };
  if (status === 301 || status === 307) return { msg: `S3: Bucket ${b} erfordert einen anderen Endpunkt oder eine andere Region – S3_REGION/S3_ENDPOINT prüfen`, retryable: false };
  return { msg: `S3-Fehler bei ${ctx.op}: ${code || 'unbekannt'} (HTTP ${status})`, retryable: status >= 500 || status === 429 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class S3Backend implements BlobBackend {
  private base: URL;
  private pathStyle: boolean;
  readonly prefix: string;
  private retries: number;
  private retryBaseMs: number;
  private timeoutMs: number;

  constructor(
    private c: S3Cfg,
    opts: S3Options = {},
  ) {
    if (!c.bucket) throw new Error('S3_BUCKET fehlt');
    if (!c.accessKeyId || !c.secretAccessKey) throw new Error('S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY müssen gesetzt sein');
    if (!c.region) throw new Error('S3_REGION fehlt');
    const ep = c.endpoint || `https://s3.${c.region}.amazonaws.com`;
    try {
      this.base = new URL(ep);
    } catch {
      throw new Error('S3_ENDPOINT ist keine gültige URL (Beispiel: https://s3.eu-central-1.amazonaws.com)');
    }
    if (this.base.protocol !== 'https:' && this.base.protocol !== 'http:') throw new Error('S3_ENDPOINT muss mit https:// oder http:// beginnen');
    if (this.base.username || this.base.password) throw new Error('S3_ENDPOINT darf keine Zugangsdaten enthalten – S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY verwenden');
    if (this.base.search || this.base.hash) throw new Error('S3_ENDPOINT darf keine Query oder kein Fragment enthalten');
    // Virtual-hosted-Stil nur, wenn der Bucketname als Subdomain taugt (keine Punkte, nur Kleinbuchstaben).
    this.pathStyle = c.forcePathStyle || !dnsCompatible(c.bucket);
    this.prefix = normalizePrefix(c.prefix);
    this.retries = opts.retries ?? 3;
    this.retryBaseMs = opts.retryBaseMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  /** Vollständige URL für einen Objektschlüssel (inkl. Präfix) oder den Bucket (key = undefined). */
  private url(objectKey: string | undefined, query: Record<string, string> = {}) {
    const basePath = this.base.pathname.replace(/\/+$/, '');
    const objPath = objectKey === undefined ? '' : '/' + encodePath(objectKey);
    let host = this.base.host;
    let path: string;
    if (this.pathStyle) path = `${basePath}/${rfc3986(this.c.bucket)}${objPath || '/'}`;
    else {
      host = `${this.c.bucket}.${this.base.host}`;
      path = `${basePath}${objPath || '/'}`;
    }
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${rfc3986(k)}=${rfc3986(query[k]!)}`)
      .join('&');
    const u = new URL(`${this.base.protocol}//${host}${path}${qs ? '?' + qs : ''}`);
    return { u, canonicalQuery: qs };
  }

  private blobKey(key: string) {
    if (!BLOB_KEY.test(key)) throw new Error('Ungültiger Blob-Schlüssel');
    return this.prefix + key;
  }

  private sign(method: string, u: URL, canonicalQuery: string, payloadHash: string, extra: Record<string, string>) {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const headers: Record<string, string> = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extra };
    if (this.c.sessionToken) headers['x-amz-security-token'] = this.c.sessionToken;
    const signed = Object.keys(headers).sort();
    // u.pathname ist bereits RFC-3986-kodiert; S3 kodiert den Pfad nicht doppelt.
    const canonical = [method, u.pathname, canonicalQuery, ...signed.map((h) => `${h}:${headers[h]!.trim()}`), '', signed.join(';'), payloadHash].join('\n');
    const scope = `${date}/${this.c.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
    const kDate = hmac('AWS4' + this.c.secretAccessKey, date);
    const kSigning = hmac(hmac(hmac(kDate, this.c.region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
    const { host, ...rest } = headers;
    void host; // setzt fetch selbst
    return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${this.c.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}` };
  }

  /**
   * Signiert und sendet eine Anfrage. Wiederholt bei 5xx/429/Netzwerkfehlern/Zeitüberschreitung mit
   * exponentiellem Backoff; 4xx-Fehler werden sofort als S3Error gemeldet.
   */
  private async req(method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', objectKey: string | undefined, opts: { body?: Buffer; query?: Record<string, string>; op: string; allow404?: boolean }) {
    const body = opts.body ?? Buffer.alloc(0);
    const payloadHash = sha(body);
    const extra: Record<string, string> = {};
    if (method === 'PUT') extra['content-md5'] = createHash('md5').update(body).digest('base64');
    const where = { op: opts.op, bucket: this.c.bucket, key: objectKey, region: this.c.region };
    let lastErr: S3Error | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(this.retryBaseMs * 2 ** (attempt - 1) * (0.5 + Math.random()));
      const { u, canonicalQuery } = this.url(objectKey, opts.query);
      const headers = this.sign(method, u, canonicalQuery, payloadHash, extra);
      let res: Response;
      try {
        res = await fetch(u, { method, headers, body: method === 'PUT' ? new Uint8Array(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e: any) {
        const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        const cause = e?.cause?.code ?? e?.code ?? '';
        lastErr = new S3Error(timeout ? `S3: Zeitüberschreitung bei ${opts.op} nach ${Math.round(this.timeoutMs / 1000)} s (${this.base.host})` : `S3-Endpunkt ${this.base.host} nicht erreichbar${cause ? ` (${cause})` : ''}`, timeout ? 'Timeout' : 'NetworkError', 0, true);
        continue;
      }
      if (res.ok) return res;
      if (res.status === 404 && opts.allow404) {
        await res.body?.cancel().catch(() => {});
        return res;
      }
      // Nur den Fehlercode auswerten – der Meldungstext von S3 kann Signatur-Bestandteile enthalten.
      const text = method === 'HEAD' ? '' : await res.text().catch(() => '');
      const code = xmlTag(text, 'Code') ?? '';
      const d = describe(code, res.status, where);
      lastErr = new S3Error(d.msg, code || `HTTP${res.status}`, res.status, d.retryable);
      if (!d.retryable) throw lastErr;
    }
    throw lastErr!;
  }

  async put(key: string, data: Buffer) {
    await this.req('PUT', this.blobKey(key), { body: data, op: 'Hochladen' });
  }

  async get(key: string) {
    const res = await this.req('GET', this.blobKey(key), { op: 'Lesen' });
    const buf = Buffer.from(await res.arrayBuffer());
    const len = res.headers.get('content-length');
    if (len !== null && Number(len) !== buf.length) throw new S3Error(`S3: Datei ${key} unvollständig gelesen (${buf.length} von ${len} Byte)`, 'IncompleteBody', res.status, true);
    return buf;
  }

  async del(key: string) {
    await this.req('DELETE', this.blobKey(key), { op: 'Löschen', allow404: true });
  }

  /** Metadaten eines Blobs oder null, wenn er fehlt. */
  async head(key: string): Promise<S3ObjectInfo | null> {
    return this.headRaw(this.blobKey(key));
  }

  private async headRaw(objectKey: string): Promise<S3ObjectInfo | null> {
    const res = await this.req('HEAD', objectKey, { op: 'Prüfen', allow404: true });
    if (res.status === 404) return null;
    return { size: Number(res.headers.get('content-length') ?? 0), etag: (res.headers.get('etag') ?? '').replace(/"/g, ''), lastModified: res.headers.get('last-modified') ?? undefined };
  }

  /**
   * Alle Blob-Schlüssel unter dem Präfix (ListObjectsV2, seitenweise). Probe-Objekte und fremde
   * Schlüssel, die kein Blob-Format haben, werden übersprungen. pageSize nur für Tests (max. 1000).
   */
  async list(opts: { pageSize?: number } = {}): Promise<string[]> {
    const out: string[] = [];
    for await (const o of this.objects(opts)) out.push(o.key);
    return out;
  }

  /** Wie list(), aber als Strom mit Größe und ETag – für Sicherungen großer Buckets. */
  async *objects(opts: { pageSize?: number } = {}): AsyncGenerator<{ key: string } & S3ObjectInfo> {
    let token: string | undefined;
    do {
      const xml = await this.listPage(this.prefix, opts.pageSize, token);
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const full = xmlTag(m[1]!, 'Key') ?? '';
        if (!full.startsWith(this.prefix)) continue;
        const key = full.slice(this.prefix.length);
        if (!BLOB_KEY.test(key)) continue; // u. a. _paraph-probe/…
        yield { key, size: Number(xmlTag(m[1]!, 'Size') ?? 0), etag: (xmlTag(m[1]!, 'ETag') ?? '').replace(/"/g, ''), lastModified: xmlTag(m[1]!, 'LastModified') };
      }
      token = xmlTag(xml, 'IsTruncated') === 'true' ? xmlTag(xml, 'NextContinuationToken') : undefined;
    } while (token);
  }

  private async listPage(prefix: string, maxKeys?: number, token?: string) {
    const query: Record<string, string> = { 'list-type': '2' };
    if (prefix) query.prefix = prefix;
    if (maxKeys) query['max-keys'] = String(Math.min(1000, Math.max(1, maxKeys)));
    if (token) query['continuation-token'] = token;
    const res = await this.req('GET', undefined, { query, op: 'Auflisten' });
    return res.text();
  }

  /**
   * Startprüfung: Bucket erreichbar, auflistbar, schreib-, les- und löschbar.
   * Legt dazu ein zufälliges Objekt unter „<Präfix>_paraph-probe/“ an und entfernt es wieder.
   * Wirft eine S3Error mit verständlicher Meldung, sonst nichts.
   */
  async probe(): Promise<void> {
    const step = async <T>(name: string, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (e: any) {
        const err = e instanceof S3Error ? e : new S3Error(String(e?.message ?? e), 'ProbeFailed', 0);
        err.message = `S3-Startprüfung fehlgeschlagen (${name}, Bucket „${this.c.bucket}“ an ${this.base.host}): ${err.message}`;
        throw err;
      }
    };
    await step('Auflisten', () => this.listPage(this.prefix, 1));
    const key = `${this.prefix}${PROBE_PREFIX}${Date.now()}-${randomBytes(6).toString('hex')}`;
    const payload = randomBytes(64);
    await step('Schreiben', () => this.req('PUT', key, { body: payload, op: 'Hochladen' }));
    let readErr: unknown;
    try {
      const back = await step('Lesen', async () => Buffer.from(await (await this.req('GET', key, { op: 'Lesen' })).arrayBuffer()));
      if (!back.equals(payload)) throw new S3Error('S3-Startprüfung fehlgeschlagen: gelesener Inhalt weicht vom geschriebenen ab', 'ProbeMismatch', 0);
    } catch (e) {
      readErr = e;
    }
    // Aufräumen auch nach einem Lesefehler; der erste Fehler ist der aussagekräftigere.
    try {
      await step('Löschen', () => this.req('DELETE', key, { op: 'Löschen', allow404: true }));
    } catch (e) {
      if (!readErr) throw e;
    }
    if (readErr) throw readErr;
  }
}
