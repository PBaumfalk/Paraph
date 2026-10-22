// Minimaler S3-kompatibler Speicher (AWS Signature V4) für MinIO, Garage, Ceph, AWS S3 u. a.
// Inhalte sind bereits clientseitig verschlüsselt (siehe storage.ts); S3 sieht nur Chiffrat.
import { createHash, createHmac } from 'node:crypto';
import type { BlobBackend } from './storage.js';

interface S3Cfg {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const sha = (d: Buffer | string) => createHash('sha256').update(d).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();

export class S3Backend implements BlobBackend {
  private base: URL;
  constructor(private c: S3Cfg) {
    const ep = c.endpoint ?? `https://s3.${c.region}.amazonaws.com`;
    this.base = new URL(ep);
  }

  private url(key: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Ungültiger Blob-Schlüssel');
    const u = new URL(this.base.toString());
    if (this.c.forcePathStyle) u.pathname = `/${this.c.bucket}/${key}`;
    else {
      u.hostname = `${this.c.bucket}.${u.hostname}`;
      u.pathname = `/${key}`;
    }
    return u;
  }

  private sign(method: string, u: URL, body: Buffer) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = sha(body);
    const headers: Record<string, string> = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    const signed = Object.keys(headers).sort();
    const canonical = [method, u.pathname, '', ...signed.map((h) => `${h}:${headers[h]}`), '', signed.join(';'), payloadHash].join('\n');
    const scope = `${date}/${this.c.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
    const kDate = hmac('AWS4' + this.c.secretAccessKey, date);
    const kSigning = hmac(hmac(hmac(kDate, this.c.region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
    return {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${this.c.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
    };
  }

  private async req(method: string, key: string, body: Buffer = Buffer.alloc(0)) {
    const u = this.url(key);
    const headers = this.sign(method, u, body);
    const { host, ...rest } = headers as Record<string, string>;
    void host;
    const res = await fetch(u, { method, headers: rest, body: method === 'PUT' ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(60_000) });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`S3 ${method} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  async put(key: string, data: Buffer) {
    await this.req('PUT', key, data);
  }
  async get(key: string) {
    return Buffer.from(await (await this.req('GET', key)).arrayBuffer());
  }
  async del(key: string) {
    await this.req('DELETE', key);
  }
}
