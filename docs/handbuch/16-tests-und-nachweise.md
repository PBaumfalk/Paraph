# 16. Tests und Nachweise

Dieses Kapitel beschreibt, was an Paraph automatisiert geprüft wird, mit welchen Werkzeugen, und wie Sie die Prüfungen selbst ausführen. Es richtet sich an IT und Betrieb sowie an alle, die vor dem Einsatz wissen wollen, worauf sich die Aussagen dieses Handbuchs stützen. Was ausdrücklich **nicht** geprüft ist, steht in [Kapitel 17](17-grenzen.md).

## Den Stand der Prüfungen kennen

| Prüfung | Werkzeug | Letzter belegter Lauf |
|---|---|---|
| Unit- und Integrationstests | Vitest, 12 Dateien unter `tests/` | 23.10.2026: 96 bestanden, 20 übersprungen |
| Browser-Tests | Playwright, Dateien unter `e2e/` | 23.10.2026: 7 Läufe bestanden |
| Docker-Gesamttest | `scripts/docker-e2e.mjs` | 22.10.2026: 30 von 30 Prüfungen bestanden |
| Unabhängige Prüfung von PDF und Nachweispaket | pdfsig, pyHanko, qpdf, OpenSSL, Prüfskript | 22.10.2026, mit lokalem OpenSSL-Zeitstempeldienst |
| Zeitstempel gegen FreeTSA | `tests/freetsa.test.ts` mit `PARAPH_LIVE_TSA=1` | 23.10.2026 |
| Fortlaufend | GitHub Actions (`.github/workflows/ci.yml`) | bei jedem Push und Pull Request auf `main` |

Die 20 übersprungenen Vitest-Fälle brauchen externe Dienste: MinIO (9), authentik (9) und den echten FreeTSA-Dienst (2). Ohne diese Dienste überspringen sie sich selbst ([Live-Tests](#live-tests-gegen-echte-dienste-ausführen)).

## Abläufe A bis L verstehen

Die Kernabläufe sind als Testfälle A bis L benannt. Jeder ist mindestens in Vitest abgedeckt, die wichtigsten zusätzlich im echten Browser.

| Test | Inhalt | Werkzeug |
|---|---|---|
| A | Hochladen → Felder setzen → Versand → E-Mail → Unterschrift → Download; Unterschrift positionsgenau im finalen PDF | Vitest `tests/flows.test.ts`; Playwright `e2e/a-full-flow.spec.ts` |
| B | zwei Unterzeichner nacheinander, mehrseitiges Dokument; Reihenfolge eingehalten, beide Unterschriften im Ergebnis | Vitest |
| C | Unterschreiben auf dem Smartphone mit Finger, Pflichtfeldern, Kontrollkästchen und Datum; kein horizontales Scrollen | Playwright `e2e/c-mobile.spec.ts` auf Pixel 7 (Chromium) und iPhone 14 (WebKit) |
| D | Ablehnung mit Begründung; danach kein Abschluss möglich | Vitest; Playwright `e2e/d-e-h.spec.ts` |
| D2 | Vertretung bei Linkübergabe: Signaturseite zeigt „Weitergegeben“ statt „Abgelehnt“, Menü der Signaturseite vollständig sichtbar, Kanzlei erhält Hinweis-E-Mail und stellt den Link auf der Vorgangsseite aus | Playwright `e2e/d-e-h.spec.ts` |
| E | Widerruf (auch bei geöffneter Sitzung), Ablauf, Erinnerung (vorheriger Link bleibt gültig, „Neuer Link“ widerruft beide) | Vitest; Playwright (Widerruf) |
| F | Mandantentrennung: fremde Organisation sieht und lädt nichts, auch nicht per API-Schlüssel; CSRF abgewiesen; nur eigene Felder setzbar | Vitest |
| G | API und Webhooks: Ankertext-Felder, Idempotency-Key, Webhook-Signatur, Wiederholung nach HTTP 500, SSRF-Sperre, Testmodus getrennt, widerrufener und abgelaufener Schlüssel; Linkübergabe mit `notify: false` über den ganzen Vorgang; OpenAPI-Dokument | Vitest `tests/api-webhooks.test.ts` |
| H | Vorlagen mit unveränderlichen Versionen (auch per Datenbank-Trigger); alte Vorgänge bleiben unverändert; Vorlage in der Oberfläche anlegen, veröffentlichen, verwenden | Vitest; Playwright |
| I | Neustart ohne Datenverlust | Docker-Gesamttest |
| J | Katastrophenfall: neue Umgebung ohne Hauptschlüssel, nur mit Passphrase | Docker-Gesamttest; Vitest `tests/backup.test.ts` |
| K | Prüfung des Ergebnis-PDFs: Seitenzahl, Position, Hash, Signatur, Zeitstempel | in A, B und den Integritätstests; unabhängige Werkzeuge |
| L | Gleichzeitigkeit, Wiederholung, Neuladen: genau ein Abschluss bei doppelten und parallelen Anfragen; Zwischenstand bleibt; Abschluss an die angezeigte Dokumentfassung gebunden | Vitest |

## Was Vitest prüft

`npm test` führt alle Dateien `tests/*.test.ts` aus (`vitest.config.ts`). Die Tests starten die echte Anwendung im selben Prozess mit echter SQLite-Datenbank und Dateiablage in einem temporären Verzeichnis (`tests/helpers/server.ts`). Das SMTP-Verhalten prüfen sie gegen einen lokalen SMTP-Stub, Zeitstempel gegen einen lokalen OpenSSL-Zeitstempeldienst mit eigener Test-CA (`tests/helpers/tsa.ts`).

| Datei | Inhalt |
|---|---|
| `tests/flows.test.ts` | Abläufe A, B, D, E, F, H und L |
| `tests/api-webhooks.test.ts` | Ablauf G, Testmodus, OpenAPI, Linkübergabe ohne E-Mail |
| `tests/timestamp-nonce.test.ts` | Nonce der Zeitstempelanfrage ist immer eine minimal kodierte, positive Ganzzahl |
| `tests/verify-contents.test.ts` | Siegelprüfung liest den Signaturwert über die DER-Länge, auch wenn er auf ein Null-Byte endet |
| `tests/handover.test.ts` | Einladungswege: öffentliches Formular mit fester Kanzlei-Rolle (nacheinander und gleichzeitig, keine Erinnerung an Besucher), Linkübergabe bei „Nacheinander“ und bei Vertretung meldet sich beim Absender, Webhook-Feld `channel` |
| `tests/integrity.test.ts` | Siegel mit geprüftem Zeitstempel (PAdES-B-T); wiederverwendete fremde Zeitstempelantwort abgelehnt, Siegel fällt sichtbar auf B-B zurück; nachträglich eingesetzter Zeitstempel über andere Daten erkannt; nach der Unterschrift geänderter Wert gelangt nicht ins finale PDF; ausgetauschtes Unterschriftsbild erkannt; Merkle-Prüfpfade für alle Baumgrößen; Anker verkettet und gestempelt, Entwürfe nicht verankert; neu berechnete Kette löst Alarm aus; gefälschte Ankerkette mit neuen Zeitstempeln zeigt Rückdatierung; gelöschte oder neu berechnete Anker erkannt; Nachweispaket mit Verankerung; fremde Signatur mit vorangestelltem Instanzzertifikat nicht anerkannt; Zeitstempel eines selbst erzeugten Dienstes abgelehnt |
| `tests/hardening.test.ts` | Befunde der Sicherheitsprüfungen (Code-Sperre, Mindestlänge, `TRUST_PROXY`, Test/Live-Trennung, eingefrorene Formeln, PNG-Bombe, „Neuer Link“ beendet Sitzungen, API-Schlüssel entfernter Personen); Diagnose; Metriken nur mit Token; Sperren und letzte Instanz-Administration; Kopie vor Migration, keine Rückstufung; SMTP: nur verschlüsselt, Server ohne STARTTLS abgewiesen, dauerhaft abgelehnte Adresse ohne Wiederholung, Fehlermeldungen ohne Zugangsdaten; sichere Weiterleitung nach der Anmeldung |
| `tests/backup.test.ts` | Sicherung vollständig verschlüsselt; Manipulation, Abschneiden und falsche Schlüssel erkannt; Katastrophenfall mit Passphrase; kein Überschreiben ohne `--force`; Altformat nur mit ausdrücklichem Schalter; unvollständige Sicherung verdrängt keine vollständige |
| `tests/pdf-geometry.test.ts` | Feldpositionen bei Seitendrehung, CropBox mit Versatz, nicht zurückgesetzter Transformationsmatrix, Querformat und Sonderformat; Lage der Unterschrift unabhängig gemessen (Rasterung mit Poppler, Differenzbild) |
| `tests/pdf-fonts.test.ts` | Abschlussbestätigung bettet echte Schriften ein, Umlaute und ß ohne Ersatzzeichen; alle Schriftpakete sind Laufzeitabhängigkeiten |
| `tests/branding.test.ts` | Akzentfarbe: ohne Wert Petrol, alter Standard Indigo wird ersetzt, eigene Farbe bleibt |
| `tests/oidc.test.ts` | OIDC-Fehlerpfade und Konfiguration |
| `tests/freetsa.test.ts` | Fingerabdruck des mitgelieferten FreeTSA-Wurzelzertifikats; mit `PARAPH_LIVE_TSA=1` echter Zeitstempel und Plattformsiegel gegen freetsa.org |
| `tests/s3-minio.test.ts` | immer: Kodierung, Konfigurationsfehler, Wiederholung, Zeitlimit (lokaler Stub); mit MinIO: Grundoperationen, Auflisten, Startprüfung, falsche Zugangsdaten, fehlender Bucket, Bucketname mit Punkt, Präfix-Policy, temporäre Zugangsdaten, vollständiger Ablauf mit S3 |
| `tests/oidc-authentik.test.ts` | nur mit authentik: Verknüpfung nur mit bestätigter E-Mail, Gruppen, gesperrte Konten, automatische Anlage mit Standardrolle, Ablehnung beim Anbieter, TOTP nach SSO, Fehlerantworten, abgelaufener Zustand |

## Was Playwright im Browser prüft

Playwright (`playwright.config.ts`) startet den gebauten Server mit frischem Datenverzeichnis (`.tmp/e2e-data`, Port 8091), versendet echte E-Mails per SMTP an Mailpit und öffnet die Links aus diesen E-Mails.

| Projekt | Gerät | Tests |
|---|---|---|
| `desktop` | Desktop Chrome (Chromium, 1440 × 900) | A, D, E, H, F |
| `pixel` | Pixel 7 (Chromium) | C |
| `iphone` | iPhone 14 (WebKit) | C |

Test F („Systemseite, Benutzerverwaltung, Datenschutzhinweis, Prüfstelle“, `e2e/f-betrieb.spec.ts`) prüft: Betriebszustand mit Tiefenprüfung; Test-E-Mail kommt an; kein Sperrknopf für das eigene Konto; Datenschutzhinweis-Link speichern; Versand mit Formhinweis bleibt ohne Bestätigung gesperrt; Signatur im iPhone-Format mit sichtbarem Datenschutz-Link und dem Hinweis, dass es sich nicht um eine qualifizierte elektronische Signatur handelt; Abschluss-E-Mail mit Prüfwert; Prüfstelle: Originaldatei „Echt und unverändert“ mit gültigem Siegel, Datei mit einem angehängten Byte „Nicht gefunden“ und „Datei wurde nach dem Siegel verändert“.

`e2e/screenshots.spec.ts` ist kein Test im eigentlichen Sinn. Er erzeugt mit erfundenen Demodaten die Bildschirmfotos für README und Handbuch und läuft nur mit `PARAPH_SCREENSHOTS=1`; sonst wird er übersprungen.

## Was der Docker-Gesamttest prüft

`scripts/docker-e2e.mjs` arbeitet wie ein Betreiber. Es kopiert den Arbeitsstand in zwei Server-Verzeichnisse und verwendet `install.sh`, `update.sh` und `restore.sh` – mit Caddy (Profil `caddy`, interne CA für `localhost`) und Mailpit mit eigener CA, erzwungenem STARTTLS und SMTP-Anmeldung (`docker-compose.test.yml`).

| Gruppe | Prüfungen |
|---|---|
| U – Update | U1 Installation von 0.1.0 per `install.sh`; U2 Ersteinrichtung über HTTPS; U3 Vorgang mit 0.1.0 abgeschlossen; U4 Update per `update.sh`, Schema migriert; U5 Altdaten unverändert (gleicher Hash); U6 Kopie vor Migration; U7 Sicherung vor dem Update vorhanden; U8 Rückweg: Altversion läuft; U9 Rückweg: Altdaten vollständig; U10 Rückweg: Daten nach dem Update erwartungsgemäß nicht enthalten; U11 erneutes Update |
| C – Caddy | C1 HSTS über HTTPS; C2 Caddy überschreibt eine gefälschte `X-Forwarded-For` (`6.6.6.6`), auch mit der Altversion steht sie nicht im Audit-Trail; C3 neue Version: Audit-IP ist die echte Client-Adresse |
| M – E-Mail | M1 Einladung über STARTTLS mit Anmeldung zugestellt; M2 Betreff und Empfänger korrekt; M3 Tiefenprüfung meldet „STARTTLS (erzwungen)“; M4 `paraph doctor` läuft im Container |
| D – Dokumente | D1 DOCX wird über Gotenberg in PDF umgewandelt |
| I – Neustart | I1 Daten und Audit-Kette nach `down`/`up` intakt |
| J – Katastrophenfall | J1 Sicherung enthält den Hauptschlüssel; J2 Sicherung ohne SQLite-Klartext; J3 `restore.sh` auf neuer Installation übernimmt den Schlüssel per Passphrase; J4 finales PDF identisch, Nachweispaket lesbar; J5 `paraph verify-audit` in der neuen Umgebung: Exit-Code 0, mindestens ein Vorgang geprüft, keine beschädigte Kette, keine Abweichung der Verankerung |
| H – Härtung | H1 Schlüsseldatei nicht für andere lesbar; H2 `.env` mit 0600; H3 Container läuft als UID 1000; H4 Root-Dateisystem schreibgeschützt; H5 Gotenberg im internen Netz ohne Internetzugang |

Der Test läuft lokal unter Docker Desktop (macOS). Auf einem Linux-Server ist er noch nicht ausgeführt.

## Was die CI auf GitHub prüft

Der Workflow „Tests, Image & Release“ (`.github/workflows/ci.yml`) läuft bei jedem Push auf `main`, bei Pull Requests auf `main` und bei Tags `v*`:

| Job | Schritte |
|---|---|
| `tests` | Node 24, Poppler; `npm ci`; Typprüfung (`npm run typecheck`); Syntaxprüfung aller `scripts/*.sh`; Vitest. MinIO-, authentik- und FreeTSA-Live-Tests überspringen sich ohne ihre Dienste. |
| `e2e` | Mailpit als Dienst; Chromium und WebKit; `npm run build`; Playwright. Bei Fehlschlag wird der Bericht 14 Tage aufbewahrt. |
| `image` | Image bauen und **Rauchtest** so gehärtet wie in `docker-compose.yml` (schreibgeschützt, ohne Capabilities): bereit innerhalb von 60 Sekunden, Version im Image gleich `package.json`, Oberfläche und OpenAPI werden ausgeliefert, UID 1000, `paraph health`, kein npm im Image. Nur bei Freigaben (Git-Tag `v*`): Veröffentlichung unter `ghcr.io/pbaumfalk/paraph` für amd64 und arm64 (Tags: Version, `latest`). |
| `release` | nur bei Tags: Tag passt zu `package.json`, Abschnitt aus `CHANGELOG.md` als Freigabetext, GitHub-Release (bei `v0.*` als Vorabversion) |

Dependabot (`.github/dependabot.yml`) schlägt Updates für npm (wöchentlich), GitHub-Actions, Docker-Basis-Images und die gepinnten Images in `docker-compose.yml` (monatlich) vor.

Der Docker-Gesamttest läuft **nicht** in der CI, weil er zwei vorgebaute Images und freie Ports braucht.

## Ergebnis und Nachweispaket unabhängig prüfen

Am 22.10.2026 wurde ein Vorgang, versiegelt mit dem lokalen OpenSSL-Zeitstempeldienst, mit Werkzeugen geprüft, die nichts mit Paraph zu tun haben:

| Werkzeug | Ergebnis |
|---|---|
| `pdfsig` (Poppler) | „Signature is Valid“, SubFilter `ETSI.CAdES.detached`, „Total document signed“; „Certificate issuer is unknown“ (selbst signiert, erwartet) |
| pyHanko 0.29 mit Siegel- und TSA-Zertifikat als Vertrauensanker | Signatur und Zeitstempel „cryptographically sound“, TSA-Zertifikat vertrauenswürdig |
| `qpdf --check` | „No syntax or stream encoding errors found“ |
| `openssl cms -verify` (Manifest gegen `siegelzertifikat.pem`) | „CMS Verification successful“ |
| `openssl ts -verify` (Anker-Zeitstempel gegen die Test-CA) | „Verification: OK“ |
| `python3 pruefen/verify-audit.py 03_audit-trail.json` | Kette lückenlos; Anker per Merkle-Prüfpfad bestätigt |

Am 23.10.2026 lief `tests/freetsa.test.ts` gegen den echten Dienst: Zeitstempel mit Nonce und Kette zum mitgelieferten Wurzelzertifikat sowie Plattformsiegel PAdES-B-T, das Paraphs eigene Prüfung bestätigt. Eine Prüfung eines FreeTSA-versiegelten PDFs mit pdfsig oder pyHanko ist für diese Fassung nicht belegt.

Wie Sie ein Ergebnis selbst mit diesen Werkzeugen prüfen, beschreibt [Kapitel 6](06-dokumente-pruefen.md).

## Die Tests selbst ausführen

> **Wichtig:** Führen Sie Tests nicht auf dem Produktivserver aus. Vor allem der Docker-Gesamttest setzt lokale Image-Tags um und belegt Ports.

### Voraussetzungen

Node.js 24, `openssl` und Poppler (`pdftoppm`) für Vitest; zusätzlich Docker für Mailpit, den Gesamttest und die Prüfwerkzeuge.

### Unit- und Integrationstests

```sh
npm ci
npm test
```

### Browser-Tests

Mailpit muss SMTP auf `127.0.0.1:1025` und die Oberfläche auf `127.0.0.1:8025` anbieten:

```sh
docker run -d --name paraph-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.27
npm run build
npx playwright install chromium webkit
npx playwright test
```

Abweichende Adressen: `E2E_PORT`, `E2E_SMTP_URL`, `E2E_MAILPIT`.

### Live-Tests gegen echte Dienste ausführen

```sh
# Zeitstempel und Siegel gegen freetsa.org (Internetzugang nötig)
PARAPH_LIVE_TSA=1 npx vitest run tests/freetsa.test.ts

# MinIO (nur lokal gebunden), Benutzer mit Least-Privilege-Policy; Details im Kopf von tests/s3-minio.test.ts
S3_TEST_ENDPOINT=http://127.0.0.1:19000 S3_TEST_ACCESS_KEY=… S3_TEST_SECRET=… npx vitest run tests/s3-minio.test.ts

# authentik (lokal per Docker Compose), API-Token als akadmin; vorher npm run build:web
AUTHENTIK_URL=http://127.0.0.1:9000 AUTHENTIK_TOKEN=… npx vitest run tests/oidc-authentik.test.ts
```

Der authentik-Test legt Provider, Application, Gruppe, Scope-Mapping, Policy und Benutzer mit eindeutigem Präfix an und räumt sie danach ab. Die MinIO- und authentik-Tests wurden bei der Entwicklung mit laufenden Diensten ausgeführt (authentik 2026.8.5, MinIO RELEASE.2025-09-07), in den letzten belegten Gesamtläufen aber übersprungen.

### Docker-Gesamttest

Das Skript braucht zwei vorher gebaute Images: `paraph:0.1.0-e2e` aus Commit `b309198` (Version 0.1.0) und `paraph:<Version>-e2e` aus dem aktuellen Stand (Version aus `package.json`, derzeit `0.3.0`).

```sh
mkdir -p .tmp/v010 && git archive b309198 | tar -x -C .tmp/v010
docker build -t paraph:0.1.0-e2e .tmp/v010
docker build -t paraph:0.3.0-e2e .
node scripts/docker-e2e.mjs
```

- Benötigt freie Ports 18088, 18090, 18443 und 18025.
- Setzt den lokalen Tag `paraph:<Version>` auf das Test-Image.
- Arbeitsdaten und `result.json` liegen unter `.tmp/docker-e2e/run-<Zeitpunkt>`. Mit `KEEP=1` bleiben die Container nach dem Lauf bestehen.

### Prüfwerkzeuge

Der Prüfcontainer `docker/verify` enthält pyHanko, Poppler (`pdfsig`, `pdftoppm`), qpdf und OpenSSL:

```sh
docker build -t paraph-verify docker/verify
docker run --rm -v "$PWD:/work" paraph-verify pdfsig ergebnis.pdf
docker run --rm -v "$PWD:/work" paraph-verify pyhanko sign validate --pretty-print ergebnis.pdf
docker run --rm -v "$PWD:/work" paraph-verify qpdf --check ergebnis.pdf
```

Für die Vertrauenskette das Siegelzertifikat der Instanz (und bei Zeitstempeln das Wurzelzertifikat des Zeitstempeldienstes) als PEM-Datei ablegen und jeweils mit `--trust datei.pem` an pyHanko übergeben.

## Abnahme auf dem eigenen Server

Die Tests oben laufen gegen lokale Testdienste. Vor dem Produktivstart gehört ein Abnahmelauf auf dem eigenen Server dazu (aus `docs/STATUS-0.2.0.md`):

1. `paraph doctor` ohne Fehler, mit Zeitstempeldienst und „Kette vertrauenswürdig“.
2. Test-E-Mail an ein externes Postfach; im Kopf der empfangenen Mail `spf=pass`, `dkim=pass`, `dmarc=pass` prüfen.
3. Ein Vorgang im Testmodus und ein echter Vorgang an sich selbst; das finale PDF in Adobe Reader öffnen.
4. `paraph backup`, Sicherung auf ein zweites System kopieren und dort `restore.sh` einmal durchspielen.

---

← [15. Diagnose und Fehlersuche](15-diagnose-und-fehlersuche.md) · [Inhalt](README.md) · [17. Grenzen](17-grenzen.md) →
