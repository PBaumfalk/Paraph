# 4. Administration

Die Einstellungen liegen in der Oberfläche unter **Einstellungen**: Profil und Sicherheit, Organisation, Team, Erscheinungsbild und E-Mails, Siegel und Signaturstufen, API und Webhooks, System.

## Team, Rollen und Berechtigungen

Grundlage ist `src/server/domain/authz.ts`. Jede Person hat je Organisation genau eine Rolle.

| Berechtigung | Inhaber (`owner`) | Administrator (`admin`) | Mitglied (`member`) | Leser (`viewer`) |
|---|:-:|:-:|:-:|:-:|
| Vorgänge ansehen | ja | ja | ja (siehe Sichtbarkeit) | ja |
| Vorgänge anlegen, versenden, widerrufen | ja | ja | ja, nur eigene | nein |
| Vorlagen ansehen | ja | ja | ja | ja |
| Vorlagen bearbeiten | ja | ja | ja, nur eigene | nein |
| Kontakte nutzen | ja | ja | ja | nein |
| Organisation, Branding, Aufbewahrung | ja | ja | nein | nein |
| Team verwalten | ja | ja | nein | nein |
| API-Schlüssel und Webhooks | ja | ja | nein | nein |
| Aktivitätsprotokoll | ja | ja | nein | nein |
| Inhaber ernennen oder entfernen | ja | nein | nein | nein |

Regeln:

- Nur Inhaber laden weitere Inhaber ein oder ändern Inhaberrechte.
- Eine Organisation braucht mindestens einen Inhaber; den letzten kann niemand herabstufen oder entfernen.
- Entfernte Mitglieder verlieren sofort ihre Sitzungen in dieser Organisation. Ihre privaten Vorlagen werden für die Organisation sichtbar.
- Einladungen gelten 7 Tage und werden per E-Mail versendet. Ohne SMTP zeigt die Oberfläche den Einladungslink an.

### Sichtbarkeit der Vorgänge („own“ / „org“)

Einstellung je Organisation (`envelopeVisibility`, Standard `own`):

- **own:** Mitglieder sehen nur Vorgänge, die sie selbst angelegt haben.
- **org:** Mitglieder sehen alle Vorgänge der Organisation, ändern aber nur eigene.

Inhaber, Administratoren und Leser sehen immer alle Vorgänge der Organisation. API-Schlüssel sehen alle Vorgänge ihrer Organisation und ihres Modus (live oder test).

Fremde oder nicht sichtbare Vorgänge beantwortet Paraph mit „nicht gefunden“ (HTTP 404), nicht mit „keine Berechtigung“. So lässt sich nicht erkennen, ob ein Vorgang existiert.

## Organisationen (Instanz-Administrator)

Das bei der Ersteinrichtung angelegte Konto ist **Instanz-Administrator**. Nur diese Person kann

- weitere Organisationen anlegen (Einstellungen → Organisation → „Weitere Organisation anlegen“); sie wird dort Inhaber,
- die Systemübersicht sehen (Einstellungen → System): Version, Speicherart, Herkunft des Hauptschlüssels, eingerichtete Dienste, letzte Sicherung, fehlgeschlagene Aufträge und E-Mails.

Organisationen sind strikt getrennt. Jede hat eigene Vorgänge, Vorlagen, Kontakte, API-Schlüssel, Webhooks, Einstellungen und ein eigenes Aktivitätsprotokoll. Eine Person kann mehreren Organisationen angehören und in der Oberfläche wechseln.

## Branding

Je Organisation (Einstellungen → Erscheinungsbild und E-Mails):

- Akzentfarbe
- Logo (Upload; erscheint auf der Signaturseite und in E-Mails)
- Absendername, Antwortadresse (`Reply-To`), Absenderadresse
- Fußzeile der E-Mails

Die Absenderadresse muss zu Ihrem SMTP-Konto und Ihren SPF/DKIM-Einträgen passen, sonst landen E-Mails im Spam.

## E-Mail-Texte

Betreff und Text lassen sich für drei E-Mails anpassen: Signaturanfrage (`signing_request`), Erinnerung (`reminder`) und Abschluss (`completed`). Platzhalter:

| Platzhalter | Inhalt |
|---|---|
| `{{sender}}` | Name der absendenden Person und Organisation |
| `{{title}}` | Titel des Vorgangs |
| `{{recipient}}` | Name der empfangenden Person |
| `{{message}}` | Nachricht des Absenders (nur Signaturanfrage) |
| `{{expires}}` | Ablaufdatum (Signaturanfrage, Erinnerung) |

Der persönliche Link wird immer von Paraph eingefügt. Übrige E-Mails (Ablehnung, Widerruf, Ablauf, Einmalcodes, Einladung, Passwort) verwenden feste Texte.

## Aufbewahrung und Löschung

Einstellung „Aufbewahrung“ je Organisation (`retentionDays`): keine automatische Löschung (Standard) oder 30 bis 36 500 Tage nach Ende des Vorgangs.

Ein Hintergrundauftrag läuft alle 12 Stunden. Für beendete Vorgänge (abgeschlossen, abgelehnt, widerrufen, abgelaufen), deren Ende länger als die Frist zurückliegt, löscht er:

- Original- und PDF-Dateien, finales PDF, Abschlussbestätigung, Nachweispaket,
- Unterschriftsbilder und Anhänge der Beteiligten,
- alle Feldwerte.

Erhalten bleiben: der Datensatz des Vorgangs (Titel, Beteiligte mit Name und E-Mail, Zeitpunkte, Hashes) und der vollständige Audit-Trail. Die Löschung selbst wird als Ereignis `envelope.content_purged` im Audit-Trail vermerkt. Dateien, die noch von einer Vorlage oder einem anderen Vorgang genutzt werden, bleiben.

Unabhängig davon räumt Paraph auf: E-Mail-Datensätze nach 90 Tagen, Webhook-Zustellungen nach 30 Tagen, abgelaufene Sitzungen und Codes laufend.

Prüfen Sie die Frist anhand Ihrer gesetzlichen Aufbewahrungspflichten (z. B. § 50 BRAO für Handakten). Gelöschte Inhalte lassen sich nur aus einer älteren Sicherung zurückholen.

## Anmeldung und Zwei-Faktor

- Passwörter: mindestens 10 Zeichen, einfache Muster werden abgelehnt; Speicherung als Argon2id-Hash.
- Nach 5 Fehlversuchen ist das Konto 15 Minuten gesperrt.
- Sitzungen enden nach 12 Stunden Inaktivität, spätestens nach 14 Tagen. Unter „Profil und Sicherheit“ lassen sich alle anderen Sitzungen beenden. Ein Passwortwechsel beendet alle anderen Sitzungen.
- **Zwei-Faktor (TOTP):** Einschalten unter „Profil und Sicherheit“ mit einer Authenticator-App (6 Ziffern, 30 Sekunden). Ein Code ist nur einmal verwendbar. Nach 5 falschen Codes wird die Anmeldung verworfen. Abschalten erfordert das Passwort.

Paraph kann Zwei-Faktor nicht organisationsweit erzwingen. Jede Person schaltet es selbst ein.

## Anmeldung per OIDC (authentik)

Paraph unterstützt eine OIDC-Anmeldung, z. B. über authentik. Einrichtung Schritt für Schritt, alle Variablen und das genaue Verhalten stehen in [Kapitel 3](03-konfiguration.md#anmeldung-per-oidc-z-b-authentik).

Kurz:

- Bestehende Konten werden beim ersten SSO-Login nur verknüpft, wenn der Anbieter die E-Mail-Adresse als bestätigt meldet. Bei authentik dafür ein eigenes Scope-Mapping anlegen.
- Personen ohne Konto werden abgewiesen, außer `OIDC_AUTO_CREATE_USERS=true`. Mit `OIDC_DEFAULT_ROLE=member` (oder `viewer`) treten neue Konten automatisch der ältesten Organisation bei, sonst per Einladung.
- Gesperrte Konten können sich auch per SSO nicht anmelden.
- Paraph fragt einen eigenen TOTP-Code auch nach SSO ab, wenn die Person ihn aktiviert hat. Mehrfaktor im Anbieter bleibt die Empfehlung.

## Notfallzugang

Für Fälle ohne funktionierende E-Mail oder ohne Zugang zum Konto gibt es zwei Befehle im Container:

```sh
# Link zum Zurücksetzen des Passworts, 60 Minuten gültig
docker compose exec paraph paraph reset-link person@kanzlei.example

# Einrichtungscode anzeigen (nur solange noch kein Konto existiert)
docker compose exec paraph paraph setup-code
```

Der Rücksetzlink beendet nach Benutzung alle Sitzungen der Person und hebt eine Sperre wegen Fehlversuchen auf. Zwei-Faktor bleibt eingeschaltet. Wer Zugriff auf den Container hat, kann damit jedes Konto übernehmen; schützen Sie den Server-Zugang entsprechend.

Weitere Befehle: `paraph health`, `paraph backup`, `paraph verify-backup`, `paraph restore`, `paraph verify-audit` (prüft die Audit-Ketten aller Vorgänge).

## Siegelzertifikat

Unter „Siegel und Signaturstufen“ zeigt Paraph das verwendete Plattformsiegel. Standard ist ein beim ersten Start erzeugtes, selbst signiertes Instanzzertifikat (RSA 3072). Eine Organisation kann ein eigenes Zertifikat importieren (privater Schlüssel und Zertifikatskette als PEM, RSA). Paraph prüft beim Import, dass Schlüssel und Zertifikat zusammenpassen.

## Aktivitätsprotokoll

Unter **Aktivität** sehen Inhaber und Administratoren die letzten 200 Verwaltungsereignisse der Organisation (z. B. Einladungen, Beitritte, Rollenänderungen, entfernte Mitglieder, angelegte und widerrufene API-Schlüssel, Webhooks) und die letzten 200 Audit-Ereignisse aus Vorgängen (ohne Testmodus). Gespeichert werden Zeitpunkt, handelnde Person oder API-Schlüssel, Aktion, Ziel und gegebenenfalls IP-Adresse.

Anmeldungen, Fehlversuche, Passwort- und Zwei-Faktor-Änderungen protokolliert Paraph ebenfalls, aber ohne Zuordnung zu einer Organisation. Sie erscheinen deshalb derzeit nicht in dieser Ansicht.

Das Aktivitätsprotokoll ist vom Audit-Trail der Vorgänge getrennt. Der Audit-Trail (je Vorgang, als Hash-Kette) ist der Nachweis gegenüber Dritten; das Aktivitätsprotokoll dient der Verwaltung.
