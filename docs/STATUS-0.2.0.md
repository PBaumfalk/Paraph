# Paraph 0.2.0 – Abnahme- und Betriebsstatus

Stand: 22.10.2026 · Code-Stand: siehe `git log` (Basis 0.1.0 = `b309198`)

## Gesamturteil

**NOT READY FOR PRODUCTION – technisch abnahmefähig, Freigaben offen.**

Die technisch prüfbaren Voraussetzungen sind erfüllt (siehe Abschnitte 1 und 2). Drei Punkte blockieren den Produktivstart. Keiner davon lässt sich durch weiteren Code lösen:

1. **Anwaltliche Freigabe** der Formhinweise und Erklärungstexte ist offen (`docs/recht/FREIGABELISTE.md`, Gruppe A).
2. **Echte Gegenstellen sind nicht verifiziert**: Mailserver mit SPF/DKIM/DMARC, Domain mit Let's-Encrypt-Zertifikat, Zeitstempeldienst. Alles wurde nur gegen lokale Testdienste geprüft.
3. **Zeitstempeldienst nicht gewählt.** Ohne `TSA_URL` schützt die Verankerung der Audit-Ketten nicht gegen jemanden mit vollem Serverzugriff. Für vertrauliche Kanzleidokumente halte ich das für einen Pflichtbaustein.

Sind diese drei Punkte erledigt und der Abnahmelauf auf dem Server (Abschnitt 6) grün, kann der Status auf READY FOR PRODUCTION gesetzt werden.

## 1. Vollständig implementiert und nachweislich getestet

„Getestet“ heißt: automatisierter Test im Repository, zuletzt am 22.10.2026 grün ausgeführt.

| Bereich | Nachweis |
|---|---|
| Kernablauf Hochladen → Felder → Versand → Unterschrift → finales PDF | Vitest `flows.test.ts`; Playwright A, C (Pixel 7, iPhone 14/WebKit), D, E, H |
| PAdES-Siegel mit geprüftem RFC-3161-Zeitstempel (B-T) | `integrity.test.ts`; Fremdprüfung pdfsig „Signature is Valid“, pyHanko „VALID“ inkl. Zeitstempel, qpdf, `openssl ts -verify` |
| Abwehr gefälschter/wiederverwendeter Zeitstempel | `integrity.test.ts` (Replay, fremder Imprint) |
| Bindung an die Dokumentfassung; Abbruch des Abschlusses bei Änderung von Werten, Unterschriftsbildern oder Fassung nach der Unterschrift | `integrity.test.ts` (Angreifer mit DB-Zugriff) |
| Externe Verankerung der Audit-Ketten (Merkle RFC 6962, Ankerkette, Zeitstempel); Erkennung neu berechneter Ketten und Rückdatierung | `integrity.test.ts`; Python-Prüfskript im Nachweispaket; `openssl ts -verify` der Anker |
| Prüfstelle mit Gesamturteil (gültig / fremd / verändert / Zeitstempel ungültig) | Playwright F (Smartphone), `hardening.test.ts` |
| Sicherung v2 (verschlüsselt, Blöcke authentisiert, Schlüsselmaterial per Passphrase, S3-Dokumente) und Wiederherstellung inkl. neuer Server | `backup.test.ts`; Docker J1–J5 |
| Update 0.1.0 → 0.2.0 mit Migration, Kopie vor Migration, Rückweg, erneutes Update | Docker U1–U11 |
| Sperre bei falschen Codes (zählt wirklich, Audit-Eintrag) | `hardening.test.ts` |
| Proxy-IP nicht fälschbar (TRUST_PROXY = 1 Hop) | `hardening.test.ts`; Docker C2/C3 über Caddy |
| Test/Live-Trennung für Webhooks und Ereignisstrom, API-Schlüssel entfernter Personen | `hardening.test.ts` |
| SMTP: STARTTLS erzwungen, Anmeldung, Fehlerklassen, Zustellfehler → Audit + Benachrichtigung + Anzeige | `hardening.test.ts` (Stub), Docker M1–M3 (Mailpit mit STARTTLS-Pflicht und eigener CA) |
| Erinnerungen ohne Entwertung der ersten Einladung; „Neuer Link“ widerruft alles inkl. Sitzungen | `flows.test.ts`, `hardening.test.ts` |
| Hintergrundaufgaben: Zeitplan überlebt Neustart, Sperrdauer je Typ, Alarm-Mail | `hardening.test.ts`, Diagnose |
| Diagnose (Oberfläche, `paraph doctor`), Metriken, Instanz-Benutzerverwaltung | `hardening.test.ts`, Playwright F, Docker M4 |
| HTTPS über Caddy, Container-Härtung (UID 1000, read-only, Gotenberg ohne Internet), Schlüsseldateien nur für Eigentümer lesbar | Docker C1, H1–H5 |
| S3-Ablage | `s3-minio.test.ts` gegen MinIO (16 Tests, nur bei laufendem MinIO) |
| OIDC | `oidc.test.ts`; `oidc-authentik.test.ts` gegen authentik 2026.8.5 (9 Browser-Szenarien, nur bei laufendem authentik) |

Zahlen: Vitest 81 bestanden / 18 übersprungen (MinIO, authentik ohne laufenden Dienst) · Playwright 7 Szenarien · Docker-Gesamttest 29 Prüfungen.

## 2. Was unter realen Produktionsbedingungen funktioniert – und was nur simuliert ist

| Komponente | Geprüft gegen | Status |
|---|---|---|
| Docker-Betrieb, Update, Rückweg, Wiederherstellung | echte Container, echtes Compose, echte Images (Docker Desktop, macOS) | **verifiziert lokal**; auf Linux-Server noch auszuführen |
| HTTPS | Caddy mit interner CA für `localhost` | **simuliert** – Let's Encrypt mit echter Domain nicht geprüft |
| E-Mail | Mailpit mit STARTTLS-Pflicht, SMTP-Anmeldung, eigener CA; lokaler SMTP-Stub für 4xx/5xx | **simuliert** – echte Zustellung, SPF/DKIM/DMARC, Spam-Einstufung nicht geprüft |
| Zeitstempel | OpenSSL-Zeitstempeldienst (unabhängige Implementierung) | **simuliert** – kein echter TSA kontaktiert |
| S3 | MinIO RELEASE.2025-09-07 | **lokal verifiziert** – AWS/Hetzner/Wasabi nicht |
| OIDC | authentik 2026.8.5 in Docker | **lokal verifiziert** – Ihr authentik nicht |
| SMS | – | **ungetestet** |
| QES | – | **nicht angebunden**; Versand mit Stufe QES ist gesperrt; Paraph täuscht keine QES vor |

## 3. Funktionen, die externe Zugangsdaten brauchen

| Funktion | Variable(n) | Pflicht? |
|---|---|---|
| E-Mail-Versand | `SMTP_URL`, `MAIL_FROM` (+ SPF/DKIM/DMARC der Absenderdomain) | **ja** |
| HTTPS-Zertifikat | `DOMAIN`, `ACME_EMAIL` (Profil caddy) oder eigener Proxy | **ja** |
| Zeitstempeldienst | `TSA_URL`, optional `TSA_CA_FILE` | dringend empfohlen |
| Externe Sicherungskopie | außerhalb von Paraph (restic, rsync, NAS) | dringend empfohlen |
| SSO | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (+ authentik-Mapping für `email_verified`) | optional |
| S3-Ablage | `S3_*` | optional |
| SMS-Codes | `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN` | optional |
| QES | Vertrag mit Vertrauensdiensteanbieter + Implementierung | nicht vorhanden |
| Monitoring | `METRICS_TOKEN` | optional |

## 4. Offene rechtliche Prüfungen

Vollständig in `docs/recht/FREIGABELISTE.md` (Status: **nicht anwaltlich freigegeben**), Begründungen in `docs/recht/formhinweise-analyse.md`. Wesentlich:

- Erklärungstexte für Unterzeichner (bereits präzisiert, Freigabe offen)
- Datenschutzhinweise nach Art. 13 DSGVO: Paraph verlinkt sie nur – Inhalt fehlt
- IP-Adressen aller Beteiligten in Abschlussbestätigung und Nachweispaket, die auch die Gegenseite erhält
- Textform und dauerhafter Datenträger: Standard ist „nur Link“, nicht „PDF im Anhang“
- Vollmacht-Regel (§ 80 ZPO / § 174 BGB) steht auf „Papier“ und greift bei fast jeder Mandatsunterlage
- AVV und § 43e BRAO für Mail-, S3-, SMS- und Zeitstempelanbieter
- Aufbewahrungsfristen gegen Löschung (§ 50 BRAO, § 147 AO, § 257 HGB)
- Verbraucherkreditrecht ab 20.11.2026 (§ 492 BGB) – unverifiziert

## 5. Verbleibende Risiken

| Risiko | Einordnung |
|---|---|
| Wer Root auf dem Server hat, kann laufende Vorgänge und den Hauptschlüssel lesen | prinzipbedingt bei Selbsthosting; Festplattenverschlüsselung, Zugriffskontrolle, Protokollierung des Hosts |
| Ohne Zeitstempeldienst ist eine nachträgliche Fälschung der Audit-Historie durch Root nicht erkennbar | **blockierend**, bis `TSA_URL` gesetzt ist |
| Datenbank liegt im Klartext auf dem Volume (Dokumente sind verschlüsselt) | Festplatten- bzw. Volume-Verschlüsselung des Servers |
| Siegelschlüssel im Arbeitsspeicher und mit dem Hauptschlüssel verschlüsselt, kein HSM | für ein technisches Integritätssiegel vertretbar; kein qualifiziertes Siegel |
| SQLite, eine Instanz | für eine Kanzlei ausreichend; keine Hochverfügbarkeit |
| Selbst signiertes Instanzzertifikat | PDF-Programme zeigen „Aussteller unbekannt“; eigenes Zertifikat importierbar |
| Screenreader-Volltest der Signaturseite fehlt | vor Einsatz gegenüber Verbrauchern nachholen |

## 6. Installation und Aktualisierung auf Ihrem Server

Voraussetzung: Linux-Server mit Docker Engine und Compose v2, DNS-Eintrag für die Domain, Ports 80/443 frei (bei Caddy), SMTP-Zugang.

```bash
# Erstinstallation (fragt Domain, Let's-Encrypt-Adresse, SMTP, Zeitstempeldienst)
git clone <Ihr-Repository> /opt/paraph && cd /opt/paraph
sudo ./scripts/install.sh
#   → zeigt Einrichtungscode und die Wiederherstellungs-Passphrase: sofort in den Passwortmanager übernehmen
#   → https://<domain>/setup öffnen, erstes Konto anlegen

# Danach in Paraph: Einstellungen → System → „Tiefenprüfung“ und „Test-E-Mail senden“
#                   Einstellungen → Organisation → Link zu den Datenschutzhinweisen

# Aktualisieren (Sicherung vorab, Rückfall-Image, Migration, Prüfung)
sudo ./scripts/update.sh            # oder: --ref v0.3.0
sudo ./scripts/update.sh --rollback # zurück auf den Stand vor dem letzten Update

# Wiederherstellen (auch auf neuem Server: Passphrase nach secrets/backup_passphrase)
sudo ./scripts/restore.sh backups/paraph-backup-….pbk

# Betrieb
sudo docker compose exec paraph paraph doctor        # Diagnose
sudo docker compose exec paraph paraph verify-audit  # Audit-Ketten und Verankerung
```

Ausführlich: `docs/handbuch/02-installation.md` und `06-sicherung.md`.

**Abnahmelauf auf dem Server** (danach Status neu bewerten):
1. `paraph doctor` ohne FEHL, mit `TSA_URL`.
2. Test-E-Mail an ein externes Postfach (Gmail/Outlook) – Header auf `dkim=pass`, `spf=pass`, `dmarc=pass` prüfen.
3. Ein Testvorgang im Testmodus und ein echter Vorgang an Sie selbst; finales PDF in Adobe Reader öffnen.
4. `paraph backup` → Sicherung auf ein zweites System kopieren → `restore.sh` dort einmal durchspielen.

## 7. Unabhängige Prüfungen in dieser Runde

- **Sicherheitsprüfung 1** (vor den Änderungen): 2 hohe, 7 mittlere Befunde, alle behoben und mit Regressionstests belegt (`hardening.test.ts`, `integrity.test.ts`).
- **Juristische Vorprüfung:** Kein Text bezeichnet das Plattformsiegel als qualifiziert oder als persönliche Signatur; Präzisierungen übernommen, Freigabe offen.
- **Abnahmeprüfung 2** (nach den Änderungen): siehe unten.
