# Änderungsprotokoll

Alle nennenswerten Änderungen an Paraph werden hier festgehalten.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).
Solange die Version mit 0 beginnt, können sich Schnittstellen und
Konfiguration zwischen Versionen ändern; `update.sh` migriert die Daten.

## [Unveröffentlicht]

### Geändert

- README allgemein gefasst (Unternehmen, Kanzleien, Steuerbüros, Vereine,
  Verwaltungen) mit Ausprobieren per `docker run` in einer Minute; Demodaten der
  Bildschirmfotos auf ein erfundenes Unternehmen umgestellt.

## [0.3.0] – 2026-11-20

### Neu

- **Probebetrieb:** `./scripts/install.sh --probe` startet Paraph ohne Domain,
  HTTPS, E-Mail und root unter `http://localhost:8080` (anderer Port mit
  `PARAPH_PORT`). Gedacht zum Ausprobieren und für Schulungen, nicht für
  echte Mandantendaten. `.env` erhält `PARAPH_PROBE=1`; die Diagnose meldet
  einen fehlenden Mailserver dann als Hinweis statt als Fehler.
- **Handbuch, Kapitel 18 „Installation mit Claude Code“** mit fertigen
  Aufträgen für Probebetrieb und Server; der Probebetrieb-Auftrag ist in
  einem frischen Klon mit Claude Code nachgespielt.
- Handbuch: Abschnitt „Ihr erster Vorgang Schritt für Schritt“ (Kapitel 1)
  mit Beispieldokument `docs/handbuch/beispiele/Mandatsvereinbarung-Beispiel.pdf`,
  Wegweiser nach Zielgruppe und eine Funktionsliste
  (`docs/handbuch/funktionsliste.md`).
- `install.sh`: `PARAPH_QUIET_SECRETS=1` zeigt die Wiederherstellungs-Passphrase
  nicht an, sondern nennt nur ihren Ablageort; `--help`.

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

### Geändert

- Docker-Image: Jeder Stand auf `main` erscheint zusätzlich als
  `ghcr.io/pbaumfalk/paraph:main` (und `main-<Commit>`); Freigaben weiter mit
  Versionsnummer und `latest`. Das Image ist öffentlich.
- README für die Veröffentlichung neu geschrieben: Schnellstart für
  Probebetrieb, Server und Claude Code, Wegweiser nach Zielgruppe,
  Funktionsübersicht mit Kapitellinks.
- Versanddialog: Ist kein Mailserver eingerichtet, ist „Einladungen per
  E-Mail senden“ nicht mehr vorgewählt, und ein Hinweis erklärt, dass die
  Links selbst weitergegeben werden. Vorher wurden solche Einladungen
  versendet, kamen aber nie an.
- `install.sh` nennt am Ende die tatsächliche `APP_URL` statt immer
  `https://<Domain>`, meldet bei einer bereits eingerichteten Instanz die
  Anmeldeadresse statt des Einrichtungscodes, prüft vorab, ob Docker läuft
  und der Port frei ist, und bricht unter Linux ohne root mit UID ≠ 1000
  mit verständlicher Meldung ab (vorher scheiterte der Start ohne klare
  Ursache).

- **Handbuch neu geschrieben**, nach Aufgaben statt nach Technik: Teil A
  für die Arbeit mit Paraph (Kapitel 1–7), Teil B für die Einrichtung
  (8–10), Teil C für den Betrieb (11–17), dazu ein Glossar und Bilder aus
  der App. Jede Angabe gegen den Code geprüft; wo das alte Handbuch mehr
  versprach als die Oberfläche kann, steht jetzt der tatsächliche Stand.
- **README neu.**
- **Neue Gestaltung „Der Rand“.** Petrol statt Indigo, Schrift Literata
  (Titel) und IBM Plex Sans (Bedienung), Flächen als Bögen mit Haarlinie,
  Reiter wie Register einer Akte, keine Überschriften in Versalien. Die
  Seitenleiste ist der Rand des Bogens: feine rote Randlinie, der aktive
  Eintrag trägt die Paraphe. Abgeschlossenes zeigt ein Siegel aus
  Siegellack mit eingeprägter Paraphe (Vorgang, Signaturseite, Prüfstelle).
  Neue Anmeldeseite, Favicon und Abschlussbestätigung in Petrol.
- Standard-Akzentfarbe der Kanzlei ist Petrol (`#0D5C63`). War der
  frühere Standard `#3D5AFE` gespeichert, gilt automatisch Petrol; eine
  eigene Farbe bleibt.

### Behoben

- **Zeitstempel:** Die Nonce der Zeitstempelanfrage begann bei etwa jeder
  256. Anfrage mit einem Null-Byte (nicht minimal kodiert). OpenSSL-basierte
  Dienste wie FreeTSA lehnen solche Anfragen ab; Siegel und Anker blieben dann
  ohne Zeitstempel. Die Nonce ist jetzt immer minimal kodiert
  (`tests/timestamp-nonce.test.ts`). Derselbe Fehler machte einen Test in
  `tests/integrity.test.ts` gelegentlich rot.
- Versanddialog: „Jetzt versenden“ war für einen Moment klickbar, bevor die
  Vorabprüfung (Formhinweise, fehlende Felder) geladen war; ein Klick endete
  dann in einer Fehlermeldung des Servers. Der Knopf wartet jetzt auf die
  Prüfung. Der Browser-Test F schlug dadurch gelegentlich fehl.
- **Siegelprüfung:** Endete der Signaturwert eines Siegels zufällig auf ein
  Null-Byte (etwa jedes 256. Siegel), schnitt „Zusätzlich das eingebettete
  Siegel prüfen“ dieses Byte ab und meldete ein unverändertes Dokument als
  ungültig. Die Länge wird jetzt aus dem DER-Kopf gelesen
  (`tests/verify-contents.test.ts`). Derselbe Fehler machte einen Test in
  `tests/integrity.test.ts` gelegentlich rot.
- „Verwenden“ und „Massenversand“ erschienen auch mit der Rolle „Nur lesen“
  und endeten in einer Fehlermeldung; sie sind dort jetzt ausgeblendet.
- Team: Die Administration bekam „Inhaber“ zur Auswahl und konnte die Rolle
  von Inhabern scheinbar ändern, was der Server ablehnte. Beides wird nur
  noch Inhabern angeboten.
- `paraph` ohne Befehl nennt jetzt auch `version`.
- Handbuch: QES-Anzeige steht unter „Siegel und Signaturstufen“, nicht unter
  „System“; Rollentabelle („einsehen und ändern“); veralteter Hinweis
  „Abgelehnt“ nach Weitergabe an eine Vertretung entfernt.

- `install.sh`: Ein erneuter Aufruf ersetzte `secrets/tsa_ca.pem` durch die
  Antwort auf die Zeitstempel-Frage (Vorgabe FreeTSA), ließ `TSA_URL` in
  `.env` aber stehen. Bei vorhandener `.env` bleiben Dienst und Zertifikat
  jetzt unverändert.
- Einstellungen: Ein Klick im Untermenü führte ins Leere (relative Links,
  z. B. `/settings/profile/team`). Betraf alle Browser.
- Langer Kanzleiname ragte über die Seitenleiste hinaus; er bricht jetzt
  auf höchstens zwei Zeilen um.
- Übersicht am Telefon: Reiter und Suchfeld teilten sich eine Zeile, die
  Reiter waren nicht lesbar.
- Öffentliche Formulare: Feste Kanzlei-Rollen (etwa die gegenzeichnende
  Anwältin) bekamen keine Einladungs-E-Mail, wenn sie an der Reihe waren.
  Sie werden jetzt eingeladen und erinnert; die Besucherin bekommt weder
  Einladung noch Erinnerung.
- Linkübergabe (ohne E-Mail-Einladungen): Kam bei „Nacheinander“ oder nach
  einer Vertretung jemand neu an die Reihe, erfuhr es niemand. Der Absender
  erhält jetzt eine E-Mail „Link übergeben: … ist an der Reihe“, die
  Vorgangsseite zeigt „wartet auf Ihren Link“ mit direktem Knopf, und der
  Webhook `recipient.notified` trägt das Feld `channel`.
- Signaturseite: Wer an eine Vertretung weitergab, sah „Abgelehnt“, und
  eingebettete Portale erhielten `paraph:declined`. Jetzt erscheint
  „Weitergegeben“, die Nachricht heißt `paraph:delegated`.
- Menüs klappten immer nach unten auf. Am unteren Bildrand (Leiste der
  Signaturseite) lagen „An Vertretung weitergeben“ und „Nachricht anzeigen“
  dadurch außerhalb des Bildschirms. Menüs öffnen jetzt nach oben, wenn
  unten kein Platz ist.
- Vertretungsdialog: Beschriftungen sind mit den Eingabefeldern verknüpft
  (Screenreader, Autovervollständigung).
- Docker-Gesamttest J5 prüft jetzt das Ergebnis von `paraph verify-audit`
  (keine beschädigte Kette, keine Abweichung, Exit-Code 0) statt nur dessen
  Ausgabe.

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

[Unveröffentlicht]: https://github.com/PBaumfalk/Paraph/compare/v0.3.0...main
[0.3.0]: https://github.com/PBaumfalk/Paraph/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/PBaumfalk/Paraph/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PBaumfalk/Paraph/releases/tag/v0.1.0
