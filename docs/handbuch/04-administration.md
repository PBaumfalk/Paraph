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
- Entfernte Mitglieder verlieren sofort ihre Sitzungen in dieser Organisation. Ihre privaten Vorlagen werden für die Organisation sichtbar. Die von ihnen angelegten API-Schlüssel werden widerrufen.
- API-Schlüssel einer Person, die gesperrt oder nicht mehr Mitglied ist, wirken nicht mehr (HTTP 401).
- Einladungen gelten 7 Tage und werden per E-Mail versendet. Ohne SMTP zeigt die Oberfläche den Einladungslink an.

### Sichtbarkeit der Vorgänge („own“ / „org“)

Einstellung je Organisation (`envelopeVisibility`, Standard `own`):

- **own:** Mitglieder sehen nur Vorgänge, die sie selbst angelegt haben.
- **org:** Mitglieder sehen alle Vorgänge der Organisation, ändern aber nur eigene.

Inhaber, Administratoren und Leser sehen immer alle Vorgänge der Organisation. API-Schlüssel sehen alle Vorgänge ihrer Organisation und ihres Modus (live oder test).

Fremde oder nicht sichtbare Vorgänge beantwortet Paraph mit „nicht gefunden“ (HTTP 404), nicht mit „keine Berechtigung“. So lässt sich nicht erkennen, ob ein Vorgang existiert.

## Organisationen (Instanz-Administrator)

Das bei der Ersteinrichtung angelegte Konto ist **Instanz-Administrator**. Weitere Instanz-Administratoren lassen sich unter Einstellungen → System → „Benutzerkonten der Instanz“ ernennen. Nur Instanz-Administratoren können

- weitere Organisationen anlegen (Einstellungen → Organisation → „Weitere Organisation anlegen“); die Person wird dort Inhaber,
- Einstellungen → System öffnen (siehe unten).

Organisationen sind strikt getrennt. Jede hat eigene Vorgänge, Vorlagen, Kontakte, API-Schlüssel, Webhooks, Einstellungen und ein eigenes Aktivitätsprotokoll. Eine Person kann mehreren Organisationen angehören und in der Oberfläche wechseln.

## System (Instanz-Administrator)

Einstellungen → System bündelt den Betrieb (`src/web/pages/settings/Settings.tsx`, Schnittstellen unter `/api/v1/system` und `/api/v1/admin/users`).

### Betriebszustand

Beim Öffnen läuft eine **Schnellprüfung**. Sie zeigt je Bereich (Instanz, Schlüssel, Speicher, Sicherung, Hintergrund, E-Mail, Nachweis, Anmeldung, Dienste) einen Status: in Ordnung, Hinweis, Fehler oder Information. Geprüft werden unter anderem HTTPS in `APP_URL`, `TRUST_PROXY`, `DEV_MODE`, fehlende Datenschutzhinweise je Organisation, Herkunft und Dateirechte des Hauptschlüssels, Laufzeit des Siegelzertifikats, freier Speicher, Alter der letzten Sicherung, Wiederherstellungs-Passphrase, fehlgeschlagene und überfällige Aufgaben, nicht zugestellte E-Mails der letzten 7 Tage, Zeitstempeldienst und Verankerung.

**Tiefenprüfung** (Schaltfläche, höchstens 6 je Minute) kontaktiert zusätzlich Mailserver (Verbindung und Anmeldung, ohne Versand), Zeitstempeldienst (Probestempel mit Prüfung und Uhrabweichung), OIDC-Anbieter (Discovery), Dateiablage bzw. S3 (schreiben, lesen, löschen) und Gotenberg. Sie prüft die Integrität der Datenbank, alle Audit-Ketten und deren Abgleich mit der Verankerung. Das SMS-Gateway wird nicht geprüft, weil ein Testversand Kosten verursacht.

Dieselben Prüfungen auf der Kommandozeile:

```sh
docker compose exec paraph paraph doctor --quick   # Schnellprüfung
docker compose exec paraph paraph doctor           # Tiefenprüfung
```

`paraph doctor` endet mit Exit-Code 1, wenn mindestens eine Prüfung „Fehler“ meldet.

### Test-E-Mail

„Test-E-Mail senden“ verschickt sofort, ohne Warteschlange, eine Test-E-Mail an die eigene oder eine eingegebene Adresse (höchstens 5 je Minute). Angezeigt wird die Antwort des Mailservers oder eine verständliche Fehlermeldung. Der Versuch steht im Aktivitätsprotokoll.

### Sicherung

Zeigt letzte Sicherung, Abstand, Anzahl der aufbewahrten Sicherungen und ob die Sicherungen den Hauptschlüssel enthalten. „Jetzt sichern“ reiht eine Sicherung als Hintergrundaufgabe ein. Siehe [Kapitel 6](06-sicherung.md).

### Hintergrundaufgaben und E-Mails

Listet endgültig fehlgeschlagene Aufgaben (bis zu 20) mit Fehlermeldung und nicht zugestellte E-Mails (bis zu 20). „Erneut versuchen“ setzt eine fehlgeschlagene Aufgabe zurück in die Warteschlange. Darunter: wartende, in Wiederholung befindliche und überfällige Aufgaben.

**Alarm per E-Mail:** Scheitert eine Hintergrundaufgabe endgültig (nach 8 Versuchen), erhalten alle aktiven Instanz-Administratoren eine E-Mail mit Aufgabe und Fehler. Höchstens eine E-Mail je Aufgabentyp in 24 Stunden. Der E-Mail-Versand selbst löst keinen Alarm aus; nicht zustellbare E-Mails erscheinen im Vorgang und in dieser Liste.

### Benutzerkonten der Instanz

Tabelle aller Konten mit Organisationen und Rollen, Anmeldeart (Passwort, SSO, 2FA) und letzter Anmeldung. Für andere Konten als das eigene:

| Aktion | Wirkung |
|---|---|
| Sperren / Entsperren | Gesperrte Konten werden sofort abgemeldet und können sich nicht anmelden, auch nicht per SSO. Ihre API-Schlüssel wirken nicht mehr. |
| 2FA zurücksetzen | Schaltet TOTP ab und beendet alle Sitzungen. Nur nach sicherer Prüfung der Identität. |
| Passwort-Link | Erzeugt einen Link zum Zurücksetzen, 60 Minuten gültig. Paraph versendet ihn nicht; Sie geben ihn auf sicherem Weg weiter. Nur für Konten mit Passwort. |
| Zum Admin / Admin entziehen | Vergibt oder entzieht die Instanz-Administration. Die letzte aktive Instanz-Administration lässt sich nicht entziehen. |

Das eigene Konto lässt sich hier weder sperren noch herabstufen. Jede Aktion steht im Aktivitätsprotokoll. Rollen innerhalb einer Organisation verwalten Sie unter „Team“.

### Metriken

Mit `METRICS_TOKEN` stellt Paraph Zählwerte unter `/metrics` im Prometheus-Format bereit. Siehe [Kapitel 3](03-konfiguration.md#monitoring).

## Datenschutzhinweise für Unterzeichner

Einstellungen → Organisation → „Datenschutzhinweise für Unterzeichner (Art. 13 DSGVO)“: eine `https://`-Adresse Ihrer Datenschutzhinweise. Die Signaturseite verlinkt sie neben der Erklärung („Hinweise zum Datenschutz“). Die Adresse wird beim Abschluss mit der Erklärung im Audit-Trail vermerkt. Den Inhalt der Hinweise stellt Paraph nicht bereit. Fehlt der Link, meldet die Betriebsdiagnose einen Hinweis.

## Branding

Je Organisation (Einstellungen → Erscheinungsbild und E-Mails):

- Akzentfarbe (Standard: Petrol `#0D5C63`; färbt Knöpfe und Markierungen auf der Signaturseite und in E-Mails). Steht noch der frühere Standard `#3D5AFE` gespeichert, gilt seit dem Redesign automatisch Petrol; eine selbst gewählte Farbe bleibt unverändert.
- Logo (Upload; erscheint auf der Signaturseite und in E-Mails)
- Absendername, Antwortadresse (`Reply-To`), Absenderadresse
- Fußzeile der E-Mails

Die Absenderadresse muss zu Ihrem SMTP-Konto und Ihren SPF/DKIM-Einträgen passen, sonst landen E-Mails im Spam.

## Zustellung im Vorgang

Im Vorgang steht bei jeder Person, an der Reihe ist, ob die letzte Einladung oder Erinnerung nicht zugestellt wurde („E-Mail nicht zugestellt“ mit Grund) oder gerade wiederholt wird. Bei einem endgültigen Fehler erhält die versendende Person zusätzlich eine E-Mail. Abhilfe: Adresse prüfen und erneut erinnern oder den Link selbst weitergeben.

## E-Mail-Texte

Betreff und Text lassen sich für drei E-Mails anpassen: Signaturanfrage (`signing_request`), Erinnerung (`reminder`) und Abschluss (`completed`). Platzhalter:

| Platzhalter | Inhalt |
|---|---|
| `{{sender}}` | Name der absendenden Person und Organisation |
| `{{title}}` | Titel des Vorgangs |
| `{{recipient}}` | Name der empfangenden Person |
| `{{message}}` | Nachricht des Absenders (nur Signaturanfrage) |
| `{{expires}}` | Ablaufdatum (Signaturanfrage, Erinnerung) |

Der persönliche Link wird immer von Paraph eingefügt. Die Abschluss-E-Mail nennt zusätzlich den SHA-256-Prüfwert des unterschriebenen Dokuments und die Adresse der Prüfstelle (`/verify`). Übrige E-Mails (Ablehnung, Widerruf, Ablauf, Einmalcodes, Einladung, Passwort, Zustellfehler, Systemalarm, Test-E-Mail) verwenden feste Texte.

## Aufbewahrung und Löschung

Einstellung „Aufbewahrung“ je Organisation (`retentionDays`): keine automatische Löschung (Standard) oder 30 bis 36 500 Tage nach Ende des Vorgangs.

Ein Hintergrundauftrag läuft alle 12 Stunden. Für beendete Vorgänge (abgeschlossen, abgelehnt, widerrufen, abgelaufen), deren Ende länger als die Frist zurückliegt, löscht er:

- Original- und PDF-Dateien, finales PDF, Abschlussbestätigung, Nachweispaket,
- Unterschriftsbilder und Anhänge der Beteiligten,
- alle Feldwerte.

Außerdem leert er den Textauszug der Dokumente, die Nachricht des Absenders, Ablehnungsgründe und Mobilnummern der Beteiligten und löscht die E-Mail-Datensätze des Vorgangs.

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

Ist noch ein Instanz-Administrator angemeldet, genügt Einstellungen → System → „Benutzerkonten der Instanz“ (Passwort-Link, 2FA zurücksetzen). Für Fälle ohne Zugang zur Oberfläche gibt es zwei Befehle im Container:

```sh
# Link zum Zurücksetzen des Passworts, 60 Minuten gültig
docker compose exec paraph paraph reset-link person@kanzlei.example

# Einrichtungscode anzeigen (nur solange noch kein Konto existiert)
docker compose exec paraph paraph setup-code
```

Der Rücksetzlink beendet nach Benutzung alle Sitzungen der Person und hebt eine Sperre wegen Fehlversuchen auf. Zwei-Faktor bleibt eingeschaltet. Wer Zugriff auf den Container hat, kann damit jedes Konto übernehmen; schützen Sie den Server-Zugang entsprechend.

Weitere Befehle (`src/server/cli.ts`):

| Befehl | Zweck |
|---|---|
| `paraph version` | Version und Datenbankschema |
| `paraph health` | Bereitschaft (Healthcheck) |
| `paraph doctor [--quick]` | Betriebsdiagnose wie unter Einstellungen → System |
| `paraph backup [--out DIR]` | Sicherung erstellen |
| `paraph verify-backup DATEI` | Sicherung vollständig prüfen |
| `paraph restore-key DATEI --out PFAD` | Hauptschlüssel aus einer Sicherung mit Passphrase schreiben |
| `paraph restore DATEI [--force]` | Sicherung wiederherstellen |
| `paraph verify-audit` | alle Audit-Ketten und ihre Verankerung prüfen; Exit-Code 2 bei Abweichungen |

## Siegelzertifikat

Unter „Siegel und Signaturstufen“ zeigt Paraph das verwendete Plattformsiegel. Standard ist ein beim ersten Start erzeugtes, selbst signiertes Instanzzertifikat (RSA 3072). Es ist ein technisches Integritätssiegel, kein qualifiziertes Siegel und keine persönliche Signatur der Unterzeichner. Die Betriebsdiagnose warnt, wenn das Zertifikat in weniger als 365 Tagen abläuft. Eine Organisation kann ein eigenes Zertifikat importieren (privater Schlüssel und Zertifikatskette als PEM, RSA). Paraph prüft beim Import, dass Schlüssel und Zertifikat zusammenpassen.

## Aktivitätsprotokoll

Unter **Aktivität** sehen Inhaber und Administratoren die letzten 200 Verwaltungsereignisse der Organisation (z. B. Einladungen, Beitritte, Rollenänderungen, entfernte Mitglieder, angelegte und widerrufene API-Schlüssel, Webhooks) und die letzten 200 Audit-Ereignisse aus Vorgängen (ohne Testmodus). Gespeichert werden Zeitpunkt, handelnde Person oder API-Schlüssel, Aktion, Ziel und gegebenenfalls IP-Adresse.

Anmeldungen, Fehlversuche, Passwort- und Zwei-Faktor-Änderungen protokolliert Paraph ebenfalls, aber ohne Zuordnung zu einer Organisation. Sie erscheinen deshalb derzeit nicht in dieser Ansicht.

Das Aktivitätsprotokoll ist vom Audit-Trail der Vorgänge getrennt. Der Audit-Trail (je Vorgang, als Hash-Kette) ist der Nachweis gegenüber Dritten; das Aktivitätsprotokoll dient der Verwaltung.
