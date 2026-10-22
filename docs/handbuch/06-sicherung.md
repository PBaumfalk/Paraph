# 6. Sicherung und Wiederherstellung

Stand: Version 0.2.0 (Sicherungsformat `paraph-backup/2`, `src/server/domain/backup.ts`).

## Was gesichert wird

Eine Sicherung ist eine Datei `paraph-backup-<Zeitpunkt>.pbk`. Sie ist **vollständig verschlüsselt** und enthält:

| Inhalt | Beschreibung |
|---|---|
| `paraph.db` | konsistente Momentaufnahme der SQLite-Datenbank (Online-Backup, Dienst läuft weiter): Konten, Organisationen, Vorgänge, Vorlagen, Audit-Trails, Anker, Einstellungen, verschlüsselte Geheimnisse |
| `blobs/…` | alle Dokumentdateien, die die Datenbank kennt (Dokumente, Unterschriften, Anhänge, Ergebnisse), aus der lokalen Ablage oder aus S3; jede Datei zusätzlich wie gespeichert AES-256-GCM-verschlüsselt |
| `secrets/master.key` | der Hauptschlüssel, **nur wenn eine Wiederherstellungs-Passphrase eingerichtet ist** |
| `manifest.json` | Format, Version, Schemaversion, Speicherart, SHA-256 und Größe jeder Datei, Anzahl der Datensätze, Prüfwert des Hauptschlüssels, ob der Hauptschlüssel enthalten ist |

Nicht enthalten sind `.env` und die übrige Konfiguration.

Konnte eine Datei beim Sichern nicht gelesen werden, entsteht die Sicherung trotzdem; das Manifest nennt die fehlenden Dateien, die automatische Sicherung gilt als fehlgeschlagen, und `verify-backup` meldet ein Problem.

### Verschlüsselung

- Ein zufälliger Datenschlüssel verschlüsselt den Inhalt in Blöcken von 1 MB mit AES-256-GCM.
- Jeder Block ist an den Kopf der Datei, seine Position und die Kennzeichnung „letzter Block“ gebunden. Vertauschte, gekürzte oder angehängte Blöcke fallen beim Entschlüsseln auf.
- Der Datenschlüssel steht verpackt im Kopf der Datei:
  - immer mit einem aus dem Hauptschlüssel abgeleiteten Schlüssel,
  - zusätzlich mit der Wiederherstellungs-Passphrase (scrypt, N = 2^15, r = 8, p = 1), wenn sie eingerichtet ist.
- Die Datei hat die Rechte 0600, der Sicherungsordner 0700.

Damit verlässt auch die Datenbank (mit Namen, E-Mail-Adressen und Feldwerten im Klartext) den Server nur verschlüsselt.

### Altformat aus 0.1.0

Sicherungen aus Version 0.1.0 (`paraph-backup-<Zeitpunkt>.zip`) liest Paraph weiter (`verify-backup`, `restore`). In diesen Dateien liegt die Datenbank **unverschlüsselt**; nur die Dokumente sind verschlüsselt. Die automatische Bereinigung zählt `.zip`- und `.pbk`-Dateien gemeinsam und entfernt alte `.zip`-Sicherungen mit der Zeit. Manuell abgelegte Kopien bleiben, bis Sie sie löschen.

## Hauptschlüssel und Wiederherstellungs-Passphrase

Ohne Hauptschlüssel sind alle Dokumente, Unterschriften, TOTP-Geheimnisse, Webhook-Geheimnisse und der Siegelschlüssel unlesbar, auch aus einer intakten Sicherung.

`install.sh` legt zwei Dateien an ([Kapitel 2](02-installation.md#installation-mit-installsh)):

| Datei | Im Container | Zweck |
|---|---|---|
| `secrets/master.key` | `/run/secrets/master_key` (`MASTER_KEY_FILE`) | Hauptschlüssel |
| `secrets/backup_passphrase` | `/run/secrets/backup_passphrase` (`BACKUP_PASSPHRASE_FILE`) | Wiederherstellungs-Passphrase, 32 Zeichen |

**Mit Passphrase** enthält jede Sicherung den Hauptschlüssel. Wer Sicherungsdatei und Passphrase hat, kann alles wiederherstellen, auch auf einem neuen Server ohne den alten Hauptschlüssel.

**Ohne Passphrase** enthält die Sicherung keinen Hauptschlüssel. Sie ist nur mit dem ursprünglichen `MASTER_KEY` lesbar. `paraph backup`, die Betriebsdiagnose und Einstellungen → System weisen darauf hin.

Empfehlungen:

- Passphrase sofort nach der Installation in einen Passwortmanager oder Tresor übernehmen, getrennt von den Sicherungsdateien.
- Sicherungsdateien und Passphrase nie gemeinsam ablegen. Wer beides hat, kann alle Dokumente lesen.
- Zusätzlich `secrets/master.key` getrennt aufbewahren (eine Zeile Base64, 44 Zeichen). Dann bleiben auch Sicherungen ohne Passphrase lesbar.

Auf dem Server liegen Schlüssel und Passphrase nebeneinander in `secrets/`. Gegen jemanden mit Zugriff auf den Server schützt die Passphrase nicht; sie schützt Sicherungen, die den Server verlassen.

## Automatische Sicherung

Standardmäßig erstellt Paraph alle 24 Stunden eine Sicherung (`BACKUP_INTERVAL_HOURS`) und behält die letzten 14 (`BACKUP_KEEP`). Ziel ist `/backups` im Container, auf dem Host `./backups` (`BACKUP_PATH`).

Paraph merkt sich den Zeitpunkt der letzten erfolgreichen Sicherung. Nach einem Neustart sichert es erst wieder, wenn der Abstand erreicht ist; häufige Neustarts erzeugen keine zusätzlichen Sicherungen. Zeitpunkt, Dateiname und Schlüsselmaterial der letzten Sicherung zeigt Einstellungen → System. Ist die letzte Sicherung älter als das Doppelte des Abstands plus eine Stunde, meldet die Betriebsdiagnose einen Fehler. Scheitert die automatische Sicherung endgültig, erhalten die Instanz-Administratoren eine E-Mail.

Der Ordner liegt auf demselben Server. Kopieren Sie die Dateien regelmäßig an einen anderen Ort (NAS, externer Speicher, Cloud-Speicher), z. B. per `rsync` oder Restic. Die Dateien sind bereits verschlüsselt.

## Manuelle Sicherung

In der Oberfläche: Einstellungen → System → „Jetzt sichern“ (läuft als Hintergrundaufgabe).

Auf der Kommandozeile:

```sh
docker compose exec paraph paraph backup
```

Ausgabe: Dateiname, Anzahl Dateien, Schemaversion, Anzahl Datensätze und ob der Hauptschlüssel enthalten ist. Mit `--out /backups/vor-update` lässt sich ein anderer Ordner wählen. Sicherungen außerhalb des Standardordners löscht die automatische Bereinigung nicht.

## Sicherung prüfen

```sh
docker compose exec paraph paraph verify-backup /backups/paraph-backup-2026-10-22T03-00-00-000Z.pbk
```

Geprüft wird:

- ob sich die Datei entschlüsseln lässt und jeder Block authentisch ist,
- ob `manifest.json` vorhanden und das Format bekannt ist,
- ob jede Datei vorhanden ist und ihr SHA-256 stimmt,
- ob beim Sichern Dateien fehlten,
- ob die Schemaversion nicht neuer ist als die laufende Paraph-Version,
- ob ein enthaltener Hauptschlüssel zum Manifest passt,
- ob die Datenbank strukturell intakt ist (`PRAGMA integrity_check`).

Die erste Zeile nennt, womit die Sicherung geöffnet wurde: per Hauptschlüssel, per Passphrase oder Altformat. Passt der Hauptschlüssel der Instanz nicht, versucht Paraph die Passphrase aus `BACKUP_PASSPHRASE_FILE` (oder `--passphrase-file DATEI`).

„In Ordnung“ bedeutet: Die Sicherung ist entschlüsselt, vollständig und unbeschädigt. Bei Problemen nennt der Befehl sie und endet mit einem Exit-Code ungleich 0.

## Wiederherstellen mit `restore.sh`

```sh
sudo ./scripts/restore.sh backups/paraph-backup-2026-10-22T03-00-00-000Z.pbk
```

Das Skript setzt eine `.env` voraus (`install.sh` vorher ausführen) und kopiert die Datei bei Bedarf nach `backups/`.

**Fall 1 – gleicher Server:** `secrets/master.key` passt zur Sicherung. Nach Rückfrage stoppt das Skript Paraph, ersetzt die Daten (`restore --force`), startet und prüft mit `paraph verify-audit`.

**Fall 2 – neuer Server ohne den alten Hauptschlüssel:**

1. `sudo ./scripts/install.sh` ausführen. Es erzeugt eigene, neue Schlüssel.
2. Die Wiederherstellungs-Passphrase der alten Instanz aus dem Passwortmanager in `secrets/backup_passphrase` eintragen (die neu erzeugte Datei ersetzen; Rechte 0400, Eigentümer UID 1000).
3. Sicherungsdatei auf den Server kopieren und `restore.sh` aufrufen.

Das Skript erkennt, dass die Sicherung nur per Passphrase lesbar ist, und fragt, ob es den Hauptschlüssel aus der Sicherung übernehmen soll. Der bisherige Schlüssel bleibt als `secrets/master.key.ersetzt-<Zeitpunkt>` erhalten. Danach stellt es die Daten wieder her, startet und prüft.

Ohne Rückfragen: `PARAPH_NONINTERACTIVE=1`; für die Übernahme des Schlüssels zusätzlich `PARAPH_TAKE_KEY=1`.

`APP_URL` in der neuen `.env` sollte der alten entsprechen, sonst zeigen Links in bereits versandten E-Mails auf die alte Adresse.

## Wiederherstellen von Hand

```sh
# Paraph stoppen
docker compose stop paraph

# Nur wenn der Hauptschlüssel fehlt: aus einer Sicherung mit Passphrase übernehmen
docker compose run --rm --no-deps -v "$PWD/schluessel:/out" paraph \
  paraph restore-key /backups/paraph-backup-….pbk --out /out/master.key
# danach schluessel/master.key nach secrets/master.key verschieben (Rechte 0400, Eigentümer UID 1000)

# Wiederherstellen (ohne Gotenberg zu starten)
docker compose run --rm --no-deps paraph paraph restore /backups/paraph-backup-….pbk --force

docker compose up -d
docker compose exec paraph paraph verify-audit
```

`restore-key` überschreibt keine vorhandene Datei. Der Zielordner muss für UID 1000 beschreibbar sein.

`restore` prüft die Sicherung zuerst wie `verify-backup` und bricht bei jedem Problem ab. Der eingerichtete Hauptschlüssel muss zur Sicherung passen. Ist das Datenverzeichnis nicht leer, verweigert `restore` die Arbeit; `--force` ersetzt die vorhandene Datenbank. Die Dokumente schreibt `restore` zuerst, die Datenbank zuletzt: Bricht der Vorgang ab, bleibt der alte Stand nutzbar.

Nach dem Start: in der Oberfläche anmelden, einen abgeschlossenen Vorgang öffnen und das Nachweispaket herunterladen.

## S3

Mit `S3_BUCKET` liegen die Dokumente im Bucket. Die Sicherung liest sie von dort und enthält sie vollständig. `restore` schreibt die Dokumente in die **aktuell konfigurierte** Ablage. Damit ist auch ein Wechsel möglich: Sicherung aus lokaler Ablage in eine Instanz mit S3 zurückspielen oder umgekehrt.

Bei großen Datenmengen dauert die Sicherung entsprechend länger, weil jede Datei aus dem Bucket geladen wird.

## Kopie vor Datenbankmigrationen

Unabhängig von den Sicherungen legt Paraph vor jeder Migration eine Kopie der Datenbank unter `/data/backups/migrations/` an (die drei neuesten bleiben). Siehe [Kapitel 2](02-installation.md#kopie-vor-der-migration). Diese Kopie ersetzt keine Sicherung: Sie liegt im selben Volume und enthält keine Dokumente.

## Restore-Test

Eine Sicherung ist erst dann eine Sicherung, wenn die Wiederherstellung geprüft ist. Empfehlung:

- vierteljährlich und nach jedem größeren Update eine Wiederherstellung auf einem Testrechner durchspielen (Fall 2 oben, andere Ports, kein produktives SMTP),
- dabei die Passphrase aus dem Passwortmanager verwenden, nicht die Kopie vom Produktivserver,
- Ergebnis kurz dokumentieren: Datum, Sicherungsdatei, `verify-audit` ohne Abweichungen, ein Nachweispaket geöffnet.

`scripts/docker-e2e.mjs` spielt den Katastrophenfall automatisiert durch (Test J, siehe [Kapitel 9](09-tests-und-nachweise.md)).
