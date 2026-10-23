# Paraph – Handbuch

Dieses Handbuch erklärt Paraph so, wie man es benutzt: Teil A für alle, die Dokumente unterschreiben lassen, Teil B für die Kanzlei-Administration, Teil C für die IT, die Paraph betreibt. Stand: 23.10.2026, Version 0.2.0 mit den Änderungen aus dem [Änderungsprotokoll](../../CHANGELOG.md).

Wer Paraph zum ersten Mal sieht, beginnt mit [Kapitel 1](01-paraph-in-fuenf-minuten.md). Es zeigt in fünf Minuten einen ganzen Vorgang vom Hochladen bis zum versiegelten PDF.

## Teil A – Arbeiten mit Paraph

Für Anwältinnen, Anwälte und Mitarbeitende. Kein technisches Vorwissen nötig.

| Kapitel | Worum es geht |
|---|---|
| [1. Paraph in fünf Minuten](01-paraph-in-fuenf-minuten.md) | Die Grundbegriffe und ein vollständiger Durchlauf in Bildern |
| [2. Ein Dokument unterschreiben lassen](02-dokument-unterschreiben-lassen.md) | Hochladen, Beteiligte und Felder festlegen, Zugangsschutz, Formhinweise, Versand |
| [3. Vorgänge verfolgen](03-vorgaenge-verfolgen.md) | Übersicht, Erinnern, Widerrufen, Ergebnis-Dateien, Testmodus |
| [4. Vorlagen, Serien und Formulare](04-vorlagen-serien-formulare.md) | Wiederkehrende Dokumente, Massenversand, öffentliche Formulare, Vor-Ort-Signatur |
| [5. So unterschreiben Ihre Mandanten](05-so-unterschreiben-mandanten.md) | Die Signaturseite aus Sicht der Mandantin, am Smartphone und am Rechner |
| [6. Dokumente prüfen](06-dokumente-pruefen.md) | Prüfstelle, Siegel, Nachweispaket, was man einem Gericht vorlegt |
| [7. Recht: Signaturstufen, Formvorschriften, Datenschutz](07-recht.md) | Signaturstufen, Formvorschriften, Datenschutz, Stand der Freigabe |

## Teil B – Einrichten und verwalten

Für Inhaber und Administration der Kanzlei.

| Kapitel | Worum es geht |
|---|---|
| [8. Kanzlei, Team und Erscheinungsbild einrichten](08-kanzlei-team-erscheinungsbild.md) | Ersteinrichtung, Rollen, Einladungen, Logo und Farbe, E-Mail-Texte, Aufbewahrung |
| [9. Anmeldung und SSO](09-anmeldung-und-sso.md) | Passwort, Zwei-Faktor, Sitzungen, Anmeldung über authentik |
| [10. Anbindung: API und Webhooks](10-anbindung-api-webhooks.md) | REST-API, Webhooks, Einbettung, Linkübergabe aus der Kanzleisoftware |

## Teil C – Betrieb

Für die IT, die Paraph installiert und betreibt.

| Kapitel | Worum es geht |
|---|---|
| [11. Installation](11-installation.md) | Voraussetzungen, `install.sh`, Reverse Proxy, öffentlich nötige Pfade |
| [12. Konfiguration](12-konfiguration.md) | Alle Umgebungsvariablen und Secrets |
| [13. Sicherung und Updates](13-sicherung-und-updates.md) | Verschlüsselte Sicherung, Wiederherstellung, Update mit Rückweg |
| [14. Sicherheit und Nachweis](14-sicherheit-und-nachweis.md) | Audit-Trail, Verankerung, Zeitstempel, Siegel, Härtung |
| [15. Diagnose und Fehlersuche](15-diagnose-und-fehlersuche.md) | `paraph doctor`, Systemseite, typische Störungen |
| [16. Tests und Nachweise](16-tests-und-nachweise.md) | Was automatisch geprüft wird und wie man es selbst prüft |
| [17. Grenzen](17-grenzen.md) | Was Paraph nicht kann oder noch nicht unter Realbedingungen geprüft ist |

Begriffe von A bis Z erklärt das [Glossar](glossar.md).

## In der laufenden Instanz

- `/verify` – Prüfstelle: Datei gegen das Hash-Register und das eingebettete Siegel prüfen
- `/docs/api` – API-Dokumentation, `/api/v1/openapi.json` – OpenAPI-Dokument
- `/metrics` – Zählwerte für Prometheus (nur mit `METRICS_TOKEN`)

> **Wichtig:** Vorlagen, Mustertexte und Formhinweise in Paraph ersetzen keine Rechtsberatung. Ob die elektronische Form im Einzelfall genügt, ist selbst zu prüfen. Die rechtlichen Texte sind noch nicht anwaltlich freigegeben ([Kapitel 7](07-recht.md)).
