// Dokumentablage. Jede Datei wird mit einem eigenen, aus dem Hauptschlüssel abgeleiteten
// Schlüssel verschlüsselt (AES-256-GCM, Blob-ID als AAD). Dateien sind nie direkt über HTTP erreichbar.
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from '../db/index.js';
import { deriveKey, id as newId, open, seal, sha256Hex } from './crypto.js';

export interface BlobBackend {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
  list?(): Promise<string[]>;
}

export class LocalBackend implements BlobBackend {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private path(key: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Ungültiger Blob-Schlüssel');
    const sub = join(this.dir, key.slice(-2));
    mkdirSync(sub, { recursive: true });
    return join(sub, key);
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    const tmp = p + '.tmp';
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, p); // atomar: halbe Dateien gibt es nicht
  }
  async get(key: string) {
    return readFileSync(this.path(key));
  }
  async del(key: string) {
    const p = this.path(key);
    if (existsSync(p)) unlinkSync(p);
  }
  async list() {
    const out: string[] = [];
    for (const sub of readdirSync(this.dir)) {
      for (const f of readdirSync(join(this.dir, sub))) if (!f.endsWith('.tmp')) out.push(f);
    }
    return out;
  }
}

export interface BlobMeta {
  id: string;
  sha256: string;
  size: number;
  mime: string;
}

export class BlobStore {
  constructor(
    private db: DB,
    private backend: BlobBackend,
    private master: Buffer,
  ) {}

  private key(blobId: string) {
    return deriveKey(this.master, 'blob', blobId);
  }

  async put(data: Buffer, opts: { orgId: string | null; mime: string; kind: string }): Promise<BlobMeta> {
    const blobId = newId('blob').replace(/^blob_/, 'b');
    const sha256 = sha256Hex(data);
    await this.backend.put(blobId, seal(this.key(blobId), data, blobId));
    this.db
      .prepare('INSERT INTO blobs (id, org_id, sha256, size, mime, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(blobId, opts.orgId, sha256, data.length, opts.mime, opts.kind, new Date().toISOString());
    return { id: blobId, sha256, size: data.length, mime: opts.mime };
  }

  /** Liest und prüft die Datei: stimmt der Hash nicht mit dem gespeicherten überein, wird abgebrochen. */
  async get(blobId: string): Promise<Buffer> {
    const row = this.db.prepare('SELECT sha256 FROM blobs WHERE id = ?').get(blobId) as { sha256: string } | undefined;
    if (!row) throw new Error('Datei nicht gefunden');
    const data = open(this.key(blobId), await this.backend.get(blobId), blobId);
    if (sha256Hex(data) !== row.sha256) throw new Error(`Integritätsfehler bei Datei ${blobId}`);
    return data;
  }

  meta(blobId: string): (BlobMeta & { org_id: string | null }) | undefined {
    return this.db.prepare('SELECT id, sha256, size, mime, org_id FROM blobs WHERE id = ?').get(blobId) as any;
  }

  async delete(blobId: string) {
    await this.backend.del(blobId);
    this.db.prepare('DELETE FROM blobs WHERE id = ?').run(blobId);
  }
}
