# 13. Sicherung und Updates

Dieses Kapitel richtet sich an die IT. Es beschreibt, was Paraph sichert und wie die Sicherung verschlüsselt ist, wie Sie Hauptschlüssel und Wiederherstellungs-Passphrase aufbewahren, wie Sie Sicherungen prüfen und wiederherstellen – auch auf einem neuen Server – und wie Sie Paraph mit `update.sh` aktualisieren und bei Bedarf zurückkehren. Stand: Version 0.3.0, Sicherungsformat `paraph-backup/2` (`src/server/domain/backup.ts`).

## Was eine Sicherung enthält

Eine Sicherung ist eine Datei `paraph-backup-<Zeitpunkt>.pbk`. Sie ist **vollständig verschlüsselt** und enthält:

| Inhalt | Beschreibung |
|---|---|
| `paraph.db` | konsistente Momentaufnahme der SQLite-Datenbank (Online-Sicherung, der Dienst läuft weiter): Konten, Organisationen, Vorgänge, Vorlagen, Audit-Trails, Anker, Einstellungen, verschlüsselte Geheimnisse |
| `blobs/…` | alle Dokumentdateien, die die Datenbank kennt (Dokumente, Unterschriften, Anhänge, Ergebnisse), aus der lokalen Ablage oder aus S3. Jede Datei ist zusätzlich so verschlüsselt, wie sie gespeichert ist (AES-256-GCM). |
| `secrets/master.key` | der Hauptschlüssel – **nur wenn eine Wiederherstellungs-Passphrase eingerichtet ist** |
| `manifest.json` | Format, Version, Schemaversion, Speicherart, SHA-256 und Größe jeder Datei, Anzahl der Datensätze, Prüfwert des Hauptschlüssels, ob der Hauptschlüssel enthalten ist |

Nicht enthalten sind `.env` (mit SMTP-Zugang, OIDC- und S3-Zugangsdaten), die Dateien in `secrets/` und die übrige Konfiguration. Bewahren Sie diese getrennt auf ([siehe unten](#sicherungen-an-einen-anderen-ort-kopieren)).

Konnte eine Datei beim Sichern nicht gelesen werden, entsteht die Sicherung trotzdem, aber unter dem Namen `paraph-backup-<Zeitpunkt>-UNVOLLSTAENDIG.pbk`. Das Manifest nennt die fehlenden Dateien, die Diagnose meldet einen Fehler, `verify-backup` meldet ein Problem, und die Instanz-Administratoren erhalten eine E-Mail. Unvollständige Sicherungen verdrängen keine vollständigen aus der Rotation.

### So ist die Sicherung verschlüsselt

- Ein zufälliger Datenschlüssel verschlüsselt den Inhalt in Blöcken von 1 MB mit AES-256-GCM.
- Jeder Block ist an den Kopf der Datei, seine Position und die Kennzeichnung „letzter Block“ gebunden. Vertauschte, gekürzte oder angehängte Blöcke fallen beim Entschlüsseln auf.
- Der Datenschlüssel steht verpackt im Kopf der Datei:
  - immer mit einem aus dem Hauptschlüssel abgeleiteten Schlüssel,
  - zusätzlich mit der Wiederherstellungs-Passphrase (scrypt, N = 2^15, r = 8, p = 1), wenn sie eingerichtet ist.
- Die Datei hat die Rechte 0600, der Sicherungsordner 0700.

Damit verlässt auch die Datenbank, in der Namen, E-Mail-Adressen und Feldwerte im Klartext stehen, den Server nur verschlüsselt.

### Sicherungen aus Version 0.1.0

Sicherungen aus 0.1.0 (`paraph-backup-<Zeitpunkt>.zip`) enthalten die Datenbank **unverschlüsselt**; nur die Dokumente sind verschlüsselt. Paraph öffnet sie nur auf ausdrücklichen Wunsch mit der Option `--allow-legacy` (bei `verify-backup` und `restore`), weil sich sonst eine fremde Datenbank unterschieben ließe. Verwenden Sie die Option nur, wenn die Herkunft der Datei sicher ist. `restore.sh` gibt die Option nicht weiter; Altsicherungen stellen Sie [von Hand](#von-hand-wiederherstellen) wieder her.

Die automatische Bereinigung zählt `.zip`- und `.pbk`-Dateien gemeinsam und entfernt alte `.zip`-Sicherungen mit der Zeit. Manuell abgelegte Kopien bleiben, bis Sie sie löschen.

## Hauptschlüssel und Passphrase aufbewahren

Ohne Hauptschlüssel sind alle Dokumente, Unterschriften, TOTP-Geheimnisse, Webhook-Geheimnisse und der Siegelschlüssel unlesbar, auch aus einer intakten Sicherung.

`install.sh` legt zwei Dateien an ([Kapitel 11](11-installation.md#was-das-skript-danach-tut)):

| Datei | Im Container | Zweck |
|---|---|---|
| `secrets/master.key` | `/run/secrets/master_key` (`MASTER_KEY_FILE`) | Hauptschlüssel |
| `secrets/backup_passphrase` | `/run/secrets/backup_passphrase` (`BACKUP_PASSPHRASE_FILE`) | Wiederherstellungs-Passphrase, 32 Zeichen |

**Mit Passphrase** enthält jede Sicherung den Hauptschlüssel. Wer Sicherungsdatei und Passphrase hat, kann alles wiederherstellen, auch auf einem neuen Server ohne den alten Hauptschlüssel.

**Ohne Passphrase** enthält die Sicherung keinen Hauptschlüssel. Sie ist nur mit dem ursprünglichen `MASTER_KEY` lesbar. `paraph backup`, die Betriebsdiagnose und Einstellungen → System („Schlüsselmaterial“) weisen darauf hin.

So bewahren Sie beides auf:

- Übernehmen Sie die Passphrase sofort nach der Installation in einen Passwortmanager oder Tresor, getrennt von den Sicherungsdateien.
- Legen Sie Sicherungsdateien und Passphrase nie gemeinsam ab. Wer beides hat, kann alle Dokumente lesen.
- Bewahren Sie zusätzlich `secrets/master.key` getrennt auf (eine Zeile Base64, 44 Zeichen). Dann bleiben auch Sicherungen ohne Passphrase lesbar.

> **Wichtig:** Auf dem Server liegen Schlüssel und Passphrase nebeneinander in `secrets/`. Gegen jemanden mit Zugriff auf den Server schützt die Passphrase nicht; sie schützt Sicherungen, die den Server verlassen.

## Automatisch sichern

Standardmäßig erstellt Paraph alle 24 Stunden eine Sicherung (`BACKUP_INTERVAL_HOURS`) und behält die letzten 14 (`BACKUP_KEEP`). Ziel ist `/backups` im Container, auf dem Host `./backups` (`BACKUP_PATH`).

- Paraph merkt sich den Zeitpunkt des letzten Laufs. Nach einem Neustart sichert es erst wieder, wenn der Abstand erreicht ist; häufige Neustarts erzeugen keine zusätzlichen Sicherungen.
- Scheitert eine Sicherung, versucht Paraph es bis zu 8-mal mit wachsendem Abstand (höchstens eine Stunde). Scheitert sie endgültig, erhalten die Instanz-Administratoren eine E-Mail (höchstens eine je 24 Stunden), und der nächste Versuch folgt zum regulären Zeitpunkt.
- Gelöscht werden nur ältere vollständige Sicherungen, und nur nach einem vollständigen Lauf. Von unvollständigen Sicherungen bleiben die drei neuesten. Reste abgebrochener Läufe (`.part`, `.work-…`) räumt Paraph auf.
- Ist die letzte Sicherung älter als das Doppelte des Abstands plus eine Stunde, meldet die Betriebsdiagnose einen Fehler. Mit `BACKUP_INTERVAL_HOURS=0` ist die automatische Sicherung aus; die Diagnose meldet dann einen Hinweis.

Zeitpunkt, Dateiname und Schlüsselmaterial der letzten Sicherung zeigt Einstellungen → System im Abschnitt „Sicherung“. Für das Monitoring gibt es die Metrik `paraph_backup_age_seconds` ([Kapitel 12](12-konfiguration.md#monitoring)).

## Von Hand sichern

In der Oberfläche: Einstellungen → System → „Jetzt sichern“. Die Sicherung läuft als Hintergrundaufgabe.

Auf der Kommandozeile:

```sh
docker compose exec paraph paraph backup
```

Die Ausgabe nennt Dateiname, Anzahl der Dateien, Schemaversion, Anzahl der Datensätze und ob der Hauptschlüssel enthalten ist. Diese Sicherung zählt wie eine automatische (Rotation, „Letzte Sicherung“).

Mit `--out` wählen Sie einen anderen Ordner, z. B. `paraph backup --out /backups/vor-umzug`. Solche Sicherungen löscht die automatische Bereinigung nicht, und sie erscheinen nicht als „Letzte Sicherung“.

## Eine Sicherung prüfen

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

Die erste Zeile nennt, womit die Sicherung geöffnet wurde: per Hauptschlüssel, per Passphrase oder Altformat. Passt der Hauptschlüssel der Instanz nicht, versucht Paraph die Passphrase aus `BACKUP_PASSPHRASE_FILE` (oder aus `--passphrase-file DATEI`).

„In Ordnung“ bedeutet: Die Sicherung ist entschlüsselt, vollständig und unbeschädigt. Bei Problemen nennt der Befehl sie und endet mit einem Exit-Code ungleich 0.

## Sicherungen an einen anderen Ort kopieren

Der Sicherungsordner liegt auf demselben Server. Kopieren Sie die Dateien regelmäßig an einen anderen Ort (NAS, externer Speicher, Cloud-Speicher), z. B. per `rsync` oder Restic. Die Dateien sind bereits verschlüsselt.

Für eine Wiederherstellung auf einem neuen Server brauchen Sie außerdem, getrennt aufbewahrt:

| Was | Warum |
|---|---|
| Wiederherstellungs-Passphrase (oder `secrets/master.key`) | öffnet die Sicherung |
| `.env` oder ihre wichtigen Werte | `APP_URL`, SMTP, OIDC, S3, `TSA_URL` stehen nicht in der Sicherung. `.env` enthält Zugangsdaten und gehört nicht unverschlüsselt neben die Sicherungen. |
| bei eigenem Zeitstempeldienst: dessen PEM-Zertifikat | Vertrauensanker (`secrets/tsa_ca.pem`) |

Auch die Unterordner `backups/vor-update/` und `backups/vor-rueckweg/` (siehe [Updates](#paraph-aktualisieren)) liegen im Sicherungsordner und werden so mitkopiert.

## Mit restore.sh wiederherstellen

```sh
sudo ./scripts/restore.sh backups/paraph-backup-2026-10-22T03-00-00-000Z.pbk
```

Das Skript setzt eine `.env` voraus (vorher `install.sh` ausführen) und mindestens eine der Dateien `secrets/master.key` oder `secrets/backup_passphrase`. Liegt die Sicherung nicht in `backups/`, kopiert es sie dorthin. Dann prüft es die Sicherung mit `verify-backup`.

### Auf demselben Server

`secrets/master.key` passt zur Sicherung.

1. Das Skript fragt „Vorhandene Daten dieser Instanz durch die Sicherung ersetzen?“. Antworten Sie mit `ja`.
2. Es stoppt Paraph, ersetzt die Daten (`paraph restore --force`) und startet die Dienste.
3. Es wartet auf Bereitschaft und prüft alle Audit-Ketten mit `paraph verify-audit`.

### Auf einem neuen Server (Katastrophenfall)

Der alte Server und sein Hauptschlüssel sind verloren. Sie haben die Sicherungsdatei und die Passphrase.

1. Paraph auf den neuen Server holen und `sudo ./scripts/install.sh` ausführen ([Kapitel 11](11-installation.md)). Verwenden Sie dieselbe Domain, damit `APP_URL` gleich bleibt; sonst zeigen Links in bereits versandten E-Mails auf die alte Adresse. Das Skript erzeugt neue Schlüssel.
2. SMTP-, OIDC- und S3-Angaben in `.env` wie auf dem alten Server eintragen.
3. Die Passphrase der alten Instanz aus dem Passwortmanager in `secrets/backup_passphrase` eintragen. Die neu erzeugte Datei ersetzen Sie dabei; danach Rechte 0400 und Eigentümer UID 1000 setzen.
4. Die Sicherungsdatei auf den Server kopieren und `sudo ./scripts/restore.sh <Datei>` aufrufen.
5. Das Skript erkennt, dass die Sicherung nur per Passphrase lesbar ist, und fragt „Schlüssel aus der Sicherung übernehmen?“. Antworten Sie mit `ja`. Der bisherige Schlüssel bleibt als `secrets/master.key.ersetzt-<Zeitpunkt>` erhalten.
6. Nach der Rückfrage zum Ersetzen stellt das Skript die Daten wieder her, startet und prüft mit `paraph verify-audit`.

Fehlt `secrets/master.key` ganz, übernimmt das Skript den Schlüssel ohne Rückfrage aus der Sicherung.

Ohne Rückfragen: `PARAPH_NONINTERACTIVE=1`. Die Übernahme des Schlüssels verlangt dann zusätzlich `PARAPH_TAKE_KEY=1`; ohne sie bricht das Skript ab.

Nach dem Start: anmelden, einen abgeschlossenen Vorgang öffnen und das Nachweispaket herunterladen.

## Von Hand wiederherstellen

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

- `restore-key` braucht die Passphrase (`BACKUP_PASSPHRASE_FILE` oder `--passphrase-file DATEI`), überschreibt keine vorhandene Datei und schreibt mit den Rechten 0600. Der Zielordner muss für UID 1000 beschreibbar sein.
- `restore` prüft die Sicherung zuerst wie `verify-backup` und bricht bei jedem Problem ab. Der eingerichtete Hauptschlüssel muss zur Sicherung passen; sonst verweist die Meldung auf `restore-key`.
- Ist das Datenverzeichnis nicht leer, verweigert `restore` die Arbeit; `--force` ersetzt die vorhandene Datenbank.
- Die Dokumente schreibt `restore` zuerst, die Datenbank zuletzt. Bricht der Vorgang ab, bleibt der alte Stand nutzbar.
- Für Sicherungen aus 0.1.0 hängen Sie `--allow-legacy` an.

## S3-Speicher sichern und wechseln

Mit `S3_BUCKET` liegen die Dokumente im Bucket. Die Sicherung liest sie von dort und enthält sie vollständig. Bei großen Datenmengen dauert die Sicherung entsprechend länger, weil jede Datei aus dem Bucket geladen wird.

`restore` schreibt die Dokumente in die **aktuell konfigurierte** Ablage. Damit ist auch ein Wechsel möglich: eine Sicherung aus lokaler Ablage in eine Instanz mit S3 zurückspielen oder umgekehrt.

## Einen Restore-Test durchführen

Eine Sicherung ist erst dann eine Sicherung, wenn die Wiederherstellung geprüft ist.

- Spielen Sie vierteljährlich und nach jedem größeren Update eine Wiederherstellung auf einem Testrechner durch ([Katastrophenfall](#auf-einem-neuen-server-katastrophenfall), andere Ports, kein produktives SMTP).
- Verwenden Sie dabei die Passphrase aus dem Passwortmanager, nicht die Kopie vom Produktivserver.
- Dokumentieren Sie das Ergebnis kurz: Datum, Sicherungsdatei, `verify-audit` ohne Abweichungen, ein Nachweispaket geöffnet.

Der Docker-Gesamttest `scripts/docker-e2e.mjs` spielt den Katastrophenfall automatisiert durch (Test J, siehe [Kapitel 16](16-tests-und-nachweise.md)).

## Paraph aktualisieren

```sh
sudo ./scripts/update.sh                 # neueste Fassung aus Git (fast-forward)
sudo ./scripts/update.sh --ref v0.3.0    # bestimmter Tag oder Commit
sudo ./scripts/update.sh --no-pull       # nur neu bauen, z. B. nach manuell entpacktem Archiv
sudo ./scripts/update.sh --rollback      # zurück auf den Stand vor dem letzten Update
```

`update.sh` setzt `.paraph-install` voraus, das nur `install.sh` anlegt, und liest `PARAPH_IMAGE` aus `.env`. Fehlt `secrets/tsa_ca.pem` (Installationen aus 0.1.0), legt es die Datei leer an.

| Schritt | Inhalt |
|---|---|
| 1/6 Zustand prüfen | Paraph muss bereit sein. Sonst bricht das Skript ab, ohne etwas zu ändern. Es zeigt die laufende Version. |
| 2/6 Verschlüsselte Sicherung | `paraph backup` mit der laufenden Version, danach `paraph verify-backup`. Scheitert eines davon, endet das Update ohne Änderung. |
| 3/6 Rückfall-Image markieren | Das laufende Image erhält zusätzlich den Namen `paraph:rollback-<Zeitpunkt>`. Die Sicherung wandert nach `backups/vor-update/` und fällt so aus der Rotation; dort bleiben die drei neuesten. Image, Sicherungsdatei und Zeitpunkt stehen in `.paraph-update-state`. |
| 4/6 Neuen Stand holen und bauen | `git fetch --tags` und `git pull --ff-only` bzw. `git checkout <ref>`. Ohne Git-Verzeichnis bricht das Skript ab (dann `--no-pull`). Danach `docker compose build --pull`. Neues Image: `paraph:<Version>`; ist dieser Name schon vergeben, mit angehängtem Zeitpunkt. |
| 5/6 Starten | Die Datenbankmigration läuft beim Start automatisch; vorher legt Paraph eine Kopie der Datenbank an (siehe unten). Wird der neue Stand nicht bereit, zeigt das Skript das Protokoll und nennt den Rückweg. |
| 6/6 Prüfen | `paraph doctor --quick` und `paraph verify-audit`. Meldet die Audit-Prüfung Abweichungen, endet das Skript mit Fehler und nennt den Rückweg. |

Erst nach erfolgreichem Start trägt das Skript das neue Image als `PARAPH_IMAGE` in `.env` ein. Am Ende nennt es die Sicherung vorab und den Rückweg.

### Ein fertiges Image einspielen

Mit `PARAPH_SKIP_BUILD=1` verwendet `update.sh` statt zu bauen ein lokal vorhandenes Image namens `paraph:<Version>` (Version aus `package.json` des neuen Stands). Für das Image von GitHub ([Kapitel 11](11-installation.md#das-fertige-image-von-github-verwenden)) geben Sie ihm vorher diesen Namen:

```sh
sudo docker pull ghcr.io/pbaumfalk/paraph:0.3.0
sudo docker tag ghcr.io/pbaumfalk/paraph:0.3.0 paraph:0.3.0
sudo PARAPH_SKIP_BUILD=1 ./scripts/update.sh --ref v0.3.0
```

Git-Stand und Image-Version müssen zusammenpassen, denn `docker-compose.yml`, `Caddyfile` und Skripte kommen aus dem Checkout. Fehlt das Image, baut das Skript wie gewohnt. (Abgeleitet aus `update.sh`; dieser Weg ist nicht automatisiert getestet.)

### Kopie vor der Migration

Vor jeder Migration einer bestehenden Datenbank schreibt Paraph eine Kopie nach `/data/backups/migrations/pre-migration-schema<N>-<Zeitpunkt>.db` (im Datenvolume, Rechte 0600; `<N>` ist die Schemaversion vor der Migration). Die drei neuesten bleiben erhalten. Die Kopie ist **nicht verschlüsselt**, liegt im selben Volume wie die Datenbank und enthält keine Dokumente. Sie ersetzt keine Sicherung.

Eine Datenbank aus einer neueren Version startet nicht mit einem älteren Programm. Paraph bricht dann mit einer Meldung ab. Aus demselben Grund lehnt `verify-backup` Sicherungen mit neuerem Schema ab.

### Zum vorherigen Stand zurückkehren

```sh
sudo ./scripts/update.sh --rollback
```

Das Skript

1. prüft, dass Rückfall-Image und Sicherung aus `.paraph-update-state` noch vorhanden sind, und prüft die Sicherung mit dem alten Programmstand (`verify-backup`),
2. zeigt, auf welchen Stand es zurückgeht, und fragt nach („Fortfahren? (ja/nein)“),
3. sichert den aktuellen Stand nach `backups/vor-rueckweg/`. Läuft Paraph nicht, kopiert es mindestens die Datenbank dorthin – **unverschlüsselt**; löschen Sie die Kopie nach Klärung.
4. stoppt Paraph und stellt mit dem alten Image die Sicherung aus Schritt 2 wieder her (`restore --force`),
5. setzt `PARAPH_IMAGE` auf das Rückfall-Image und startet.

Scheitert einer der ersten drei Schritte, bricht das Skript ab, ohne etwas zu verändern.

> **Wichtig:** Alles, was nach dem Update in Paraph geschah (Vorgänge, Unterschriften), ist nach dem Rückweg nicht mehr in der laufenden Instanz. Es steht nur noch in der Sicherung unter `backups/vor-rueckweg/`.

Die Rückfall-Images bleiben im lokalen Docker-Speicher, bis Sie sie entfernen (`docker image rm paraph:rollback-…`).

### Eine Installation aus 0.1.0 umstellen

`update.sh` setzt `.paraph-install` voraus, das nur `install.sh` anlegt. Mit `init.sh` eingerichtete Installationen stellen Sie so um. Der Weg ergibt sich aus dem Code und ist nicht automatisiert getestet (der Docker-Gesamttest installiert 0.1.0 mit `install.sh`, siehe [Kapitel 16](16-tests-und-nachweise.md)):

1. Mit der laufenden Version sichern: `docker compose exec paraph paraph backup`
2. Neue Fassung holen: `git pull`
3. `sudo ./scripts/install.sh` ausführen. Vorhandene `.env` und `secrets/master.key` bleiben unverändert; das Skript erzeugt `secrets/backup_passphrase` und `secrets/tsa_ca.pem`, setzt Rechte und Eigentümer der Schlüssel (auch die unter `init.sh` für alle lesbare Schlüsseldatei wird 0400), baut und startet. Die Migration läuft beim Start.

Bei einer vorhandenen `.env` schreibt `install.sh` `DOMAIN`, `ACME_EMAIL` und `TSA_URL` nicht hinein. Wer Caddy neu einsetzen will, trägt `DOMAIN` und `ACME_EMAIL` selbst in `.env` ein; wer seinen bisherigen Proxy behält, antwortet bei Caddy mit „nein“. Beantworten Sie die Frage nach dem Zeitstempeldienst passend zu `TSA_URL` in `.env` ([Kapitel 11](11-installation.md#installsh-erneut-aufrufen)). Prüfen Sie außerdem `TRUST_PROXY`: Seit 0.2.0 bedeutet `true` genau einen Hop.

Notieren Sie die angezeigte Wiederherstellungs-Passphrase. Ältere Sicherungen im Altformat bleiben lesbar, aber nur mit `--allow-legacy` ([siehe oben](#sicherungen-aus-version-010)).

---

← [12. Konfiguration](12-konfiguration.md) · [Inhalt](README.md) · [14. Sicherheit und Nachweis](14-sicherheit-und-nachweis.md) →
