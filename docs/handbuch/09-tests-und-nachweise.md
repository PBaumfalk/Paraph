# 9. Tests und Nachweise

Stand: 22.10.2026, Version 0.2.0 (Commit `e77641f`). Vitest, Docker-Gesamtprüfung und die unabhängigen Prüfwerkzeuge wurden an diesem Tag ausgeführt. Welche Tests nur mit zusätzlichen Diensten laufen, steht jeweils dabei.

## Übersicht

| Test | Inhalt | Werkzeug | Ergebnis |
|---|---|---|---|
| A | Hochladen → Felder setzen → Versand → E-Mail → Unterschrift → Download | Vitest (`tests/flows.test.ts`); Playwright Desktop Chrome mit SMTP über Mailpit (`e2e/a-full-flow.spec.ts`) | bestanden. Felder per Klick gesetzt, Unterschrift mit der Maus gezeichnet. Im heruntergeladenen PDF 0 neue Pixel außerhalb der Felder. |
| B | Zwei Unterzeichner nacheinander, mehrseitiges Dokument | Vitest | bestanden. Reihenfolge eingehalten, finales Dokument enthält beide Unterschriften. |
| C | Unterschreiben auf dem Smartphone | Playwright: Pixel 7 (Chromium), iPhone 14 (WebKit) (`e2e/c-mobile.spec.ts`) | bestanden. Touch-Unterschrift, Auswahlfeld, Kontrollkästchen, Datum; kein horizontales Scrollen. |
| D | Ablehnung mit Begründung | Vitest; Playwright | bestanden. Status „abgelehnt“, danach kein Abschluss möglich. |
| E | Widerruf, Ablauf, Erinnerung | Vitest; Playwright (Widerruf) | bestanden. Widerrufene Links und offene Sitzungen wirkungslos; abgelaufene Anfrage nicht mehr unterschreibbar; Erinnerung erzeugt neuen Link, der vorherige bleibt gültig; „Neuer Link“ widerruft beide. |
| F | Mandantentrennung | Vitest | bestanden. Fremde Organisation sieht und lädt nichts, auch nicht per API-Schlüssel; CSRF ohne Token und fremder Origin abgewiesen; Empfänger können keine fremden Felder setzen und keine fremden Unterschriften verwenden. |
| G | API und Webhooks | Vitest (`tests/api-webhooks.test.ts`) | bestanden. Abgelaufener API-Schlüssel abgewiesen; Felder per Ankertext; Idempotency-Key: Wiederholung liefert gespeicherte Antwort, abweichende Anfrage 422; Webhook-Signatur (HMAC) geprüft; erster Zustellversuch mit HTTP 500 beantwortet, Wiederholung erfolgreich; SSRF-Sperre greift; Testmodus getrennt; widerrufener Schlüssel abgewiesen. |
| H | Vorlagen mit Versionen | Vitest; Playwright | bestanden. Versionen unveränderlich (auch der Datenbank-Trigger), alte Vorgänge bleiben unverändert; Vorlage in der Oberfläche anlegen, veröffentlichen, verwenden. |
| I | Neustart ohne Datenverlust | `scripts/docker-e2e.mjs` | bestanden. `docker compose down` / `up`: Hash des finalen PDFs bitgleich, Audit-Kette intakt. |
| J | Katastrophenfall: neue Umgebung ohne Hauptschlüssel, nur mit Passphrase | `scripts/docker-e2e.mjs`; Vitest (`tests/backup.test.ts`) | bestanden. Sicherung enthält den Hauptschlüssel und ist verschlüsselt; neue Installation, `restore.sh` übernimmt den Schlüssel; Anmeldung, Hash des finalen PDFs, Nachweispaket und `verify-audit` in Ordnung. |
| K | Prüfung des Ergebnis-PDFs | in A, B und den Abläufen enthalten; eigene Prüfroutine `src/server/pdf/verify.ts`; unabhängige Werkzeuge (unten) | bestanden. Seitenzahl, Position, Hash, Signatur und Zeitstempel geprüft. |
| L | Gleichzeitigkeit, Wiederholung, Neuladen | Vitest | bestanden. Doppelte und parallele Abschlüsse erzeugen genau einen Abschluss; Idempotenz; Zwischenstand bleibt beim Neuladen; Abschluss an die angezeigte Dokumentfassung gebunden. |
| Integrität | Zeitstempel, Abschlussprüfung, Verankerung | Vitest (`tests/integrity.test.ts`) mit lokalem OpenSSL-Zeitstempeldienst | bestanden (Einzelheiten unten). |
| Härtung | Befunde der Sicherheitsprüfung, Diagnose, Metriken, Benutzerverwaltung, Migration, SMTP | Vitest (`tests/hardening.test.ts`) | bestanden (Einzelheiten unten). |
| Betrieb | Systemseite, Test-E-Mail, Benutzerverwaltung, Datenschutzhinweis, Signatur auf dem iPhone-Format, Prüfstelle | Playwright (`e2e/f-betrieb.spec.ts`) | bestanden (Einzelheiten unten). |
| U, C, M, H | Update 0.1.0 → 0.2.0 mit Rückweg, HTTPS über Caddy, STARTTLS mit Anmeldung, Container-Härtung | `scripts/docker-e2e.mjs` | bestanden, 29 von 29 Prüfungen (Einzelheiten unten). |

### Vitest

`npm test`: **81 bestanden, 18 übersprungen** (99 Tests in 9 Dateien). Übersprungen werden die Tests gegen einen echten MinIO-Server (9) und gegen ein echtes authentik (9), wenn diese Dienste nicht laufen (siehe [Selbst ausführen](#tests-mit-minio-und-authentik)).

| Datei | Fälle | Inhalt |
|---|---|---|
| `tests/pdf-geometry.test.ts` | 21 | Seitendrehung 0°, 90°, 180°, 270°, −90°, 450°; CropBox mit Versatz; nicht zurückgesetzte Transformationsmatrix; Querformat; Sonderformat. Position der Unterschrift unabhängig gemessen (Rasterung mit Poppler, Differenzbild). |
| `tests/flows.test.ts` | 11 | Tests A, B, D, E, F, H, L |
| `tests/api-webhooks.test.ts` | 4 | Test G, Linkübergabe ohne E-Mail über den ganzen Vorgang, Struktur des OpenAPI-Dokuments |
| `tests/integrity.test.ts` | 11 | Siegel mit geprüftem Zeitstempel (PAdES-B-T); wiederverwendete fremde Zeitstempelantwort abgelehnt (Siegel fällt sichtbar auf B-B zurück); nachträglich eingesetzter Zeitstempel über andere Daten in der Prüfstelle als ungültig erkannt; nach der Unterschrift geänderter Feldwert gelangt nicht ins finale PDF; ausgetauschtes Unterschriftsbild erkannt; Merkle-Prüfpfade für alle Baumgrößen; Anker verkettet und gestempelt, Entwürfe nicht verankert; Angreifer berechnet Kette neu → Verankerung meldet Abweichung; Angreifer fälscht Ankerkette mit neuen Zeitstempeln → Rückdatierungsverzug über 29 Tage; gelöschte oder neu berechnete Anker erkannt; Nachweispaket enthält Verankerung mit Prüfpfad |
| `tests/backup.test.ts` | 4 | Sicherung vollständig verschlüsselt (kein Klartext der Datenbank, keine PDF-Signatur, keine E-Mail-Adresse); Manipulation, Abschneiden und falsche Schlüssel erkannt; Katastrophenfall mit Passphrase; kein Überschreiben ohne `--force` |
| `tests/hardening.test.ts` | 16 | Zugangscode-Fehlversuche gezählt und gesperrt; Zugangscode unter 6 Zeichen abgelehnt; `TRUST_PROXY=true` = ein Hop; Test-Schlüssel ohne Zugriff auf Live-Webhooks; Formelfelder eingefroren; PNG-Bombe abgewiesen; „Neuer Link“ beendet Sitzungen; API-Schlüssel entfernter Personen unwirksam; Diagnose; Metriken nur mit Token; Sperren und letzte Instanz-Administration; Kopie vor Migration und keine Rückstufung; SMTP: nur verschlüsselt, Server ohne STARTTLS abgewiesen, dauerhaft abgelehnte Adresse ohne Wiederholung mit Audit-Eintrag und Benachrichtigung, Fehlermeldungen ohne Zugangsdaten (gegen einen lokalen SMTP-Stub) |
| `tests/oidc.test.ts` | 7 | OIDC-Fehlerpfade und Konfiguration |
| `tests/s3-minio.test.ts` | 7 + 9 | immer: Kodierung, Konfigurationsfehler, Wiederholung, Zeitlimit, 4xx ohne Wiederholung (lokaler HTTP-Stub). Nur mit MinIO: Grundoperationen, Auflisten, Startprüfung, falsche Zugangsdaten, fehlender Bucket, Bucketname mit Punkt, Präfix-Policy, STS-Sitzungstoken, vollständiger Ablauf mit S3 |
| `tests/oidc-authentik.test.ts` | 9 | nur mit authentik: Verknüpfung nur mit bestätigter E-Mail, Gruppen, gesperrte Konten, automatische Anlage mit Standardrolle, Ablehnung beim Anbieter, TOTP nach SSO, Fehlerantworten, abgelaufener Zustand |

Die MinIO- und authentik-Tests wurden bei der Entwicklung mit laufenden Diensten ausgeführt (Commits `7fd2e0f` und `15c009c`, authentik 2026.8.5). Im Lauf vom 22.10.2026 zu diesem Handbuch waren beide Dienste nicht gestartet.

Der Zeitstempeldienst in `tests/integrity.test.ts` ist ein lokaler OpenSSL-Dienst (`tests/helpers/tsa.ts`) mit eigener Test-CA. Ein echter externer Zeitstempeldienst wurde nicht verwendet.

### Playwright

Echter Browser, echter SMTP-Versand an Mailpit, Links aus den E-Mails geöffnet. 6 Testfälle in 7 Läufen:

| Projekt | Tests |
|---|---|
| Desktop Chrome (Chromium, 1440 × 900) | A, D, E, H, Betrieb (`e2e/f-betrieb.spec.ts`) |
| Pixel 7 (Chromium) | C |
| iPhone 14 (WebKit) | C |

Der Test „Betrieb“ prüft: Systemseite mit Tiefenprüfung; Test-E-Mail kommt an; Benutzerverwaltung ohne Sperrknopf für das eigene Konto; Datenschutzhinweis-Link speichern; Versand mit Formhinweis (Versand bleibt ohne Bestätigung gesperrt); Signatur im iPhone-Format mit sichtbarem Datenschutz-Link und Hinweis „keine qualifizierte elektronische Signatur“; Abschluss-E-Mail mit Prüfwert; Prüfstelle: Originaldatei „Echt und unverändert“ und Siegel gültig, Datei mit einem angehängten Byte „Nicht gefunden“ und „Datei wurde nach dem Siegel verändert“. Screenshots liegen unter `.tmp/shots`.

Die Oberfläche wurde ausschließlich so automatisiert geprüft. Ein manueller Durchgang in Google Chrome war nicht möglich. Ein Volltest mit Screenreadern fehlt.

### Docker-Gesamtprüfung

`scripts/docker-e2e.mjs` arbeitet wie ein Betreiber: Es kopiert den Arbeitsstand in zwei Server-Verzeichnisse und verwendet `install.sh`, `update.sh` und `restore.sh` mit Caddy (Profil `caddy`, interne CA für `localhost`) und Mailpit mit eigener CA, erzwungenem STARTTLS und SMTP-Anmeldung (`docker-compose.test.yml`). Ergebnis am 22.10.2026: **29 von 29 Prüfungen bestanden.**

| Gruppe | Prüfungen |
|---|---|
| U – Update | U1 Installation von 0.1.0 per `install.sh` bereit; U2 Ersteinrichtung über HTTPS; U3 Vorgang mit 0.1.0 abgeschlossen; U4 Update per `update.sh` auf 0.2.0, Schema migriert; U5 Altdaten unverändert (gleicher Hash); U6 Kopie vor Migration angelegt; U7 Sicherung vor dem Update vorhanden (Altformat `.zip`); U8 Rückweg: Altversion läuft; U9 Rückweg: Altdaten vollständig; U10 Rückweg: Daten nach dem Update erwartungsgemäß nicht enthalten; U11 erneutes Update erfolgreich |
| C – Caddy | C1 HSTS über HTTPS; C2 Audit-IP aus der Altversion protokolliert (ohne Bedingung, nur zur Dokumentation; im Lauf `192.168.65.1`); C3 neue Version: Audit-IP ist die echte Client-Adresse, nicht die per `X-Forwarded-For` gefälschte `6.6.6.6` |
| M – E-Mail | M1 Einladung über STARTTLS mit Anmeldung zugestellt; M2 Betreff und Empfänger korrekt; M3 Tiefenprüfung meldet „STARTTLS (erzwungen)“; M4 `paraph doctor` läuft im Container |
| I – Neustart | I1 Daten und Audit-Kette nach `down`/`up` intakt |
| J – Katastrophenfall | J1 Sicherung enthält den Hauptschlüssel; J2 Sicherung ohne SQLite-Klartext; J3 `restore.sh` auf neuer Installation übernimmt den Schlüssel per Passphrase; J4 finales PDF identisch, Nachweispaket lesbar; J5 `verify-audit` einschließlich Verankerung ohne Abweichung |
| H – Härtung | H1 Schlüsseldatei nicht für andere lesbar (0400); H2 `.env` mit 0600; H3 Container läuft als UID 1000; H4 Root-Dateisystem schreibgeschützt; H5 Gotenberg im internen Netz ohne Internetzugang |

Die Umwandlung DOCX → PDF über Gotenberg prüfte die Docker-Gesamtprüfung in 0.1.0; in 0.2.0 ist sie dort nicht mehr enthalten.

### Unabhängige Prüfung von Ergebnis und Nachweispaket

Geprüft am 22.10.2026 mit dem Prüfcontainer `docker/verify` an einem Vorgang, der mit dem lokalen OpenSSL-Zeitstempeldienst versiegelt wurde:

| Werkzeug | Ergebnis |
|---|---|
| `pdfsig` (Poppler) | „Signature is Valid“, SubFilter `ETSI.CAdES.detached`, „Total document signed“; „Certificate issuer is unknown“ (selbst signiert, erwartet) |
| pyHanko 0.29 mit Siegel- und TSA-Zertifikat als Vertrauensanker | „The signature is cryptographically sound“, „The timestamp token is cryptographically sound“, TSA-Zertifikat vertrauenswürdig |
| qpdf `--check` | „No syntax or stream encoding errors found“ |
| `openssl cms -verify` (Manifest des Nachweispakets gegen `siegelzertifikat.pem`) | „CMS Verification successful“ |
| `openssl ts -verify` (Zeitstempel eines Ankers, `anker-1.tsr`, gegen die Test-CA) | „Verification: OK“ |
| `python3 pruefen/verify-audit.py 03_audit-trail.json` | Kette lückenlos; Anker 1 per Merkle-Prüfpfad bestätigt, Zeitstempel als `anker-1.tsr` abgelegt |
| Vertrauenskette des Siegels | selbst signiert → „issuer unknown“, solange es nicht manuell als vertrauenswürdig markiert ist (erwartet) |

In 0.1.0 wurde das Siegel zusätzlich mit einem FreeTSA-Zeitstempel als PAdES-B-T geprüft. Für 0.2.0 liegt keine Prüfung gegen einen externen Zeitstempeldienst vor.

## Selbst ausführen

Voraussetzungen: Node.js 24, Docker, `openssl`.

### Unit- und Integrationstests

```sh
npm ci
npm test
```

### Tests mit MinIO und authentik

```sh
# MinIO (nur lokal gebunden), Benutzer mit Least-Privilege-Policy; Details im Kopf von tests/s3-minio.test.ts
S3_TEST_ENDPOINT=http://127.0.0.1:19000 S3_TEST_ACCESS_KEY=… S3_TEST_SECRET=… npx vitest run tests/s3-minio.test.ts

# authentik (lokal per Docker Compose), API-Token als akadmin; vorher npm run build:web
AUTHENTIK_URL=http://127.0.0.1:9000 AUTHENTIK_TOKEN=… npx vitest run tests/oidc-authentik.test.ts
```

Der authentik-Test legt Provider, Application, Gruppe, Scope-Mapping, Policy und Benutzer mit eindeutigem Präfix an und räumt sie danach ab.

### Browser-Tests

Mailpit muss SMTP auf `127.0.0.1:1025` und die Oberfläche auf `127.0.0.1:8025` anbieten:

```sh
docker run -d --name paraph-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.27
npm run build
npx playwright install chromium webkit
npx playwright test
```

Playwright startet den gebauten Server selbst (Port 8091, frisches Datenverzeichnis unter `.tmp/e2e-data`). Abweichende Adressen: `E2E_PORT`, `E2E_SMTP_URL`, `E2E_MAILPIT`.

### Docker-Gesamtprüfung

Das Skript braucht zwei vorher gebaute Images: `paraph:0.1.0-e2e` aus Commit `b309198` (Version 0.1.0) und `paraph:0.2.0-e2e` aus dem aktuellen Stand. Zum Beispiel:

```sh
mkdir -p .tmp/v010 && git archive b309198 | tar -x -C .tmp/v010
docker build -t paraph:0.1.0-e2e .tmp/v010
docker build -t paraph:0.2.0-e2e .
node scripts/docker-e2e.mjs
```

Hinweise:

- Benötigt freie Ports 18088, 18090, 18443 und 18025.
- Das Skript setzt den lokalen Tag `paraph:0.2.0` auf das Test-Image. **Nicht auf einem Produktivserver ausführen.**
- Arbeitsdaten und `result.json` liegen unter `.tmp/docker-e2e/run-<Zeitpunkt>`. Mit `KEEP=1` bleiben die Container nach dem Lauf bestehen.

### Unabhängige PDF- und Nachweisprüfung

Der Prüfcontainer `docker/verify` enthält pyHanko, Poppler (`pdfsig`, `pdftoppm`), qpdf und OpenSSL:

```sh
docker build -t paraph-verify docker/verify
docker run --rm -v "$PWD:/work" paraph-verify pdfsig ergebnis.pdf
docker run --rm -v "$PWD:/work" paraph-verify pyhanko sign validate --pretty-print ergebnis.pdf
docker run --rm -v "$PWD:/work" paraph-verify qpdf --check ergebnis.pdf
```

Um die Vertrauenskette zu prüfen, das Siegelzertifikat der Instanz (und bei Zeitstempeln das Wurzelzertifikat des Zeitstempeldienstes) als PEM-Datei ablegen und jeweils mit `--trust datei.pem` an pyHanko übergeben.

Nachweispaket (entpackt):

```sh
python3 pruefen/verify-audit.py 03_audit-trail.json
openssl cms -verify -binary -inform DER -in manifest.json.p7s -content manifest.json -CAfile siegelzertifikat.pem -out /dev/null
# Zeitstempel eines Ankers; den Befehl mit Hashwert gibt verify-audit.py aus
openssl ts -verify -digest <Ankerhash> -in anker-1.tsr -token_in -CAfile <Zertifikat des Zeitstempeldienstes>
```

Ohne Docker: Eine vorgelegte Datei lässt sich unter `/verify` in Paraph prüfen (Hash-Register und Siegelprüfung).
