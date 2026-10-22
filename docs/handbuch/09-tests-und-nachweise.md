# 9. Tests und Nachweise

Stand: 22.10.2026. Alle hier genannten Prüfungen wurden an diesem Tag tatsächlich ausgeführt.

## Übersicht

| Test | Inhalt | Werkzeug | Ergebnis |
|---|---|---|---|
| A | Hochladen → Felder setzen → Versand → E-Mail → Unterschrift → Download | Vitest (`tests/flows.test.ts`); Playwright Desktop Chrome mit echtem SMTP über Mailpit (`e2e/a-full-flow.spec.ts`) | bestanden. Felder per Klick gesetzt, Unterschrift mit der Maus gezeichnet. Im heruntergeladenen PDF 0 neue Pixel außerhalb der Felder. |
| B | Zwei Unterzeichner nacheinander, mehrseitiges Dokument | Vitest | bestanden. Reihenfolge eingehalten, finales Dokument enthält beide Unterschriften. |
| C | Unterschreiben auf dem Smartphone | Playwright: Pixel 7 (Chromium), iPhone 14 (WebKit) (`e2e/c-mobile.spec.ts`) | bestanden. Touch-Unterschrift, Auswahlfeld, Kontrollkästchen, Datum; kein horizontales Scrollen. |
| D | Ablehnung mit Begründung | Vitest; Playwright | bestanden. Status „abgelehnt“, danach kein Abschluss möglich. |
| E | Widerruf, Ablauf, Erinnerung | Vitest; Playwright (Widerruf) | bestanden. Widerrufene Links und offene Sitzungen wirkungslos; abgelaufene Anfrage nicht mehr unterschreibbar; Erinnerung erzeugt neuen Link, alter Link ungültig. |
| F | Mandantentrennung | Vitest | bestanden. Fremde Organisation sieht und lädt nichts, auch nicht per API-Schlüssel; CSRF ohne Token und fremder Origin abgewiesen; Empfänger können keine fremden Felder setzen und keine fremden Unterschriften verwenden. |
| G | API und Webhooks | Vitest (`tests/api-webhooks.test.ts`) | bestanden. Abgelaufener API-Schlüssel abgewiesen; Felder per Ankertext; Idempotency-Key: Wiederholung liefert gespeicherte Antwort, abweichende Anfrage 422; Webhook-Signatur (HMAC) geprüft; erster Zustellversuch mit HTTP 500 beantwortet, Wiederholung erfolgreich; SSRF-Sperre greift; Testmodus getrennt; widerrufener Schlüssel abgewiesen. |
| H | Vorlagen mit Versionen | Vitest; Playwright | bestanden. Versionen unveränderlich (auch der Datenbank-Trigger), alte Vorgänge bleiben unverändert; Vorlage in der Oberfläche anlegen, veröffentlichen, verwenden. |
| I | Neustart ohne Datenverlust | `scripts/docker-e2e.mjs` | bestanden. `docker compose down` / `up`: Hash des finalen PDFs bitgleich, Audit-Kette intakt. |
| J | Sicherung und Wiederherstellung in frische Umgebung | `scripts/docker-e2e.mjs` | bestanden. Sicherung im Container, `verify-backup` in Ordnung, Wiederherstellung in neue Umgebung mit leerem Volume; Anmeldung, Hash, Nachweispaket und Audit-Kette identisch. |
| K | Prüfung des Ergebnis-PDFs | in A, B und den Abläufen enthalten; eigene Prüfroutine `src/server/pdf/verify.ts`; manuell `pdfsig` und pyHanko | bestanden. Seitenzahl, Position, Hash und Signatur geprüft (Ergebnisse unten). |
| L | Gleichzeitigkeit, Wiederholung, Neuladen | Vitest | bestanden. Doppelte und parallele Abschlüsse erzeugen genau einen Abschluss; Idempotenz; Zwischenstand bleibt beim Neuladen; Abschluss an die angezeigte Dokumentfassung gebunden. |

### Vitest

36 Tests, alle grün:

- `tests/pdf-geometry.test.ts`, 21 Fälle: Seitendrehung 0°, 90°, 180°, 270°, −90°, 450°; CropBox mit Versatz; nicht zurückgesetzte Transformationsmatrix im Seiteninhalt; Querformat; Sonderformat. Die Position der eingesetzten Unterschrift wurde unabhängig gemessen: Rasterung mit Poppler und Auswertung im Differenzbild.
- `tests/flows.test.ts`, 11 Fälle: Tests A, B, D, E, F, L, H.
- `tests/api-webhooks.test.ts`, 4 Fälle: Test G, Linkübergabe ohne E-Mail über den ganzen Vorgang und Struktur des OpenAPI-Dokuments.
- Nachweispaket: `openssl cms -verify` des Manifests erfolgreich, Datei-Hashes stimmen mit dem Manifest überein, `scripts/verify-audit.py` bestätigt die Ereigniskette und erkennt einen manipulierten Eintrag.

### Playwright

Echter Browser, echter SMTP-Versand an Mailpit, Links aus den E-Mails geöffnet. Tests A, C, D, E, H über die Oberfläche. Projekte: Desktop Chrome (1440 × 900), Pixel 7, iPhone 14.

### Docker

`scripts/docker-e2e.mjs` startet Paraph, Gotenberg und Mailpit über Docker Compose und prüft:

- Umwandlung DOCX → PDF über Gotenberg,
- Test I und Test J (siehe Tabelle),
- Container läuft als UID 1000 mit schreibgeschütztem Root-Dateisystem.

### PAdES-Prüfung des Plattformsiegels

| Werkzeug | Ergebnis |
|---|---|
| `pdfsig` (Poppler) | „Signature is Valid“, SubFilter `ETSI.CAdES.detached`, „Total document signed“ |
| pyHanko 0.29 | „cryptographically sound“ |
| pyHanko mit FreeTSA-Zeitstempel | PAdES-B-T gültig |
| Vertrauenskette | Zertifikat selbst signiert → „issuer unknown“, solange es nicht manuell als vertrauenswürdig markiert ist (erwartet) |

## Selbst ausführen

Voraussetzungen: Node.js 24, Docker.

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

Playwright startet den gebauten Server selbst (Port 8091, frisches Datenverzeichnis unter `.tmp/e2e-data`). Abweichende Adressen: `E2E_PORT`, `E2E_SMTP_URL`, `E2E_MAILPIT`.

### Docker-Gesamtprüfung (Tests I und J)

```sh
node scripts/docker-e2e.mjs
```

Benötigt Docker und freie Ports 18080 und 18081. Das Skript baut das Image nur, wenn `paraph:latest` noch fehlt; nach Codeänderungen vorher `docker compose build` ausführen. Arbeitsdaten liegen unter `.tmp/docker-e2e`. Fehlt `secrets/master.key`, legt das Skript einen an.

### Unabhängige PDF-Prüfung

Der Prüfcontainer `docker/verify` enthält pyHanko, Poppler (`pdfsig`, `pdftoppm`), qpdf und OpenSSL:

```sh
docker build -t paraph-verify docker/verify
docker run --rm -v "$PWD:/work" paraph-verify pdfsig ergebnis.pdf
docker run --rm -v "$PWD:/work" paraph-verify pyhanko sign validate --pretty-print ergebnis.pdf
```

Um die Vertrauenskette zu prüfen, das Siegelzertifikat der Instanz als PEM-Datei ablegen und mit `--trust zertifikat.pem` an pyHanko übergeben.

Ohne Docker: Eine vorgelegte Datei lässt sich unter `/verify` in Paraph prüfen (Hash-Register und Signaturprüfung).
