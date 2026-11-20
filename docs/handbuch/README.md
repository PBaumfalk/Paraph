# Paraph – Handbuch

Paraph ist eine selbst gehostete Plattform für elektronische Unterschriften, etwa für Unternehmen, Kanzleien, Steuerbüros, Vereine und Verwaltungen. Dieses Handbuch erklärt jede Funktion an der Stelle, an der Sie sie im Alltag brauchen. Stand: 20.11.2026, Version 0.3.1 ([Änderungsprotokoll](../../CHANGELOG.md)).

## Wo fange ich an?

| Sie sind … | und wollen … | Lesen Sie |
|---|---|---|
| **neu bei Paraph** | verstehen, was Paraph tut, und einmal alles durchspielen | [1. Paraph in fünf Minuten](01-paraph-in-fuenf-minuten.md), dann [Ihr erster Vorgang Schritt für Schritt](01-paraph-in-fuenf-minuten.md#ihr-erster-vorgang-schritt-für-schritt) mit dem [Beispieldokument](beispiele/Einwilligung-Beispiel.pdf) |
| **Sachbearbeitung, Sekretariat, Assistenz** | Dokumente zur Unterschrift vorbereiten, versenden und nachfassen | [2. Unterschreiben lassen](02-dokument-unterschreiben-lassen.md) → [3. Vorgänge verfolgen](03-vorgaenge-verfolgen.md) → [4. Vorlagen und Serien](04-vorlagen-serien-formulare.md) |
| **Verantwortliche** (Geschäftsführung, Personalabteilung, Anwältin) | das Ergebnis kontrollieren, ablegen, die Rechtslage einordnen | [Ergebnis abholen](03-vorgaenge-verfolgen.md#das-ergebnis-abholen) → [6. Dokumente prüfen](06-dokumente-pruefen.md) → [7. Recht](07-recht.md) |
| **Leitung, Administration** | Team, Rollen, Erscheinungsbild und Aufbewahrung festlegen | [8. Organisation, Team und Erscheinungsbild](08-organisation-team-erscheinungsbild.md), [9. Anmeldung](09-anmeldung-und-sso.md) |
| **IT, Admin** | Paraph installieren, betreiben, sichern | [18. Installation mit Claude Code](18-installation-mit-claude-code.md) oder [11. Installation](11-installation.md) → [13. Sicherung und Updates](13-sicherung-und-updates.md) → [15. Diagnose](15-diagnose-und-fehlersuche.md) |
| **Entwicklung, Anbindung** | eigene Fachsoftware, n8n oder Make anbinden | [10. API und Webhooks](10-anbindung-api-webhooks.md) |

Welche Funktion wo erklärt ist, zeigt die [Funktionsliste](funktionsliste.md). Begriffe erklärt das [Glossar](glossar.md).

## Teil A – Arbeiten mit Paraph

Für alle, die Dokumente versenden oder Ergebnisse prüfen. Kein technisches Vorwissen nötig.

| Kapitel | Worum es geht |
|---|---|
| [1. Paraph in fünf Minuten](01-paraph-in-fuenf-minuten.md) | Die Grundbegriffe, ein Durchlauf in Bildern und Ihr erster Vorgang mit Beispieldaten |
| [2. Ein Dokument unterschreiben lassen](02-dokument-unterschreiben-lassen.md) | Hochladen, Beteiligte und Felder festlegen, Zugangsschutz, Formhinweise, Versand |
| [3. Vorgänge verfolgen](03-vorgaenge-verfolgen.md) | Übersicht, Erinnern, Widerrufen, Ergebnis-Dateien, Testmodus |
| [4. Vorlagen, Serien und Formulare](04-vorlagen-serien-formulare.md) | Wiederkehrende Dokumente, Massenversand, öffentliche Formulare, Vor-Ort-Signatur |
| [5. So unterschreiben die Beteiligten](05-so-unterschreiben-die-beteiligten.md) | Die Signaturseite aus Sicht der Unterzeichnenden, am Smartphone und am Rechner |
| [6. Dokumente prüfen](06-dokumente-pruefen.md) | Prüfstelle, Siegel, Nachweispaket, was man einem Gericht vorlegt |
| [7. Recht: Signaturstufen, Formvorschriften, Datenschutz](07-recht.md) | Signaturstufen, Formvorschriften, Datenschutz, Stand der Freigabe |

## Teil B – Einrichten und verwalten

Für Inhaber und Administration der Organisation.

| Kapitel | Worum es geht |
|---|---|
| [8. Organisation, Team und Erscheinungsbild einrichten](08-organisation-team-erscheinungsbild.md) | Ersteinrichtung, Rollen, Einladungen, Logo und Farbe, E-Mail-Texte, Aufbewahrung |
| [9. Anmeldung und SSO](09-anmeldung-und-sso.md) | Passwort, Zwei-Faktor, Sitzungen, Anmeldung über authentik |
| [10. Anbindung: API und Webhooks](10-anbindung-api-webhooks.md) | REST-API, Webhooks, Einbettung, Linkübergabe aus eigener Software |

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
| [18. Installation mit Claude Code](18-installation-mit-claude-code.md) | Probebetrieb und Server-Installation mit fertigem Auftrag für Claude Code, dazu die Befehle zum Nachvollziehen |

Außerdem: [Funktionsliste](funktionsliste.md) (jede Funktion mit Rolle, Fundstelle und Kapitel) · [Glossar](glossar.md) · [Beispieldokument](beispiele/Einwilligung-Beispiel.pdf)

## In der laufenden Instanz

- `/verify` – Prüfstelle („Dokument prüfen“): Datei gegen das Hash-Register und das eingebettete Siegel prüfen
- `/docs/api` – API-Dokumentation, `/api/v1/openapi.json` – OpenAPI-Dokument
- `/metrics` – Zählwerte für Prometheus (nur mit `METRICS_TOKEN`)

> **Wichtig:** Vorlagen, Mustertexte und Formhinweise in Paraph ersetzen keine Rechtsberatung. Ob die elektronische Form im Einzelfall genügt, ist selbst zu prüfen. Die rechtlichen Texte sind noch nicht anwaltlich freigegeben ([Kapitel 7](07-recht.md)).
