// Kommandozeile: paraph <befehl>
//   health                     Healthcheck (für Docker)
//   backup [--out DIR]         Sicherung erstellen
//   verify-backup DATEI        Sicherung prüfen (Hashes, Schema, Schlüssel)
//   restore DATEI [--force]    Sicherung in DATA_DIR wiederherstellen (Dienst vorher stoppen)
//   setup-code                 Einrichtungscode anzeigen (solange kein Konto existiert)
//   reset-link E-MAIL          Link zum Zurücksetzen eines Passworts erzeugen (Notfallzugang)
//   verify-audit               Alle Audit-Ketten prüfen
import { loadConfig } from './config.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  switch (cmd) {
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
      const { createBackup, backupDir } = await import('./domain/backup.js');
      const ctx = await createContextAsync(loadConfig());
      const r = await createBackup(ctx, flag('--out') ?? backupDir(ctx));
      console.log(`Sicherung erstellt: ${r.file}\n${r.manifest.files.length} Dateien, Schema ${r.manifest.schema}, ${JSON.stringify(r.manifest.counts)}`);
      if (r.manifest.storage === 's3') console.log('Hinweis: Dokumente liegen in S3 und sind nicht im Archiv – den Bucket gesondert sichern.');
      console.log('Wichtig: Den Hauptschlüssel (MASTER_KEY) getrennt von der Sicherung aufbewahren.');
      return;
    }
    case 'verify-backup': {
      const { verifyBackup } = await import('./domain/backup.js');
      const cfg = loadConfig();
      const r = await verifyBackup(args[0], cfg.masterKey);
      console.log(`Sicherung vom ${r.manifest.created_at}, Version ${r.manifest.version}, Schema ${r.manifest.schema}, ${r.manifest.files.length} Dateien`);
      if (r.problems.length) {
        console.error('Probleme:\n- ' + r.problems.join('\n- '));
        process.exit(2);
      }
      console.log('In Ordnung: alle Hashes stimmen, Schlüssel passt.');
      return;
    }
    case 'restore': {
      const { restoreBackup } = await import('./domain/backup.js');
      const cfg = loadConfig();
      const m = await restoreBackup(args[0], cfg.dataDir, cfg.masterKey, { force: args.includes('--force') });
      console.log(`Wiederhergestellt nach ${cfg.dataDir}: ${m.files.length} Dateien, ${JSON.stringify(m.counts)}. Jetzt den Dienst starten.`);
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
      console.log(`${envs.length} Vorgänge geprüft, ${bad} mit Auffälligkeiten.`);
      process.exit(bad ? 2 : 0);
    }
    default:
      console.log('Befehle: health | backup [--out DIR] | verify-backup DATEI | restore DATEI [--force] | setup-code | reset-link E-MAIL | verify-audit');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
