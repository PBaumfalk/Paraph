# 6. Sicherung und Wiederherstellung

## Was gesichert wird

Eine Sicherung ist eine ZIP-Datei `paraph-backup-<Zeitpunkt>.zip` (`src/server/domain/backup.ts`) mit:

| Inhalt | Beschreibung |
|---|---|
| `paraph.db` | konsistente Momentaufnahme der SQLite-Datenbank (Online-Backup, Dienst läuft weiter): Konten, Organisationen, Vorgänge, Vorlagen, Audit-Trails, Einstellungen, verschlüsselte Geheimnisse |
| `blobs/…` | alle gespeicherten Dateien (Dokumente, Unterschriften, Anhänge, Ergebnisse), so wie sie auf der Platte liegen: AES-256-GCM-verschlüsselt |
| `manifest.json` | Format, Version, Schemaversion, Speicherart, SHA-256 und Größe jeder Datei, Anzahl der Datensätze, Prüfwert des Hauptschlüssels |

**Nicht** enthalten:

- der **Hauptschlüssel** (`secrets/master.key` bzw. `MASTER_KEY`). Das Manifest enthält nur einen daraus abgeleiteten Prüfwert, mit dem sich feststellen lässt, ob ein Schlüssel passt;
- `.env` und die übrige Konfiguration;
- bei S3-Speicher die Dateien (siehe unten).

## Hauptschlüssel getrennt sichern

Ohne den Hauptschlüssel sind alle Dokumente, Unterschriften, TOTP-Geheimnisse, Webhook-Geheimnisse und der Siegelschlüssel unlesbar, auch aus einer intakten Sicherung. Es gibt keinen Wiederherstellungsweg.

- `secrets/master.key` an mindestens einem zweiten Ort aufbewahren, getrennt von den Sicherungsdateien (z. B. Passwortmanager, versiegelter Umschlag im Tresor).
- Sicherungen und Schlüssel nie im selben Archiv oder auf demselben Datenträger ablegen. Wer beides hat, kann alle Dokumente lesen.
- Prüfen Sie nach der Ablage, dass der Schlüssel lesbar und vollständig ist (eine Zeile Base64, 44 Zeichen).

## Automatische Sicherung

Standardmäßig erstellt Paraph alle 24 Stunden eine Sicherung (`BACKUP_INTERVAL_HOURS`) und behält die letzten 14 (`BACKUP_KEEP`). Ziel ist `/backups` im Container, auf dem Host `./backups` (`BACKUP_PATH`). Die erste automatische Sicherung entsteht bei jedem Start des Containers, danach im eingestellten Abstand. Häufige Neustarts erzeugen also zusätzliche Sicherungen und verdrängen ältere. Zeitpunkt und Ergebnis der letzten Sicherung zeigt Einstellungen → System.

Der Ordner liegt auf demselben Server. Kopieren Sie die Dateien regelmäßig an einen anderen Ort (NAS, externer Speicher, verschlüsselter Cloud-Speicher), z. B. per `rsync` oder Restic.

## Manuelle Sicherung

```sh
docker compose exec paraph paraph backup
```

Ausgabe: Dateiname, Anzahl Dateien, Schemaversion, Anzahl Datensätze. Mit `--out /backups/vor-update` lässt sich ein anderer Ordner wählen. Manuelle Sicherungen außerhalb des Standardordners löscht die automatische Bereinigung nicht.

## Sicherung prüfen

```sh
docker compose exec paraph paraph verify-backup /backups/paraph-backup-2026-10-22T03-00-00-000Z.zip
```

Geprüft wird:

- ob `manifest.json` vorhanden und das Format bekannt ist,
- ob jede Datei vorhanden ist und ihr SHA-256 stimmt,
- ob die Schemaversion nicht neuer ist als die laufende Paraph-Version,
- ob der konfigurierte Hauptschlüssel zur Sicherung passt.

„In Ordnung“ bedeutet: Die Sicherung ist vollständig, unbeschädigt und mit diesem Schlüssel wiederherstellbar. Bei Problemen endet der Befehl mit Exit-Code 2 und nennt sie.

## Wiederherstellen in eine frische Umgebung

Voraussetzungen: dieselbe oder eine neuere Paraph-Version, der passende Hauptschlüssel unter `secrets/master.key`, eine `.env` mit derselben `APP_URL`.

```sh
# 1. Projektordner mit docker-compose.yml, .env und secrets/master.key bereitstellen
#    Sicherungsdatei nach ./backups/ kopieren

# 2. Wiederherstellen in das (leere) Datenvolume, ohne Gotenberg zu starten
docker compose run --rm --no-deps paraph paraph restore /backups/paraph-backup-2026-10-22T03-00-00-000Z.zip

# 3. Starten
docker compose up -d
```

`restore` prüft die Sicherung zuerst wie `verify-backup` und bricht bei jedem Problem ab. Ist das Datenverzeichnis nicht leer, verweigert es die Arbeit. `--force` ersetzt eine vorhandene Datenbank und den Dateiordner; der Dienst muss dafür gestoppt sein (`docker compose stop paraph`).

Nach dem Start prüfen:

```sh
docker compose exec paraph paraph verify-audit
```

und in der Oberfläche anmelden, einen abgeschlossenen Vorgang öffnen und das Nachweispaket herunterladen.

## S3

Mit `S3_BUCKET` liegen die Dateien im S3-Bucket. Die Sicherung enthält dann nur die Datenbank; `paraph backup` weist darauf hin. Sichern Sie den Bucket gesondert (Versionierung, Replikation oder Kopie). Die Objekte sind vor dem Hochladen mit dem Hauptschlüssel verschlüsselt; auch für sie gilt: ohne Schlüssel unlesbar.

Datenbank und Bucket müssen zeitlich zusammenpassen. Eine Datenbank, die auf Objekte verweist, die im Bucket fehlen, führt zu nicht ladbaren Dokumenten.

## Restore-Test

Eine Sicherung ist erst dann eine Sicherung, wenn die Wiederherstellung geprüft ist. Empfehlung:

- vierteljährlich und nach jedem größeren Update eine Wiederherstellung auf einem Testrechner durchspielen (Schritte oben, andere `HOST_PORT`, kein SMTP),
- dabei auch den getrennt verwahrten Hauptschlüssel verwenden, nicht die Kopie vom Produktivserver,
- Ergebnis kurz dokumentieren: Datum, Sicherungsdatei, `verify-audit` ohne Auffälligkeiten, ein Nachweispaket geöffnet.

Das Skript `scripts/docker-e2e.mjs` zeigt den vollständigen Ablauf automatisiert (Test J, siehe [Kapitel 9](09-tests-und-nachweise.md)).
