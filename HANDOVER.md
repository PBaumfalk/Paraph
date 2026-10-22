# HANDOVER — docusign / Paraph (Stand: 22.10.2026)

## 22.10.2026 (2): Härtung, Betrieb, unabhängige Abnahme → Version 0.2.0

**Erledigt:**
- Gesamtstatus und Antworten auf alle Fragen: `docs/STATUS-0.2.0.md`. Urteil: NOT READY FOR PRODUCTION – technisch abnahmefähig, Freigaben offen.
- Krypto/Nachweis: RFC-3161-Zeitstempel jetzt vollständig geprüft (Signatur, Imprint, Nonce, ESS, Vertrauenskette; `src/server/pdf/timestamp.ts`). Externe Verankerung der Audit-Ketten (Merkle RFC 6962, `domain/anchor.ts`). Abschluss prüft gegen die Audit-Kette (`finalize.ts`). Abschlussmail nennt SHA-256-Prüfwert. Prüfstelle mit Gesamturteil, Zertifikat per Signer-ID. Prüfskript im Nachweispaket prüft die Verankerung.
- Betrieb: Sicherung v2 (verschlüsselt, mit Hauptschlüssel per Passphrase, S3-Dokumente). Migrationskopie und Downgrade-Sperre. Jobs mit Zeitplan und Alarm. SMTP mit erzwungenem STARTTLS, Fehlerklassen und Zustellstatus. Diagnose (`paraph doctor`, Einstellungen → System). `/metrics`. Instanz-Benutzerverwaltung.
- Integriert: OIDC gegen authentik 2026.8.5 verifiziert (TOTP nach SSO, Gruppen, `email_verified`). S3 gegen MinIO verifiziert.
- Produktion: `docker-compose.yml` (Profil caddy, gepinnte Images, Secrets `master_key`, `backup_passphrase`, `tsa_ca`), `scripts/install.sh`, `update.sh` (inkl. `--rollback`), `restore.sh`.
- Prüfungen: Sicherheitsprüfung 1 (2 hoch, 7 mittel) und Abnahme 2 (3 hoch, 4 mittel) sind behoben und nachgeprüft. Juristische Analyse: `docs/recht/formhinweise-analyse.md`, `docs/recht/FREIGABELISTE.md` (NICHT anwaltlich freigegeben). Rechtstexte präzisiert, Datenschutzhinweis-Link eingebaut, `CONSENT_VERSION` 2026-10-2.
- Tests: Vitest 87/105 (18 übersprungen ohne MinIO/authentik), Playwright 7 (Desktop, Pixel, iPhone), Docker-Gesamttest 30/30 (`scripts/docker-e2e.mjs`: Update 0.1.0→0.2.0, Rückweg, Caddy-HTTPS, STARTTLS+Auth, Neustart, Katastrophenfall, Härtung). Fremdprüfung mit pdfsig, pyHanko, qpdf, `openssl ts`/`cms`.
- Handbuch `docs/handbuch/` auf 0.2.0.

**Offen:**
- Echte Gegenstellen nicht geprüft: Let's Encrypt mit echter Domain, echter Mailserver (SPF/DKIM/DMARC), echter Zeitstempeldienst, AWS/Hetzner-S3, SMS, Ihr authentik.
- QES nicht angebunden (Versand mit QES gesperrt).
- Rückdatierungsverzug nur in `verify-audit`, nicht in der Oberfläche. Screenreader-Volltest fehlt.
- Upgrade einer `init.sh`-Installation ist ungetestet; Neuinstallation per `install.sh` vorgesehen.
- Chrome-Erweiterung war nicht verbunden. Der Oberflächengang lief per Playwright mit Screenshots (`.tmp/shots`).

**Entscheidungen Patrick:**
- `docs/recht/FREIGABELISTE.md` abarbeiten (Gruppe A blockiert den Produktivstart). Darunter: Vollmacht-Regel zu streng, IP-Adressen in der Abschlussbestätigung, PDF-Anhang statt Link (Textform), AVV/§ 43e BRAO.
- Zeitstempeldienst wählen (Anbieter + Zertifikat für `secrets/tsa_ca.pem`).
- Server, Domain und SMTP-Absenderdomain festlegen. Ort für externe Sicherungskopien festlegen.

**Nächster Schritt:** Auf dem Server `scripts/install.sh` mit echter Domain, SMTP und Zeitstempeldienst ausführen und den Abnahmelauf aus `docs/STATUS-0.2.0.md` Abschnitt 6 durchführen (bis 05.11.2026).
**Uncommittet:** nichts (Git lokal, kein Remote)

## 22.10.2026: Paraph von Grund auf gebaut

**Erledigt:**
- Paraph, eine selbst gehostete Plattform für elektronische Signaturen. Stack: Node 24, Fastify, SQLite, React 19, pdf.js, pdf-lib, pkijs. Docker mit Gotenberg.
- Signatur-Engine:
  - Feldpositionen in normierten Koordinaten (`src/server/pdf/geometry.ts`), geprüft gegen Rotation und CropBox.
  - Einbrennen der Felder (`pdf/render.ts`).
  - PAdES-Plattformsiegel, optional mit RFC-3161-Zeitstempel (`pdf/seal.ts`).
  - Abschlussbestätigung (`pdf/certificate.ts`).
  - Audit-Trail als Hash-Kette mit Datenbank-Triggern (`domain/audit.ts`).
  - Nachweispaket mit CMS-signiertem Manifest und `pruefen/verify-audit.py`.
- Abläufe:
  - Mehrere Unterzeichner, parallel oder nacheinander; Rollen signer, approver, filler, viewer, witness.
  - Code per E-Mail oder SMS, Zugangscode, Vor-Ort-Signatur, Vertretung.
  - Erinnerungen, Ablauf, Widerruf, Ablehnung.
  - Vorlagen mit unveränderlichen Versionen, Massenversand CSV/XLSX, öffentliche Formulare.
  - Bedingte und berechnete Felder, regelbasierte Felderkennung.
- Formhinweis-Katalog: `src/shared/formrules.ts`, Quellen in `docs/recherche/formvorschriften-und-markt.md`. Vor dem Versand ist eine Bestätigung nötig, die protokolliert wird.
- Teams und Organisationen, Rollen, API-Schlüssel (live/test), Webhooks nach dem Schema „Standard Webhooks“, Idempotenz, OpenAPI unter `/docs/api`, Einbettung, OIDC, Zwei-Faktor (TOTP), Branding, eigene Domain.
- Oberfläche:
  - Editor „Studio“ (`src/web/components/Studio.tsx`).
  - Mobile-first-Signaturseite (`src/web/pages/sign/Sign.tsx`).
  - Prüfstelle `/verify`.
  - Deutsch und Englisch.
- Docker: gehärtet (UID 1000, schreibgeschützt, ohne Capabilities), Gotenberg isoliert. Backup und Restore per CLI `paraph`.
- Nachweise:
  - 36 Vitest-Tests und 6 Playwright-Tests (Desktop, Pixel 7, iPhone 14/WebKit).
  - `scripts/docker-e2e.mjs`: Test I (Neustart) und Test J (Restore in frische Umgebung).
  - Siegel geprüft mit pdfsig und pyHanko, Manifest mit `openssl cms`.
  - Unabhängige Sicherheitsprüfung: keine kritischen oder hohen Befunde, Hinweise behoben.
- Handbuch: `docs/handbuch/` (10 Kapitel) und `README.md`.

**Offen:**
- Nicht real getestet:
  - QES: Schnittstelle nur vorbereitet, kein Anbieter angebunden.
  - SMS-Gateway.
  - OIDC gegen authentik.
  - S3 (MinIO/AWS).
  - Echte Mailzustellung (SPF/DKIM).
- Weitere Einschränkungen siehe `docs/handbuch/10-einschraenkungen.md`.

**Entscheidungen Patrick:**
- Formhinweistexte in `src/shared/formrules.ts` anwaltlich freigeben, besonders bei unsicherer Rechtslage: § 80 ZPO/§ 174 BGB und § 74 HGB.
- QES-Anbieter wählen, falls gewünscht (Vertrag nötig).
- Eigenes Siegelzertifikat oder das selbst signierte Instanzzertifikat verwenden.

**Nächster Schritt:** Paraph auf dem Server mit echter Domain, SMTP und Reverse Proxy starten und einen echten Mandatsvertrag als Vorlage einrichten (bis 05.11.2026).

**Uncommittet:** nichts (Git-Repo lokal, kein Remote)
