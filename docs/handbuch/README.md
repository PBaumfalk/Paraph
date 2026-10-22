# Paraph – Handbuch

Handbuch für Kanzlei-Inhaber und Administratoren. Stand: 22.10.2026, Version 0.2.0.

| Kapitel | Inhalt | Für |
|---|---|---|
| [1. Überblick und Konzepte](01-ueberblick.md) | Vorgang, Dokument, Rollen, Felder, Vorlagen, Formulare, Abläufe | alle |
| [2. Installation](02-installation.md) | Voraussetzungen, `install.sh`, Caddy oder eigener Reverse Proxy, Ersteinrichtung, Updates mit `update.sh` und Rückweg, eigene Domain | Administration |
| [3. Konfiguration](03-konfiguration.md) | alle Umgebungsvariablen, Zeitstempel und Verankerung, SMTP-Verschlüsselung, Monitoring | Administration |
| [4. Administration](04-administration.md) | Team und Rollen, Organisationen, System (Diagnose, Test-E-Mail, Benutzerkonten, Alarm), Datenschutzhinweise, Branding, Aufbewahrung, Zwei-Faktor, OIDC, Notfallzugang | Inhaber, Administration |
| [5. API, Webhooks, Einbettung](05-api.md) | API-Schlüssel, Testmodus, Komplett-Anlage, Vorlagen, Linkübergabe, Webhooks | Administration, Integration |
| [6. Sicherung und Wiederherstellung](06-sicherung.md) | verschlüsselte Sicherung, Wiederherstellungs-Passphrase, Prüfen, Wiederherstellen mit `restore.sh`, S3 | Administration |
| [7. Sicherheit](07-sicherheit.md) | Bedrohungsmodell, technische Maßnahmen, Integritätsprüfung, externe Verankerung, Grenzen, Befunde | Inhaber, Administration |
| [8. Recht](08-recht.md) | EES/FES/QES, Formhinweise, Datenschutz | Inhaber |
| [9. Tests und Nachweise](09-tests-und-nachweise.md) | Testabdeckung, Docker-Gesamtprüfung (Update, Caddy, STARTTLS, Katastrophenfall), unabhängige Prüfwerkzeuge, selbst ausführen | Administration |
| [10. Einschränkungen](10-einschraenkungen.md) | was Paraph nicht kann oder nicht getestet ist | alle |

Weitere Quellen in der laufenden Instanz:

- `/docs/api` – API-Dokumentation
- `/api/v1/openapi.json` – OpenAPI-Dokument
- `/verify` – Prüfstelle: Datei gegen das Hash-Register und eingebettete Siegel prüfen
- `/metrics` – Zählwerte für Prometheus (nur mit `METRICS_TOKEN`)

Vorlagen, Mustertexte und Formhinweise ersetzen keine Rechtsberatung.
