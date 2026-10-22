// Kommandozeile: paraph <befehl>
//   health                     Healthcheck (für Docker)
//   backup [--out DIR]         Sicherung erstellen
//   verify-backup DATEI        Sicherung prüfen (Entschlüsselung, Hashes, Schema, Schlüssel)
//   restore-key DATEI --out P  Hauptschlüssel aus einer Passphrase-Sicherung schreiben (neuer Server)
//   restore DATEI [--force]    Sicherung wiederherstellen (Dienst vorher stoppen)
//   setup-code                 Einrichtungscode anzeigen (solange kein Konto existiert)
//   reset-link E-MAIL          Link zum Zurücksetzen eines Passworts erzeugen (Notfallzugang)
//   verify-audit               Alle Audit-Ketten und ihre Verankerung prüfen
//   doctor [--quick]           Betriebsdiagnose (Konfiguration, Dienste, Sicherung, Nachweise)
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const passphraseArg = () => {
  const f = flag('--passphrase-file') ?? process.env.BACKUP_PASSPHRASE_FILE;
  if (f) return readFileSync(f, 'utf8').trim() || undefined;
  return process.env.BACKUP_PASSPHRASE || undefined;
};
const scratchDir = (dataDir: string) => {
  const d = join(dataDir, '.scratch');
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};

async function main() {
  switch (cmd) {
    case 'version': {
      const { openDb, schemaVersion } = await import('./db/index.js');
      const cfg = loadConfig();
      let schema = '–';
      try {
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(join(cfg.dataDir, 'paraph.db'), { readonly: true, fileMustExist: true });
        schema = String(schemaVersion(db));
        db.close();
      } catch {}
      void openDb;
      console.log(`Paraph ${cfg.version} (Datenbankschema ${schema})`);
      return;
    }
    case 'health': {
      const port = process.env.PORT ?? '8080';
      const res = await fetch(`http://127.0.0.1:${port}/api/health/ready`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
      if (!res || !res.ok) {
        console.error('nicht bereit');
        process.exit(1);
      }
      console.log('ok');
      return;
    }
    case 'backup': {
      const { createContextAsync } = await import('./context.js');
      const { createBackup, backupDir, runBackupJob } = await import('./domain/backup.js');
      const ctx = await createContextAsync(loadConfig());
      const r = flag('--out') ? await createBackup(ctx, flag('--out')!) : await runBackupJob(ctx);
      console.log(`Sicherung erstellt: ${r.file}\n${r.manifest.files.length} Dateien, Schema ${r.manifest.schema}, ${JSON.stringify(r.manifest.counts)}`);
      console.log(r.manifest.includes_master_key
        ? 'Enthält den Hauptschlüssel – wiederherstellbar mit der Wiederherstellungs-Passphrase.'
        : 'Ohne Hauptschlüssel – wiederherstellbar nur mit dem MASTER_KEY dieser Instanz (getrennt aufbewahren!). Empfehlung: BACKUP_PASSPHRASE_FILE einrichten.');
      void backupDir;
      return;
    }
    case 'verify-backup': {
      const { verifyBackup } = await import('./domain/backup.js');
      const cfg = loadConfig();
      const r = await verifyBackup(args[0], { masterKey: cfg.masterKey, passphrase: passphraseArg() }, scratchDir(cfg.dataDir));
      console.log(`Sicherung vom ${r.manifest.created_at}, Version ${r.manifest.version}, Schema ${r.manifest.schema}, ${r.manifest.files.length} Dateien, geöffnet per ${r.via === 'master' ? 'Hauptschlüssel' : r.via === 'passphrase' ? 'Passphrase' : 'Altformat'}${r.includesMasterKey ? ', Hauptschlüssel enthalten' : ''}`);
      if (r.problems.length) {
        console.error('Probleme:\n- ' + r.problems.join('\n- '));
        process.exit(2);
      }
      console.log('In Ordnung: entschlüsselt, alle Blöcke authentisch, alle Hashes stimmen, Datenbank intakt.');
      return;
    }
    case 'restore-key': {
      // Neuer Server: Hauptschlüssel aus einer Passphrase-Sicherung übernehmen (vor „restore“)
      const { extractMasterKey } = await import('./domain/backup.js');
      const pass = passphraseArg();
      if (!pass) throw new Error('Passphrase fehlt: BACKUP_PASSPHRASE_FILE setzen oder --passphrase-file DATEI angeben.');
      const out = flag('--out');
      if (!out) throw new Error('--out PFAD fehlt (z. B. /secrets-out/master.key)');
      const m = await extractMasterKey(args[0], pass, out, scratchDir(process.env.DATA_DIR ?? '.'));
      console.log(`Hauptschlüssel der Sicherung vom ${m.created_at} nach ${out} geschrieben (Rechte 0600).`);
      return;
    }
    case 'restore': {
      const { restoreBackup } = await import('./domain/backup.js');
      const { createContextAsync } = await import('./context.js');
      const cfg = loadConfig();
      // Datenbank wird erst nach der Prüfung ersetzt; Kontext nur für die Dateiablage (lokal oder S3)
      const ctx = await createContextAsync({ ...cfg, dataDir: scratchDir(cfg.dataDir) });
      ctx.db.close();
      const backend = cfg.s3 ? ctx.blobs.backend : new (await import('./lib/storage.js')).LocalBackend((await import('node:path')).join(cfg.dataDir, 'blobs'));
      const r = await restoreBackup(args[0], { dataDir: cfg.dataDir, masterKey: cfg.masterKey, backend, passphrase: passphraseArg() }, { force: args.includes('--force') });
      console.log(`Wiederhergestellt nach ${cfg.dataDir}: ${r.blobs} Dokumentdateien (${cfg.s3 ? 'S3' : 'lokal'}), ${JSON.stringify(r.manifest.counts)}. Jetzt den Dienst starten.`);
      return;
    }
    case 'setup-code': {
      const { createContextAsync } = await import('./context.js');
      const { ensureSetupCode } = await import('./domain/users.js');
      const ctx = await createContextAsync(loadConfig());
      const code = ensureSetupCode(ctx);
      console.log(code ? `Einrichtungscode: ${code}` : 'Die Instanz ist bereits eingerichtet.');
      return;
    }
    case 'reset-link': {
      const { createContextAsync } = await import('./context.js');
      const { hashToken, secretToken } = await import('./lib/crypto.js');
      const ctx = await createContextAsync(loadConfig());
      const u = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(String(args[0] ?? '').toLowerCase()) as any;
      if (!u) {
        console.error('Kein Konto mit dieser E-Mail-Adresse.');
        process.exit(1);
      }
      const token = secretToken();
      ctx.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(`pwreset:${hashToken(token)}`, JSON.stringify({ userId: u.id, exp: Date.now() + 3600_000 }));
      console.log(`Link (60 Minuten gültig): ${ctx.cfg.appUrl}/reset/${token}`);
      return;
    }
    case 'verify-audit': {
      const { createContextAsync } = await import('./context.js');
      const { listAudit, verifyChain } = await import('./domain/audit.js');
      const { verifyAnchors } = await import('./domain/anchor.js');
      const ctx = await createContextAsync(loadConfig());
      const envs = ctx.db.prepare('SELECT id FROM envelopes').all() as { id: string }[];
      let bad = 0;
      for (const e of envs) {
        const r = verifyChain(e.id, listAudit(ctx.db, e.id));
        if (!r.ok) {
          bad++;
          console.error(`${e.id}: ${r.reason} bei Eintrag ${r.brokenAt}`);
        }
      }
      console.log(`${envs.length} Vorgänge geprüft, ${bad} mit beschädigter Kette.`);
      const rep = await verifyAnchors(ctx);
      for (const p of rep.problems) console.error('Verankerung: ' + p);
      for (const w of rep.warnings) console.warn('Hinweis: ' + w);
      console.log(`${rep.anchors} Anker (${rep.stamped} mit geprüftem Zeitstempel, ${rep.unstamped} ohne), ${rep.envelopes} Vorgänge verankert, ${rep.problems.length} Abweichungen.`);
      if (!ctx.cfg.tsaUrl) console.warn('Hinweis: Ohne Zeitstempeldienst (TSA_URL) schützt die Verankerung nicht gegen jemanden mit vollem Serverzugriff.');
      process.exit(bad || rep.problems.length ? 2 : 0);
    }
    case 'doctor': {
      const { createContextAsync } = await import('./context.js');
      const { runDiagnostics } = await import('./domain/diagnostics.js');
      const ctx = await createContextAsync(loadConfig());
      const r = await runDiagnostics(ctx, { deep: !args.includes('--quick') });
      const icon = { ok: 'OK  ', warn: 'WARN', fail: 'FEHL', info: 'INFO' } as const;
      let area = '';
      for (const c of r.checks) {
        if (c.area !== area) console.log(`\n${(area = c.area)}`);
        console.log(`  [${icon[c.status]}] ${c.label}: ${c.detail}`);
      }
      console.log(`\nGesamt: ${r.status === 'ok' ? 'in Ordnung' : r.status === 'warn' ? 'mit Hinweisen' : 'FEHLER – siehe oben'}`);
      process.exit(r.status === 'fail' ? 1 : 0);
    }
    default:
      console.log('Befehle: health | doctor | backup [--out DIR] | verify-backup DATEI | restore-key DATEI --out PFAD | restore DATEI [--force] | setup-code | reset-link E-MAIL | verify-audit');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
