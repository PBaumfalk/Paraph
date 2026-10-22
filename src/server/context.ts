import { EventEmitter } from 'node:events';
import pino, { type Logger } from 'pino';
import type { Config } from './config.js';
import { openDb, type DB } from './db/index.js';
import { BlobStore, LocalBackend, type BlobBackend } from './lib/storage.js';
import { join } from 'node:path';
import { deriveKey } from './lib/crypto.js';

export interface Ctx {
  cfg: Config;
  db: DB;
  blobs: BlobStore;
  log: Logger;
  bus: EventEmitter; // Live-Ereignisse für die Oberfläche (pro Organisation)
  keys: { secrets: Buffer; session: Buffer };
  now: () => Date;
}

export function createContext(cfg: Config, opts: { backend?: BlobBackend; log?: Logger } = {}): Ctx {
  const db = openDb(cfg.dataDir);
  const log =
    opts.log ??
    pino({
      level: cfg.logLevel,
      base: { app: 'paraph' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.code'], remove: true },
    });
  let backend = opts.backend;
  if (!backend) {
    if (cfg.s3) {
      // Wird bei Bedarf geladen, damit S3 eine echte Option bleibt und keine Pflichtabhängigkeit.
      throw new Error('S3-Backend muss über createContextAsync geladen werden');
    }
    backend = new LocalBackend(join(cfg.dataDir, 'blobs'));
  }
  const bus = new EventEmitter();
  bus.setMaxListeners(1000);
  return {
    cfg,
    db,
    blobs: new BlobStore(db, backend, cfg.masterKey),
    log,
    bus,
    keys: { secrets: deriveKey(cfg.masterKey, 'secrets'), session: deriveKey(cfg.masterKey, 'session') },
    now: () => new Date(),
  };
}

export async function createContextAsync(cfg: Config, opts: { log?: Logger } = {}): Promise<Ctx> {
  if (cfg.s3) {
    const { S3Backend } = await import('./lib/s3.js');
    return createContext(cfg, { ...opts, backend: new S3Backend(cfg.s3) });
  }
  return createContext(cfg, opts);
}

/**
 * Startprüfung der Dateiablage (bei S3: Bucket auflisten, Probeobjekt unter „_paraph-probe/“
 * schreiben, lesen, löschen). Wirft mit verständlicher Meldung, damit der Start früh abbricht.
 */
export async function probeBackend(ctx: Ctx): Promise<{ storage: 'local' | 's3'; ms: number }> {
  const t = Date.now();
  await ctx.blobs.backend.probe?.();
  return { storage: ctx.cfg.s3 ? 's3' : 'local', ms: Date.now() - t };
}
