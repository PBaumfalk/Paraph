# HANDOVER — docusign / Paraph (Stand: 22.10.2026)

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
