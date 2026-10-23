# Änderungsprotokoll

Alle nennenswerten Änderungen an Paraph werden hier festgehalten.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).
Solange die Version mit 0 beginnt, können sich Schnittstellen und
Konfiguration zwischen Versionen ändern; `update.sh` migriert die Daten.

## [Unveröffentlicht]

### Neu

- **FreeTSA als voreingestellter Zeitstempeldienst.** `install.sh` fragt
  mit der Vorgabe „freetsa“ und trägt `TSA_URL=https://freetsa.org/tsr`
  sowie das mitgelieferte Wurzelzertifikat (`docker/tsa/freetsa-root-ca.pem`)
  als Vertrauensanker ein. Den SHA-256-Fingerabdruck prüft das Skript gegen
  einen fest hinterlegten Wert und bricht bei Abweichung ab. „keiner“
  schaltet den Zeitstempeldienst ab. FreeTSA ist kostenlos, aber **nicht
  qualifiziert**; der Wechsel zu einem qualifizierten Anbieter bleibt
  jederzeit möglich.
- `tests/freetsa.test.ts`: Mit `PARAPH_LIVE_TSA=1` laufen Zeitstempel und
  Plattformsiegel (PAdES-B-T) gegen den echten Dienst.
- Screenshots für README und Handbuch (`e2e/screenshots.spec.ts`, erzeugt
  mit erfundenen Demodaten).
- GitHub-Workflow: Typprüfung, Tests, Docker-Image mit Rauchtest,
  Veröffentlichung unter `ghcr.io/pbaumfalk/paraph`, Release bei Tags.

## [0.2.0] – 2026-10-22

Härtung, Betrieb und unabhängige Abnahme. Stand und offene Punkte:
[`docs/STATUS-0.2.0.md`](docs/STATUS-0.2.0.md).

### Neu

- **Geprüfte Zeitstempel:** RFC-3161-Antworten zählen nur mit gültiger
  Signatur, passendem Imprint und passender Nonce, ESS-Bindung und, mit
  `TSA_CA_FILE`, geprüfter Zertifikatskette.
- **Externe Verankerung der Audit-Ketten** (Merkle-Baum nach RFC 6962,
  verkettete Anker mit Zeitstempel). `paraph verify-audit` und das
  Prüfskript im Nachweispaket erkennen neu berechnete Ketten und
  Rückdatierung.
- Der Abschluss prüft gegen die Audit-Kette. Die Abschlussmail nennt den
  SHA-256-Prüfwert. Die Prüfstelle fasst Treffer je Vorgang zusammen.
- **Sicherung v2:** verschlüsselt, enthält den Hauptschlüssel (geschützt
  durch die Wiederherstellungs-Passphrase), optional S3. Kopie vor jeder
  Migration, keine Rückstufung auf das Altformat.
- **Produktionsbetrieb:** `install.sh`, `update.sh` (mit `--rollback`),
  `restore.sh`; Compose mit Caddy-Profil und gepinnten Images;
  Docker-Gesamttest.
- Administration: Systemdiagnose (`paraph doctor`, Einstellungen → System),
  Test-E-Mail, Benutzerverwaltung der Instanz, `/metrics`.
- OIDC produktionsreif (gegen authentik verifiziert): Verknüpfung nur mit
  bestätigter E-Mail, Gruppen, Standardrolle, TOTP nach SSO.
- S3-Ablage produktionsreif (gegen MinIO verifiziert).
- Link zu den Datenschutzhinweisen auf der Signaturseite; präzisierte
  Rechtstexte.

### Sicherheit

- Befunde aus Sicherheitsprüfung 1 (2 hoch, 7 mittel) und Abnahmeprüfung 2
  (3 hoch, 4 mittel) behoben und mit Regressionstests belegt, darunter:
  Prüfstelle wählt das Signer-Zertifikat per Signer-ID; SMTP-TLS-Erzwingung
  wirksam; Open Redirect nach SSO (auch `/..//`); Zeitstempeldienst nur mit
  Vertrauensanker.

## [0.1.0] – 2026-10-22

Erste Fassung.

### Neu

- Signatur-Engine: normierte Feldkoordinaten (Rotation, CropBox),
  eingebrannte Felder, PAdES-Plattformsiegel, Abschlussbestätigung,
  Audit-Trail als Hash-Kette mit Datenbank-Triggern, Nachweispaket mit
  signiertem Manifest und Prüfskript.
- Abläufe: mehrere Beteiligte parallel oder nacheinander, Rollen,
  Zugangsschutz per Link, Einmalcode (E-Mail/SMS) oder Zugangscode,
  Vor-Ort-Signatur, Vertretung, Erinnerung, Ablauf, Widerruf, Ablehnung.
- Vorlagen mit unveränderlichen Versionen, Massenversand per CSV/XLSX,
  öffentliche Formulare, bedingte und berechnete Felder.
- Formhinweise zu deutschen Formvorschriften mit Bestätigungspflicht.
- Teams, Organisationen, API-Schlüssel (live/test), Webhooks nach
  „Standard Webhooks“, Idempotenz, OpenAPI, Einbettung, Zwei-Faktor,
  Branding, eigene Domain.
- Oberfläche: Editor „Studio“, mobile Signaturseite, Prüfstelle, Deutsch
  und Englisch.
- Gehärteter Docker-Betrieb mit Gotenberg für Word/ODT.

[Unveröffentlicht]: https://github.com/PBaumfalk/Paraph/compare/v0.2.0...main
[0.2.0]: https://github.com/PBaumfalk/Paraph/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PBaumfalk/Paraph/releases/tag/v0.1.0
