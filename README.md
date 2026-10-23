<img src="docs/assets/paraph-icon-256.png" width="72" alt="Paraph">

# Paraph

[![Tests, Image & Release](https://github.com/PBaumfalk/Paraph/actions/workflows/ci.yml/badge.svg)](https://github.com/PBaumfalk/Paraph/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
[![Docker-Image](https://img.shields.io/badge/ghcr.io-pbaumfalk%2Fparaph-blue?logo=docker)](https://github.com/PBaumfalk/Paraph/pkgs/container/paraph)
[![Version](https://img.shields.io/badge/Version-0.2.0-lightgrey.svg)](CHANGELOG.md)

**Dokumente elektronisch unterschreiben lassen – auf dem eigenen Server.**
Paraph ist eine selbst gehostete Alternative zu DocuSign und DocuSeal für
Kanzleien: PDF, Word oder ODT hochladen, Felder setzen, versenden. Die
Mandantin unterschreibt am Smartphone, und Paraph liefert ein versiegeltes
PDF mit Abschlussbestätigung und lückenlosem, manipulationsgesichertem
Audit-Trail. Ohne Lizenzgrenzen, ohne Preis pro Umschlag, mit REST-API für
Kanzleisoftware, n8n und Make.

Dokumente, Unterschriften und Protokolle bleiben auf Ihrem Server. Nach
außen geht nur, was Sie selbst einrichten: E-Mail-Versand, optional SMS,
S3 und ein Zeitstempeldienst, an den lediglich ein Hashwert übertragen wird.

> **English abstract** – Self-hosted e-signature platform for German law
> firms (DocuSign/DocuSeal alternative): simple electronic signatures (SES)
> with a hash-chained audit trail, PAdES platform seal with verified
> RFC 3161 timestamps, external Merkle anchoring, evidence package and a
> public verification page. Node 24, Fastify, SQLite, React; ships as a
> hardened Docker image. UI in German and English, documentation in German.

![Abgeschlossener Vorgang mit Ergebnis-Dateien und Verlauf](docs/screenshots/vorgang.png)

> [!IMPORTANT]
> **Stand 0.2.0: noch nicht für den Produktivbetrieb freigegeben.** Technisch
> ist Paraph abnahmefähig; offen sind die anwaltliche Freigabe der Erklärungs-
> und Hinweistexte und die Prüfung gegen echte Gegenstellen (Mailserver,
> Let's Encrypt). Details: [`docs/STATUS-0.2.0.md`](docs/STATUS-0.2.0.md).

## 📖 Handbuch

Die vollständige Dokumentation steht im **[Handbuch](docs/handbuch/README.md)**:
von den [Grundbegriffen](docs/handbuch/01-ueberblick.md) über
[Installation](docs/handbuch/02-installation.md) und
[API & Webhooks](docs/handbuch/05-api.md) bis zu
[Sicherheit](docs/handbuch/07-sicherheit.md),
[Recht](docs/handbuch/08-recht.md) und den ehrlich benannten
[Einschränkungen](docs/handbuch/10-einschraenkungen.md).

## Installation

<details>
<summary><strong>🖥️ Auf einem Linux-Server</strong> (empfohlen: ein Befehl, fragt alles Nötige ab)</summary>

Voraussetzungen: Docker mit Compose v2, `openssl`, eine Domain, die auf den
Server zeigt, ein SMTP-Zugang. Für automatisches HTTPS die Ports 80 und 443.

```sh
git clone https://github.com/PBaumfalk/Paraph.git /opt/paraph
cd /opt/paraph
sudo ./scripts/install.sh
```

Das Skript fragt Domain, HTTPS über Caddy, Let's-Encrypt-Adresse, SMTP und
den Zeitstempeldienst ab (Vorgabe: FreeTSA). Es erzeugt Hauptschlüssel und
Wiederherstellungs-Passphrase als Docker-Secrets, baut das Image, startet die
Dienste und zeigt am Ende den Einrichtungscode für `https://IHRE-DOMAIN/setup`.

**Übernehmen Sie die angezeigte Wiederherstellungs-Passphrase sofort in einen
Passwortmanager.** Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf
einem neuen Server wiederherstellen.

Aktualisieren, zurückrollen, wiederherstellen:

```sh
sudo ./scripts/update.sh              # Sicherung, Rückfall-Image, Build, Migration, Prüfung
sudo ./scripts/update.sh --rollback   # zurück auf den Stand vor dem letzten Update
sudo ./scripts/restore.sh backups/paraph-backup-….pbk
```

Ausführlich, auch ohne Rückfragen und hinter nginx oder Traefik:
[Handbuch, Kapitel 2](docs/handbuch/02-installation.md).
</details>

<details>
<summary><strong>🐳 Fertiges Docker-Image</strong></summary>

Jeder Stand auf `main` und jede Freigabe wird als Image veröffentlicht
(Freigaben für amd64 und arm64):

```sh
docker pull ghcr.io/pbaumfalk/paraph:latest   # letzte Freigabe
docker pull ghcr.io/pbaumfalk/paraph:main     # aktueller Entwicklungsstand
```

Solange das Repository privat ist, vorher `docker login ghcr.io` mit einem
Token mit dem Recht `read:packages`. Für den Betrieb empfiehlt sich trotzdem
`install.sh`: Es richtet Secrets, Proxy, Gotenberg und die Härtung des
Containers ein.
</details>

## Funktionen im Überblick

| Übersicht | Editor |
| --- | --- |
| ![Übersicht mit Vorgängen nach Status](docs/screenshots/uebersicht.png) | ![Editor mit gesetzten Feldern](docs/screenshots/editor.png) |

- **Vorgänge** mit einem oder mehreren PDF-, Word- oder ODT-Dokumenten; die
  maßgebliche Fassung wird mit SHA-256 festgehalten —
  [Kapitel 1](docs/handbuch/01-ueberblick.md)
- **Beteiligte mit Rollen**: Unterzeichner, Freigebende, Ausfüllende,
  Lesende, Zeugen; gleichzeitig oder nacheinander
- **12 Feldtypen** von Unterschrift und Paraphe über Datum, Auswahl und
  Anhang bis zu berechneten Feldern, mit Bedingungen und Prüfmustern
- **Zugangsschutz je Person**: Link, Einmalcode per E-Mail oder SMS,
  Zugangscode; Vor-Ort-Signatur und Vertretung
- **Vorlagen** mit unveränderlichen Versionen, **Massenversand** per
  CSV/XLSX, **öffentliche Formulare**
- **Formhinweise** zu deutschen Formvorschriften (z. B. Schriftform,
  Textform, § 3a RVG) mit Bestätigungspflicht vor dem Versand —
  [Kapitel 8](docs/handbuch/08-recht.md)
- **Team und Organisationen**: Rollen, Zwei-Faktor, OIDC (z. B. authentik),
  eigenes Branding und eigene Domain —
  [Kapitel 4](docs/handbuch/04-administration.md)

### Unterschreiben am Smartphone

Ohne Konto und ohne App: Die Mandantin öffnet den Link, wird Feld für Feld
geführt und unterschreibt mit dem Finger.

| Einladung | Unterschrift | Fertig |
| --- | --- | --- |
| ![Signaturseite mit Dokument](docs/screenshots/signieren-start-iphone.png) | ![Gezeichnete Unterschrift im Feld](docs/screenshots/signieren-zeichnen-iphone.png) | ![Bestätigung mit Download](docs/screenshots/signieren-fertig-iphone.png) |

### Nachweis, den man prüfen kann

![Prüfstelle: Echt und unverändert](docs/screenshots/pruefstelle.png)

- **Plattformsiegel** (PAdES) auf jedem abgeschlossenen PDF; jede spätere
  Änderung zeigt jeder PDF-Prüfer an
- **Geprüfte RFC-3161-Zeitstempel** (PAdES-B-T): Signatur, Hashwert, Nonce,
  ESS-Bindung und Zertifikatskette werden geprüft, bevor ein Zeitstempel
  zählt. FreeTSA ist voreingestellt, jeder RFC-3161-Dienst lässt sich
  eintragen —
  [Kapitel 3](docs/handbuch/03-konfiguration.md#dokumentenumwandlung-zeitstempel-und-verankerung)
- **Audit-Trail als Hash-Kette** mit Datenbank-Triggern und **externer
  Verankerung** (Merkle-Baum nach RFC 6962): Auch wer vollen Serverzugriff
  hat, kann die Historie nicht unbemerkt neu schreiben —
  [Kapitel 7](docs/handbuch/07-sicherheit.md)
- **Nachweispaket** (ZIP) mit allen Fassungen, Protokoll, signiertem
  Manifest und einem unabhängigen Prüfskript in Python
- **Prüfstelle** unter `/verify`: Der Fingerabdruck wird im Browser
  berechnet, die Datei verlässt den Rechner nicht

Paraph erzeugt **einfache elektronische Signaturen (EES)** und sagt das auch
so. Wo das Gesetz Schriftform verlangt, genügt das nicht; Paraph täuscht keine
qualifizierte Signatur vor.

### Anbindung an Kanzleisoftware

- **REST-API** mit API-Schlüsseln (live/test), Idempotenz und
  OpenAPI-Beschreibung unter `/docs/api`
- **Webhooks** nach „Standard Webhooks“ (HMAC-signiert, mit Wiederholung)
- **Linkübergabe ohne E-Mail** für Kanzleisoftware wie j-lawyer
  (`notify: false`), **Einbettung** der Signaturseite
- Beispiele für **n8n und Make** —
  [Kapitel 5](docs/handbuch/05-api.md#beispiele-für-n8n-und-make)

### Betrieb

- Gehärteter Container (UID 1000, schreibgeschütztes Dateisystem, keine
  Capabilities), Gotenberg für Word/ODT isoliert ohne Internetzugang
- Verschlüsselte Ablage (AES-256-GCM) und automatische, verschlüsselte
  Sicherung, optional nach S3 — [Kapitel 6](docs/handbuch/06-sicherung.md)
- Systemdiagnose in der Oberfläche und als `paraph doctor`, Metriken für
  Prometheus

## Für Entwickler

Node 24, Fastify, SQLite (better-sqlite3), React 19, pdf.js, pdf-lib, pkijs.

```sh
npm ci
npm run dev:server & npm run dev:web     # Entwicklung
npm run typecheck && npm test            # Typprüfung und Vitest
npm run build && npx playwright test     # Browser-Tests (Mailpit auf 1025/8025)
node scripts/docker-e2e.mjs              # Docker-Gesamtprüfung: Update, Rückweg, HTTPS, Katastrophenfall
PARAPH_LIVE_TSA=1 npx vitest run tests/freetsa.test.ts   # gegen den echten Zeitstempeldienst
```

Die Browser-Tests laufen auf Desktop-Chrome, Pixel 7 und iPhone 14 (WebKit).
Welche Prüfung was belegt, steht in
[Tests und Nachweise](docs/handbuch/09-tests-und-nachweise.md); die
Screenshots oben erzeugt `PARAPH_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts`
mit erfundenen Demodaten.

Was sich von Version zu Version ändert, steht im
[Änderungsprotokoll](CHANGELOG.md).

## Lizenz

[MIT](LICENSE) — © 2026 Patrick Baumfalk.

Das mitgelieferte Wurzelzertifikat von FreeTSA
(`docker/tsa/freetsa-root-ca.pem`) stammt von [freetsa.org](https://freetsa.org).

## Haftungsausschluss

Paraph ist ein technisches Werkzeug und ersetzt keine Rechtsberatung. Ob die
elektronische Form im Einzelfall genügt, ist selbst zu prüfen; Vorlagen,
Mustertexte und Formhinweise sind ohne Gewähr. Das Plattformsiegel belegt die
Unversehrtheit eines Dokuments seit dem Abschluss. Es ist weder ein
qualifiziertes Siegel noch eine persönliche Signatur der Unterzeichner.
