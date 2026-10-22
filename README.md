# Paraph

Paraph ist eine selbst gehostete Plattform für elektronische Signaturen. Sie läuft als Docker-Container auf eigener Hardware; Dokumente, Unterschriften und Protokolle verlassen den Server nur, wenn Sie externe Dienste (SMTP, SMS, Zeitstempel, S3) einrichten. Paraph erzeugt einfache elektronische Signaturen (EES) mit lückenlosem Audit-Trail und versiegelt das Ergebnis mit einem technischen Plattformsiegel.

> **Hinweis:** Vorlagen, Mustertexte und Formhinweise in Paraph ersetzen keine Rechtsberatung. Ob die elektronische Form im Einzelfall genügt, prüfen Sie selbst. Siehe [Handbuch, Kapitel 8](docs/handbuch/08-recht.md).

## Installation

Voraussetzungen: Linux-Server mit Docker und Compose-Plugin, `openssl`, Root-Rechte, eine Domain. Für automatisches HTTPS über den mitgelieferten Caddy die Ports 80 und 443; sonst ein eigener Reverse Proxy.

```sh
sudo ./scripts/install.sh
```

Das Skript fragt Domain, Caddy ja/nein, E-Mail für Let's Encrypt, SMTP-Zugang, Absender und Zeitstempeldienst ab. Es erzeugt den Hauptschlüssel `secrets/master.key` und die Wiederherstellungs-Passphrase `secrets/backup_passphrase` (als Docker-Secrets, nur für den Container-Benutzer lesbar), legt `.env` an, baut das Image und startet die Dienste. Am Ende zeigt es den Einrichtungscode für `https://IHRE-DOMAIN/setup`.

**Übernehmen Sie die angezeigte Wiederherstellungs-Passphrase sofort in einen Passwortmanager.** Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf einem neuen Server wiederherstellen. Ohne Passphrase und ohne `secrets/master.key` sind Sicherungen nicht lesbar.

`scripts/init.sh` aus Version 0.1.0 ist veraltet und wird nicht mehr empfohlen.

Details, Variablen für eine Installation ohne Rückfragen und Beispiele für nginx: [Installation](docs/handbuch/02-installation.md).

## Aktualisieren und Wiederherstellen

```sh
sudo ./scripts/update.sh              # Sicherung, Rückfall-Image, Build, Start mit Migration, Prüfung
sudo ./scripts/update.sh --rollback   # zurück auf den Stand vor dem letzten Update
sudo ./scripts/restore.sh backups/paraph-backup-….pbk   # Wiederherstellung, auch auf einem neuen Server
```

Details: [Updates](docs/handbuch/02-installation.md#updates-mit-updatesh), [Sicherung und Wiederherstellung](docs/handbuch/06-sicherung.md).

## Reverse Proxy

Paraph lauscht nur auf `127.0.0.1:8080`. HTTPS übernimmt der mitgelieferte Caddy (Profil `caddy`) oder ein vorhandener Reverse Proxy (nginx, Traefik).

- `APP_URL` muss die öffentliche Adresse mit `https://` sein. Davon hängen Links in E-Mails, sichere Cookies und HSTS ab.
- `TRUST_PROXY=true` bedeutet genau einen vertrauenswürdigen Proxy-Hop. Nur setzen, wenn Paraph ausschließlich über den Proxy erreichbar ist. Bei zwei Proxys hintereinander die Anzahl oder die Proxy-Netze angeben.
- Uploads bis 60 MB je Anfrage zulassen (z. B. nginx `client_max_body_size 60m`).

Beispiele: [Installation, Abschnitt Reverse Proxy](docs/handbuch/02-installation.md#reverse-proxy).

## Tests

```sh
npm ci && npm test                 # Vitest
npm run build && npx playwright test   # Browser-Tests, Mailpit auf 127.0.0.1:1025/8025 nötig
node scripts/docker-e2e.mjs        # Docker-Gesamtprüfung, vorher Test-Images bauen
```

Stand 0.2.0: Vitest 81 bestanden, 18 übersprungen (MinIO- und authentik-Tests ohne laufende Dienste); Playwright 7 Läufe; Docker-Gesamtprüfung 29 von 29. Details und Voraussetzungen: [Tests und Nachweise](docs/handbuch/09-tests-und-nachweise.md).

## Funktionen

- Vorgänge mit einem oder mehreren PDF-, Word- oder ODT-Dokumenten; maßgebliche Fassung mit SHA-256-Hash
- Beteiligte mit Rollen: Unterzeichner, Freigebende, Ausfüllende, Lesende, Zeugen; parallel oder in Reihenfolge
- Felder: Unterschrift, Paraphe, Name, E-Mail, Text, Zahl, Datum, Unterzeichnungsdatum, Kontrollkästchen, Auswahl, Formel, Anhang; mit Bedingungen und Prüfmustern
- Zugangsschutz je Person: Link, Einmalcode per E-Mail oder SMS, Zugangscode
- Vorlagen mit unveränderlichen Versionen, Massenversand per CSV/XLSX, öffentliche Formulare
- Vor-Ort-Signatur, Vertretung, Erinnerungen, Ablauf, Widerruf, Ablehnung
- Abschluss: finales PDF mit PAdES-Plattformsiegel (optional mit RFC-3161-Zeitstempel), Abschlussbestätigung, Nachweispaket, Hash-Prüfung unter `/verify`
- Formhinweise zu deutschen Formvorschriften mit Bestätigungspflicht vor dem Versand
- Team mit Rollen, mehrere Organisationen, Branding, eigene Domain, Zwei-Faktor, OIDC (z. B. authentik)
- REST-API mit API-Schlüsseln, Testmodus, Idempotenz, Webhooks nach „Standard Webhooks“, Einbettung der Signaturseite
- Verschlüsselte Ablage (AES-256-GCM), automatische Sicherung mit Prüf- und Wiederherstellungsbefehl

## Handbuch

1. [Überblick und Konzepte](docs/handbuch/01-ueberblick.md)
2. [Installation](docs/handbuch/02-installation.md)
3. [Konfiguration](docs/handbuch/03-konfiguration.md)
4. [Administration](docs/handbuch/04-administration.md)
5. [API, Webhooks, Einbettung](docs/handbuch/05-api.md)
6. [Sicherung und Wiederherstellung](docs/handbuch/06-sicherung.md)
7. [Sicherheit](docs/handbuch/07-sicherheit.md)
8. [Recht: Signaturstufen, Formvorschriften, Datenschutz](docs/handbuch/08-recht.md)
9. [Tests und Nachweise](docs/handbuch/09-tests-und-nachweise.md)
10. [Einschränkungen](docs/handbuch/10-einschraenkungen.md)

## Lizenz

MIT. Siehe `package.json` (`"license": "MIT"`).
