import { loadConfig } from './config.js';
import { createContextAsync, probeBackend } from './context.js';
import { buildApp } from './app.js';
import { startWorker } from './domain/jobs.js';
import { ensureSetupCode } from './domain/users.js';
import { getSealKey } from './domain/sealkeys.js';

const cfg = loadConfig();
const ctx = await createContextAsync(cfg);

// Dateiablage vor allem anderen prüfen: lieber gar nicht starten als beim ersten Upload scheitern.
try {
  const p = await probeBackend(ctx);
  ctx.log.info({ storage: p.storage, ms: p.ms, bucket: cfg.s3?.bucket, prefix: cfg.s3?.prefix }, 'Dateiablage geprüft');
} catch (e: any) {
  ctx.log.fatal(e?.message ?? String(e));
  ctx.log.flush?.();
  process.exitCode = 1;
  process.exit(1);
}

if (cfg.masterKeySource === 'generated') {
  ctx.log.warn('MASTER_KEY ist nicht gesetzt – es wird ein Schlüssel unter DATA_DIR/secrets verwendet. Für den Produktivbetrieb MASTER_KEY_FILE (Docker-Secret) setzen und gesondert sichern.');
}
const code = ensureSetupCode(ctx);
if (code) ctx.log.warn(`Ersteinrichtung offen. Einrichtungscode: ${cfg.setupCode ? '(aus SETUP_CODE)' : code} – im Browser unter ${cfg.appUrl}/setup eingeben.`);
await getSealKey(ctx, null);

const app = await buildApp(ctx);
const stop = startWorker(ctx, [
  { type: 'expire_scan', everyMs: 5 * 60_000 },
  { type: 'reminder_scan', everyMs: 60 * 60_000 },
  { type: 'retention_purge', everyMs: 12 * 60 * 60_000 },
  { type: 'cleanup', everyMs: 6 * 60 * 60_000 },
  ...(cfg.backup.intervalHours > 0 ? [{ type: 'backup_auto', everyMs: cfg.backup.intervalHours * 3600_000 }] : []),
]);

await app.listen({ host: cfg.host, port: cfg.port });
ctx.log.info({ url: cfg.appUrl, port: cfg.port, version: cfg.version }, 'Paraph gestartet');

let closing = false;
async function shutdown(sig: string) {
  if (closing) return;
  closing = true;
  ctx.log.info({ sig }, 'Paraph wird beendet');
  stop();
  await app.close().catch(() => {});
  try {
    ctx.db.pragma('wal_checkpoint(TRUNCATE)');
    ctx.db.close();
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
