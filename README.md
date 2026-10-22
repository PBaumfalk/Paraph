# Paraph

Paraph ist eine selbst gehostete Plattform für elektronische Signaturen. Sie läuft als Docker-Container auf eigener Hardware; Dokumente, Unterschriften und Protokolle verlassen den Server nur, wenn Sie externe Dienste (SMTP, SMS, Zeitstempel, S3) einrichten. Paraph erzeugt einfache elektronische Signaturen (EES) mit lückenlosem Audit-Trail und versiegelt das Ergebnis mit einem technischen Plattformsiegel.

> **Hinweis:** Vorlagen, Mustertexte und Formhinweise in Paraph ersetzen keine Rechtsberatung. Ob die elektronische Form im Einzelfall genügt, prüfen Sie selbst. Siehe [Handbuch, Kapitel 8](docs/handbuch/08-recht.md).

## Schnellstart mit Docker

Voraussetzungen: Docker mit Compose-Plugin, `openssl`, eine Domain mit HTTPS über einen Reverse Proxy.

```sh
# 1. Einmalig vorbereiten: Hauptschlüssel, .env mit Einrichtungscode, Sicherungsordner
./scripts/init.sh

# 2. .env anpassen: mindestens APP_URL, SMTP_URL, MAIL_FROM
nano .env

# 3. Starten (Paraph + Gotenberg für Word/ODT-Umwandlung)
docker compose up -d

# 4. Im Browser https://IHRE-DOMAIN/setup öffnen und den SETUP_CODE aus .env eingeben
```

`init.sh` legt den Hauptschlüssel unter `secrets/master.key` an. **Bewahren Sie diese Datei getrennt von den Sicherungen auf.** Ohne sie sind gespeicherte Dokumente nicht mehr lesbar.

Details: [Installation](docs/handbuch/02-installation.md).

## Reverse Proxy

Der Container lauscht nur auf `127.0.0.1:8080`. HTTPS stellt ein vorgeschalteter Reverse Proxy bereit (Caddy, nginx, Traefik).

- `APP_URL` muss die öffentliche Adresse mit `https://` sein. Davon hängen Links in E-Mails, sichere Cookies und HSTS ab.
- `TRUST_PROXY=true` nur setzen, wenn Paraph ausschließlich über den Proxy erreichbar ist. Dann übernimmt Paraph die Client-IP aus `X-Forwarded-For` in den Audit-Trail und in die Rate-Limits.
- Uploads bis 60 MB je Anfrage zulassen (z. B. nginx `client_max_body_size 60m`).

Beispiele für Caddy und nginx: [Installation, Abschnitt Reverse Proxy](docs/handbuch/02-installation.md#reverse-proxy).

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
