// Betriebsdiagnose: ein Prüfkern für Administration (Einstellungen → System), Kommandozeile (paraph doctor)
// und Monitoring (/metrics). Schnelle Prüfungen laufen immer; „tief“ kontaktiert externe Dienste
// (Mailserver, Zeitstempeldienst, OIDC, S3, Gotenberg) und prüft alle Audit-Ketten.
import { statfsSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Ctx } from '../context.js';
import { schemaVersion } from '../db/index.js';
import { migrations } from '../db/migrations.js';
import { workerStatus } from './jobs.js';
import { backupStatus } from './backup.js';
import { verifySmtp } from './mail.js';
import { getSealKey } from './sealkeys.js';
import { listAudit, verifyChain } from './audit.js';
import { verifyAnchors } from './anchor.js';
import { requestTimestamp, sha256 } from '../pdf/timestamp.js';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';
export interface Check {
  id: string;
  area: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

export async function runDiagnostics(ctx: Ctx, opts: { deep?: boolean } = {}): Promise<{ status: CheckStatus; checks: Check[]; generated_at: string }> {
  const checks: Check[] = [];
  const add = (id: string, area: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, area, label, status, detail });
  const cfg = ctx.cfg;

  // ── Grundkonfiguration
  add('version', 'Instanz', 'Version', 'info', `${cfg.version}, Datenbankschema ${schemaVersion(ctx.db)}/${Math.max(...migrations.map((m) => m.id))}`);
  if (cfg.devMode) add('dev_mode', 'Instanz', 'Entwicklungsmodus', 'fail', 'DEV_MODE ist aktiv (Signaturlinks im Log). Im Produktivbetrieb abschalten.');
  if (cfg.appUrl.startsWith('https://')) add('https', 'Instanz', 'Öffentliche Adresse', 'ok', cfg.appUrl);
  else add('https', 'Instanz', 'Öffentliche Adresse', isLocal(cfg.appUrl) ? 'warn' : 'fail', `${cfg.appUrl} – ohne HTTPS sind Sitzungscookies und Signaturlinks ungeschützt.`);
  add('trust_proxy', 'Instanz', 'Reverse Proxy', cfg.trustProxy ? 'ok' : cfg.appUrl.startsWith('https://') ? 'warn' : 'info',
    cfg.trustProxy ? `X-Forwarded-For wird ausgewertet (${Array.isArray(cfg.trustProxy) ? cfg.trustProxy.join(', ') : typeof cfg.trustProxy === 'number' ? `${cfg.trustProxy} Hop(s)` : 'alle'})` : 'TRUST_PROXY aus – hinter einem Proxy stünde im Audit-Trail die IP des Proxys.');
  const setupOpen = !(ctx.db.prepare('SELECT 1 FROM users LIMIT 1').get());
  const orgsWithoutPrivacy = (ctx.db.prepare(`SELECT name FROM orgs WHERE json_extract(settings, '$.privacyUrl') IS NULL`).all() as any[]).map((o) => o.name);
  if (orgsWithoutPrivacy.length) add('privacy', 'Instanz', 'Datenschutzhinweise (Art. 13 DSGVO)', 'warn', `Kein Link auf der Signaturseite für: ${orgsWithoutPrivacy.join(', ')} (Einstellungen → Organisation).`);
  if (setupOpen) add('setup', 'Instanz', 'Ersteinrichtung', 'warn', 'Noch kein Konto angelegt – die Einrichtung unter /setup ist offen.');

  // ── Schlüssel
  add('master_key', 'Schlüssel', 'Hauptschlüssel', cfg.masterKeySource === 'generated' ? 'warn' : 'ok',
    cfg.masterKeySource === 'file' ? 'aus Datei (Docker-Secret)' : cfg.masterKeySource === 'env' ? 'aus Umgebungsvariable (besser: MASTER_KEY_FILE)' : 'automatisch unter DATA_DIR/secrets erzeugt – liegt im selben Volume wie die Daten.');
  const mkf = process.env.MASTER_KEY_FILE;
  if (mkf && existsSync(mkf)) {
    const mode = statSync(mkf).mode & 0o777;
    if (mode & 0o004) add('master_key_perm', 'Schlüssel', 'Rechte der Schlüsseldatei', 'fail', `${mkf} ist für alle lesbar (${mode.toString(8)}).`);
  }
  try {
    const seal = await getSealKey(ctx, null);
    const days = Math.round((new Date(seal.info.notAfter).getTime() - ctx.now().getTime()) / 86400_000);
    add('seal', 'Schlüssel', 'Plattformsiegel', days < 365 ? 'warn' : 'ok',
      `${seal.source === 'generated' ? 'Selbst signiertes Instanzzertifikat (technisches Integritätssiegel – kein qualifiziertes Siegel, keine persönliche Signatur)' : 'Eigenes Zertifikat'}, gültig bis ${seal.info.notAfter.slice(0, 10)} (${days} Tage), SHA-256 ${seal.info.sha256.slice(0, 16)}…`);
  } catch (e: any) {
    add('seal', 'Schlüssel', 'Plattformsiegel', 'fail', e.message);
  }

  // ── Speicher
  try {
    const fs = statfsSync(cfg.dataDir);
    const free = fs.bavail * fs.bsize;
    const total = fs.blocks * fs.bsize;
    const pct = total ? (free / total) * 100 : 100;
    add('disk', 'Speicher', 'Freier Speicher (Datenverzeichnis)', free < 1024 ** 3 || pct < 5 ? 'fail' : free < 5 * 1024 ** 3 || pct < 15 ? 'warn' : 'ok', `${(free / 1024 ** 3).toFixed(1)} GB frei (${pct.toFixed(0)} %)`);
  } catch {}
  try {
    const db = statSync(join(cfg.dataDir, 'paraph.db')).size;
    const wal = existsSync(join(cfg.dataDir, 'paraph.db-wal')) ? statSync(join(cfg.dataDir, 'paraph.db-wal')).size : 0;
    add('db_size', 'Speicher', 'Datenbank', wal > 512 * 1024 ** 2 ? 'warn' : 'info', `${(db / 1024 ** 2).toFixed(1)} MB, WAL ${(wal / 1024 ** 2).toFixed(1)} MB`);
  } catch {}
  if (opts.deep) {
    const r = ctx.db.prepare('PRAGMA quick_check').get() as any;
    add('db_integrity', 'Speicher', 'Datenbank-Integrität', r?.quick_check === 'ok' ? 'ok' : 'fail', String(r?.quick_check));
    try {
      const t0 = Date.now();
      await ctx.blobs.backend.probe?.();
      add('storage_probe', 'Speicher', cfg.s3 ? 'S3-Ablage' : 'Dateiablage', 'ok', `${cfg.s3 ? `Bucket ${cfg.s3.bucket}` : 'lokal'}: schreiben, lesen, löschen in ${Date.now() - t0} ms`);
    } catch (e: any) {
      add('storage_probe', 'Speicher', cfg.s3 ? 'S3-Ablage' : 'Dateiablage', 'fail', e.message);
    }
  } else add('storage', 'Speicher', 'Dateiablage', 'info', cfg.s3 ? `S3 (${cfg.s3.bucket})` : 'lokal (Volume)');

  // ── Sicherung
  const b = backupStatus(ctx);
  if (cfg.backup.intervalHours <= 0) add('backup', 'Sicherung', 'Automatische Sicherung', 'warn', 'abgeschaltet (BACKUP_INTERVAL_HOURS=0)');
  else add('backup', 'Sicherung', 'Letzte Sicherung', b.stale || b.incomplete ? 'fail' : 'ok', b.last ? `${b.last.at} (vor ${b.age_hours} h), ${b.last.files} Dateien${b.incomplete ? ` – UNVOLLSTÄNDIG: ${b.last.missing} Datei(en) fehlen im Speicher` : ''}` : 'noch keine');
  add('backup_key', 'Sicherung', 'Schlüsselmaterial in der Sicherung', b.passphrase ? 'ok' : 'warn',
    b.passphrase ? 'Sicherungen enthalten den Hauptschlüssel, geschützt durch die Wiederherstellungs-Passphrase.' : 'Keine Wiederherstellungs-Passphrase (BACKUP_PASSPHRASE_FILE): Sicherungen sind nur mit dem getrennt aufbewahrten MASTER_KEY lesbar.');

  // ── Hintergrundaufgaben
  const w = workerStatus(ctx);
  const started = ctx.db.prepare(`SELECT value FROM meta WHERE key = 'worker_started'`).get() as any;
  add('jobs', 'Hintergrund', 'Aufgaben', w.failed ? 'fail' : w.overdue || w.stale ? 'warn' : 'ok',
    `${w.queued} wartend, ${w.retrying} in Wiederholung, ${w.failed} endgültig fehlgeschlagen, ${w.overdue} überfällig${started ? `; Worker gestartet ${started.value}` : ''}`);
  const failedMails = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM emails WHERE status = 'failed' AND created_at > ?`).get(new Date(ctx.now().getTime() - 7 * 86400_000).toISOString()) as any).n;
  const queuedMails = (ctx.db.prepare(`SELECT COUNT(*) AS n FROM emails WHERE status = 'queued' AND created_at < ?`).get(new Date(ctx.now().getTime() - 15 * 60_000).toISOString()) as any).n;
  add('mail_queue', 'E-Mail', 'Zustellung (7 Tage)', failedMails ? 'warn' : queuedMails ? 'warn' : 'ok', `${failedMails} nicht zugestellt, ${queuedMails} warten länger als 15 Minuten`);

  // ── Externe Dienste
  if (!cfg.smtp && cfg.probeMode) add('smtp', 'E-Mail', 'Mailserver', 'warn', 'Probebetrieb ohne Mailserver – Einladungen gehen nicht per E-Mail hinaus, die Links werden selbst weitergegeben.');
  else if (!cfg.smtp) add('smtp', 'E-Mail', 'Mailserver', 'fail', 'SMTP_URL fehlt – Einladungen, Codes und Abschlussmitteilungen werden nicht versendet.');
  else if (opts.deep) {
    const r = await verifySmtp(ctx);
    add('smtp', 'E-Mail', 'Mailserver', r.ok ? 'ok' : 'fail', r.ok ? `erreichbar, Anmeldung erfolgreich, ${r.secure}` : r.error!.message);
  } else add('smtp', 'E-Mail', 'Mailserver', 'info', `eingerichtet (${new URL(cfg.smtp.url).hostname})`);

  if (!cfg.tsaUrl) {
    add('tsa', 'Nachweis', 'Zeitstempeldienst', 'warn', 'Kein TSA_URL: Siegel nur PAdES-B-B; die Verankerung der Audit-Ketten bleibt intern und schützt nicht gegen nachträgliche Fälschung durch jemanden mit Serverzugriff.');
  } else if (opts.deep) {
    try {
      const r = await requestTimestamp(cfg.tsaUrl, sha256(Buffer.from('paraph-diagnose ' + ctx.now().toISOString())));
      const skew = Math.abs(new Date(r.info.genTime).getTime() - ctx.now().getTime());
      add('tsa', 'Nachweis', 'Zeitstempeldienst', skew > 120_000 ? 'warn' : 'ok', `${r.info.tsaSubject}, Antwort geprüft${r.info.chainTrusted === null ? ' (Vertrauenskette nicht geprüft – TSA_CA_FILE)' : r.info.chainTrusted ? ', Kette vertrauenswürdig' : ', Kette NICHT vertrauenswürdig'}; Uhrabweichung ${Math.round(skew / 1000)} s`);
    } catch (e: any) {
      add('tsa', 'Nachweis', 'Zeitstempeldienst', 'fail', e.message);
    }
  } else add('tsa', 'Nachweis', 'Zeitstempeldienst', 'info', new URL(cfg.tsaUrl).hostname);
  if (cfg.tsaUrl && !cfg.tsaCaPem) add('tsa_trust', 'Nachweis', 'Vertrauensanker des Zeitstempeldienstes', 'fail', 'TSA_CA_FILE fehlt: Zeitstempel werden rechnerisch geprüft, der Aussteller aber nicht. Gegen jemanden mit Serverzugriff schützt die Verankerung erst mit Vertrauensanker.');

  const anchors = ctx.db.prepare(`SELECT COUNT(*) AS n, SUM(tsa_token IS NULL) AS open, MAX(created_at) AS last FROM audit_anchors`).get() as any;
  add('anchors', 'Nachweis', 'Verankerung der Audit-Ketten', anchors.n === 0 ? 'info' : cfg.tsaUrl && anchors.open > 0 ? 'warn' : 'ok',
    anchors.n ? `${anchors.n} Anker, zuletzt ${anchors.last}${cfg.tsaUrl ? `, ${anchors.open ?? 0} ohne Zeitstempel` : ' (ohne externen Zeitstempel)'}` : 'noch keine (entsteht nach dem ersten Versand)');
  if (opts.deep) {
    const envs = ctx.db.prepare('SELECT id FROM envelopes').all() as { id: string }[];
    const broken = envs.filter((e) => !verifyChain(e.id, listAudit(ctx.db, e.id)).ok).map((e) => e.id);
    add('audit_chains', 'Nachweis', 'Audit-Ketten', broken.length ? 'fail' : 'ok', broken.length ? `${broken.length} beschädigt: ${broken.slice(0, 5).join(', ')}` : `${envs.length} Vorgänge geprüft, alle intakt`);
    const rep = await verifyAnchors(ctx);
    add('anchor_verify', 'Nachweis', 'Abgleich mit Verankerung', rep.ok ? (rep.warnings.length ? 'warn' : 'ok') : 'fail', rep.ok ? `${rep.anchors} Anker, ${rep.stamped} mit geprüftem Zeitstempel und Vertrauenskette, ${rep.stampedUnverifiedChain} ohne geprüfte Kette${rep.warnings.length ? '; ' + rep.warnings.slice(0, 3).join('; ') : ''}` : rep.problems.slice(0, 5).join('; '));
  }

  if (cfg.oidc) {
    if (opts.deep) {
      try {
        const r = await fetch(new URL('.well-known/openid-configuration', cfg.oidc.issuer.endsWith('/') ? cfg.oidc.issuer : cfg.oidc.issuer + '/'), { signal: AbortSignal.timeout(8000) });
        const j: any = r.ok ? await r.json() : null;
        add('oidc', 'Anmeldung', `SSO (${cfg.oidc.name})`, j?.issuer ? 'ok' : 'fail', j?.issuer ? `Discovery erreichbar, Aussteller ${j.issuer}` : `Discovery nicht erreichbar (HTTP ${r.status})`);
      } catch (e: any) {
        add('oidc', 'Anmeldung', `SSO (${cfg.oidc.name})`, 'fail', `Discovery nicht erreichbar: ${e.message}`);
      }
    } else add('oidc', 'Anmeldung', `SSO (${cfg.oidc.name})`, 'info', cfg.oidc.issuer);
  }
  if (cfg.gotenbergUrl && opts.deep) {
    try {
      const r = await fetch(`${cfg.gotenbergUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      add('gotenberg', 'Dienste', 'Office-Umwandlung (Gotenberg)', r.ok ? 'ok' : 'warn', r.ok ? 'erreichbar' : `HTTP ${r.status}`);
    } catch (e: any) {
      add('gotenberg', 'Dienste', 'Office-Umwandlung (Gotenberg)', 'warn', `nicht erreichbar: ${e.message}`);
    }
  }
  if (cfg.sms) add('sms', 'Dienste', 'SMS-Gateway', 'info', `${new URL(cfg.sms.url).hostname} (nicht automatisch geprüft – Testversand kostet)`);
  add('qes', 'Dienste', 'Qualifizierte Signatur (QES)', 'info', cfg.qes ? `${cfg.qes.name} konfiguriert – Anbindung ist vorbereitet, nicht produktiv freigegeben` : 'nicht angebunden (Paraph erzeugt keine QES)');

  const status: CheckStatus = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  return { status, checks, generated_at: ctx.now().toISOString() };
}

/** Prometheus-Textformat (nur Zählwerte, keine personenbezogenen Daten). */
export function metrics(ctx: Ctx): string {
  const w = workerStatus(ctx);
  const b = backupStatus(ctx);
  const n = (sql: string, ...a: unknown[]) => Number((ctx.db.prepare(sql).get(...a) as any).n ?? 0);
  const lines: string[] = [];
  const g = (name: string, help: string, value: number, labels = '') => {
    if (!lines.some((l) => l.startsWith(`# HELP ${name} `))) lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    lines.push(`${name}${labels} ${Number.isFinite(value) ? value : 0}`);
  };
  g('paraph_up', 'Instanz läuft', 1);
  g('paraph_schema_version', 'Datenbankschema', schemaVersion(ctx.db));
  g('paraph_jobs', 'Hintergrundaufgaben nach Zustand', w.queued, '{state="queued"}');
  g('paraph_jobs', 'Hintergrundaufgaben nach Zustand', w.failed, '{state="failed"}');
  g('paraph_jobs', 'Hintergrundaufgaben nach Zustand', w.overdue, '{state="overdue"}');
  g('paraph_jobs', 'Hintergrundaufgaben nach Zustand', w.retrying, '{state="retrying"}');
  for (const st of ['queued', 'sent', 'failed']) g('paraph_emails', 'E-Mails nach Zustand (letzte 7 Tage)', n(`SELECT COUNT(*) AS n FROM emails WHERE status = ? AND created_at > ?`, st, new Date(ctx.now().getTime() - 7 * 86400_000).toISOString()), `{state="${st}"}`);
  for (const st of ['draft', 'sent', 'completed', 'declined', 'voided', 'expired']) g('paraph_envelopes', 'Vorgänge nach Zustand (ohne Testmodus)', n(`SELECT COUNT(*) AS n FROM envelopes WHERE status = ? AND test_mode = 0`, st), `{state="${st}"}`);
  g('paraph_backup_age_seconds', 'Alter der letzten Sicherung', b.age_hours === null ? -1 : b.age_hours * 3600);
  g('paraph_anchors_unstamped', 'Anker ohne externen Zeitstempel', n(`SELECT COUNT(*) AS n FROM audit_anchors WHERE tsa_token IS NULL`));
  try {
    const fs = statfsSync(ctx.cfg.dataDir);
    g('paraph_disk_free_bytes', 'Freier Speicher im Datenverzeichnis', fs.bavail * fs.bsize);
  } catch {}
  return lines.join('\n') + '\n';
}
