# Funktionsliste

Jede Funktion von Paraph mit der nötigen Rolle oder Voraussetzung, der Stelle in der Oberfläche (oder im Code, wo es keine Oberfläche gibt) und dem Handbuchabschnitt, der sie erklärt. Stand: Version 0.2.0 mit den Änderungen aus dem [Änderungsprotokoll](../../CHANGELOG.md).

**Rollen:** „Inhaber“ und „Administration“ dürfen in ihrer Organisation alles. Ausnahmen, die nur Inhaber dürfen, sind markiert. „Mitglied“ legt Vorgänge und Vorlagen an und ändert nur eigene. „Nur lesen“ sieht und lädt herunter. **Instanz-Admin** ist ein Zusatzrecht für die ganze Installation; das erste Konto hat es. Einzelheiten: [Rollen und Rechte](08-kanzlei-team-erscheinungsbild.md#rollen-und-rechte). „Anlegen“ steht im Folgenden für die Rollen Inhaber, Administration und Mitglied.

**Markierungen:** *optional* = nur mit zusätzlicher Konfiguration · *Vorschau* = vorbereitet, nicht funktionsfähig

## Erste Schritte und Anmeldung

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Ersteinrichtung: Organisation und erstes Konto | Einrichtungscode, nur solange kein Konto existiert | `/setup` „Paraph einrichten“ | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#paraph-erstmals-einrichten), [Kap. 1](01-paraph-in-fuenf-minuten.md#ihr-erster-vorgang-schritt-für-schritt) |
| Anmelden mit Passwort, Zwei-Faktor-Code | Konto | `/login` | [Kap. 9](09-anmeldung-und-sso.md#sich-anmelden) |
| Passwort vergessen | Konto mit Passwort, Mailserver | `/login` „Passwort vergessen?“ | [Kap. 9](09-anmeldung-und-sso.md#ein-vergessenes-passwort-zurücksetzen) |
| Anmeldung per SSO (OIDC, z. B. authentik) | *optional*: `OIDC_*` | `/login` „Mit … anmelden“ | [Kap. 9](09-anmeldung-und-sso.md#anmeldung-per-sso-oidc-einrichten) |
| Einladung annehmen | Einladungslink | `/invite/…` | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#eine-person-einladen) |
| Seitenleiste, Suche und Befehlspalette (⌘K / Strg+K) | angemeldet | Seitenleiste „Suchen“ | [Kap. 1](01-paraph-in-fuenf-minuten.md#wo-sie-was-finden), [Kap. 3](03-vorgaenge-verfolgen.md#vorgänge-suchen) |
| Organisation wechseln | Mitglied mehrerer Organisationen | Organisationsname unten links | [Kap. 1](01-paraph-in-fuenf-minuten.md#wo-sie-was-finden) |
| Sprache Deutsch/English | alle | Menü unter dem eigenen Namen | [Kap. 1](01-paraph-in-fuenf-minuten.md#wo-sie-was-finden) |
| Name und Passwort ändern | alle | Einstellungen → Profil und Sicherheit | [Kap. 9](09-anmeldung-und-sso.md#das-passwort-ändern) |
| Zwei-Faktor-Anmeldung (TOTP) | alle | Einstellungen → Profil und Sicherheit | [Kap. 9](09-anmeldung-und-sso.md#die-zwei-faktor-anmeldung-einschalten) |
| Andere Geräte abmelden | alle | Einstellungen → Profil und Sicherheit „Sitzungen“ | [Kap. 9](09-anmeldung-und-sso.md#sitzungen-beenden) |

## Dokument vorbereiten und versenden

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Dokument hochladen (PDF; Word, ODT, RTF werden umgewandelt) | Anlegen; Umwandlung braucht den Dienst Gotenberg (in `docker-compose.yml` enthalten) | Übersicht „Dokument unterschreiben lassen“, „Neues Dokument“, Datei auf die Seite ziehen | [Kap. 2](02-dokument-unterschreiben-lassen.md#ein-dokument-hochladen) |
| Weitere Dokumente, Entwurf verwerfen, automatisches Speichern | Anlegen | Editor: „Dokument“, „Verwerfen“, „Gespeichert“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#den-editor-kennenlernen) |
| Beteiligte mit Rollen (Unterschreibt, Gibt frei, Füllt aus, Zeuge, Erhält Kopie) | Anlegen | Editor „Beteiligte“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#rollen) |
| Reihenfolge „Gleichzeitig“ / „Nacheinander“ | Anlegen | Editor „Beteiligte“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#reihenfolge) |
| Identitätsprüfung: Nur Link, Code per E-Mail, Zugangscode | Anlegen | Editor, zweites Auswahlfeld je Person | [Kap. 2](02-dokument-unterschreiben-lassen.md#identitätsprüfung) |
| Code per SMS | *optional*: `SMS_GATEWAY_*` | wie oben | [Kap. 2](02-dokument-unterschreiben-lassen.md#identitätsprüfung), [Kap. 12](12-konfiguration.md#sms) |
| Zwölf Feldtypen | Anlegen | Editor „Felder“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#die-zwölf-feldtypen) |
| Mehrfachauswahl, Duplizieren, Zuordnen, Rückgängig, Zoom | Anlegen | Editor, Tastenkürzel | [Kap. 2](02-dokument-unterschreiben-lassen.md#tastenkürzel-im-editor) |
| Erkannte Felder übernehmen (regelbasiert, ohne KI) | Anlegen; nur wenn Paraph Stellen erkennt | Editor „{n} erkannte Felder übernehmen“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#erkannte-felder-übernehmen) |
| Pflichtfeld, Vorbelegung, „Nicht änderbar“, auf allen Seiten wiederholen | Anlegen | Editor, Feldeigenschaften | [Kap. 2](02-dokument-unterschreiben-lassen.md#feldeigenschaften-einstellen) |
| Bedingte Felder | Anlegen | Feldeigenschaften „Bedingung und Feldname“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#felder-nur-unter-einer-bedingung-zeigen) |
| Berechnete Felder (Formeln) | Anlegen | Feldtyp „Berechnung“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#mit-formeln-rechnen) |
| Eingabeprüfung (PLZ, Telefon, Muster, Min/Max) | Anlegen | Feldeigenschaften | [Kap. 2](02-dokument-unterschreiben-lassen.md#eingaben-prüfen-lassen) |
| Formhinweise und Dokumentart (Schlüsselwörter, Bestätigung wird protokolliert) | Anlegen | Editor „Formhinweis“, Versanddialog „Dokumentart und Formvorschriften“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#dokumentart-und-formvorschriften), [Kap. 7](07-recht.md#den-formhinweis-katalog-kennen) |
| Versenden: Nachricht, Gültigkeit, Erinnerung, Vertretung | Anlegen | „Weiter zum Versand“ → „Versenden“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#versenden) |
| Einladung per E-Mail | Anlegen; Mailserver (`SMTP_URL`) | Versanddialog „Einladungen per E-Mail senden“, „Jetzt versenden“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#versenden) |
| Links selbst übergeben (ohne E-Mail) | Anlegen; ohne Mailserver vorgewählt | Versanddialog „Starten und Links anzeigen“ → „Persönliche Links“ | [Kap. 2](02-dokument-unterschreiben-lassen.md#links-selbst-übergeben) |

## Vorgänge verfolgen

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Übersicht mit Reitern Bei mir, Unterwegs, Entwürfe, Erledigt, Beendet | alle; Mitglieder je nach „Mitglieder sehen“ | „Übersicht“ | [Kap. 3](03-vorgaenge-verfolgen.md#die-übersicht-lesen) |
| Vorgangsseite: Beteiligte, Verlauf, Integrität | alle | Vorgang öffnen | [Kap. 3](03-vorgaenge-verfolgen.md#die-vorgangsseite-verstehen) |
| Erinnern | Anlegen | Vorgangsseite, Menü „…“ der Person | [Kap. 3](03-vorgaenge-verfolgen.md#eine-person-erinnern) |
| Neuen Link ausstellen | Anlegen | „Link selbst weitergeben“ | [Kap. 3](03-vorgaenge-verfolgen.md#einen-neuen-link-ausstellen) |
| Vor Ort unterschreiben (Kanzlei-Tablet) | Anlegen | Vorgangsseite „Vor Ort unterschreiben“ | [Kap. 4](04-vorlagen-serien-formulare.md#vor-ort-unterschreiben-lassen) |
| Vorgang widerrufen (Links werden sofort ungültig) | Anlegen | Vorgangsseite „Vorgang widerrufen“ | [Kap. 3](03-vorgaenge-verfolgen.md#einen-vorgang-widerrufen) |
| Ablauf und Ablehnung | automatisch | Status „Abgelaufen“, „Abgelehnt“ | [Kap. 3](03-vorgaenge-verfolgen.md#wenn-ein-vorgang-abläuft-oder-abgelehnt-wird) |
| Erneut verwenden (Kopie als Entwurf) | Anlegen | Vorgangsseite „Erneut verwenden“ | [Kap. 3](03-vorgaenge-verfolgen.md#einen-vorgang-erneut-verwenden) |
| Aktivität der Organisation | Inhaber, Administration | „Aktivität“ | [Kap. 3](03-vorgaenge-verfolgen.md#die-aktivität-ansehen) |
| Testvorgänge (Wasserzeichen „TEST“) | API-Schlüssel im Testmodus | Marke „TEST“ | [Kap. 3](03-vorgaenge-verfolgen.md#testvorgänge-erkennen) |

## Unterschreiben (Mandanten, ohne Konto)

| Funktion | Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Link öffnen, Zugang mit Code bestätigen | persönlicher Link | Signaturseite `/s/…` | [Kap. 5](05-so-unterschreiben-mandanten.md#die-einladung-öffnen), [Zugang](05-so-unterschreiben-mandanten.md#den-zugang-bestätigen) |
| Geführtes Ausfüllen, Anhang hochladen | – | „Los geht’s“, „Nächstes Feld“ | [Kap. 5](05-so-unterschreiben-mandanten.md#felder-ausfüllen) |
| Unterschrift zeichnen, tippen oder als Bild | – | Unterschriftsfeld | [Kap. 5](05-so-unterschreiben-mandanten.md#die-unterschrift-erstellen) |
| Abschließend bestätigen | – | „Ich stimme der obigen Erklärung zu.“, „Verbindlich unterschreiben“ | [Kap. 5](05-so-unterschreiben-mandanten.md#abschließend-bestätigen) |
| Ablehnen | – | Menü „…“ „Ablehnen“ | [Kap. 5](05-so-unterschreiben-mandanten.md#die-unterzeichnung-ablehnen) |
| An Vertretung weitergeben | beim Versand erlaubt | Menü „…“ „An Vertretung weitergeben“ | [Kap. 5](05-so-unterschreiben-mandanten.md#an-eine-vertretung-weitergeben) |
| Ergebnis herunterladen | nach Abschluss | „Unterschriebenes Dokument“, „Abschlussbestätigung“ | [Kap. 5](05-so-unterschreiben-mandanten.md#nach-dem-unterschreiben) |
| Eingebettete Signaturseite | *optional*: freigegebene Herkunft unter „Einbettung“ | `/embed/s/…` | [Kap. 10](10-anbindung-api-webhooks.md#die-signaturseite-einbetten) |

## Ergebnis und Prüfung

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Unterschriebenes PDF, Abschlussbestätigung, Nachweispaket (ZIP), Audit-Trail (JSON) | alle; Vorgang abgeschlossen | Vorgangsseite „Ergebnis“, „PDF herunterladen“ | [Kap. 3](03-vorgaenge-verfolgen.md#das-ergebnis-abholen), [Kap. 6](06-dokumente-pruefen.md#wissen-welche-dateien-es-gibt) |
| Plattformsiegel (PAdES) | immer | im PDF | [Kap. 14](14-sicherheit-und-nachweis.md#das-plattformsiegel-verstehen) |
| Zeitstempel (RFC 3161), z. B. FreeTSA | *optional*: `TSA_URL` und Vertrauensanker | im PDF | [Kap. 14](14-sicherheit-und-nachweis.md#zeitstempel-richtig-einrichten) |
| Externe Verankerung der Audit-Ketten | automatisch; mit Zeitstempeldienst extern wirksam | Hintergrundaufgabe | [Kap. 14](14-sicherheit-und-nachweis.md#audit-ketten-extern-verankern) |
| Prüfstelle: Datei prüfen, eingebettetes Siegel prüfen | öffentlich | `/verify` „Dokument prüfen“ | [Kap. 6](06-dokumente-pruefen.md#eine-datei-in-der-prüfstelle-prüfen) |
| Nachweispaket unabhängig prüfen (`verify-audit.py`) | Python 3 | im ZIP | [Kap. 6](06-dokumente-pruefen.md#das-nachweispaket-prüfen) |

## Vorlagen, Serien und Formulare

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Vorlage anlegen, bearbeiten, duplizieren, archivieren | Anlegen (Mitglied: eigene) | „Vorlagen“, Menü „…“ | [Kap. 4](04-vorlagen-serien-formulare.md#eine-vorlage-anlegen), [Ordnen](04-vorlagen-serien-formulare.md#vorlagen-ordnen) |
| Ordner anlegen und Vorlagen einsortieren | Anlegen; umbenennen und löschen nur per API | „Vorlagen“ „Ordner“ | [Kap. 4](04-vorlagen-serien-formulare.md#vorlagen-ordnen) |
| Rollen, feste Personen, Platzhalter, Einstellungen | Anlegen | Vorlagen-Editor, Reiter „Rollen“ und „Einstellungen“ | [Kap. 4](04-vorlagen-serien-formulare.md#rollen-und-felder-einrichten) |
| Veröffentlichen, Versionen | Anlegen | Vorlagen-Editor „Veröffentlichen“, „Versionen“ | [Kap. 4](04-vorlagen-serien-formulare.md#eine-vorlage-veröffentlichen) |
| Vorlage verwenden, Felder vorbelegen | Anlegen | „Verwenden“, Übersicht „Aus Vorlage“ | [Kap. 4](04-vorlagen-serien-formulare.md#eine-vorlage-verwenden) |
| Massenversand aus CSV oder Excel (bis 500 Zeilen) | Anlegen | Menü „…“ „Massenversand“ | [Kap. 4](04-vorlagen-serien-formulare.md#viele-vorgänge-auf-einmal-versenden) |
| Öffentliches Formular (z. B. für die Website) | Anlegen; Vorlage mit Formularrolle | „Formulare“, Besucher unter `/f/…` | [Kap. 4](04-vorlagen-serien-formulare.md#ein-öffentliches-formular-einrichten) |

## Kanzlei, Team und Einstellungen

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Organisation: Name, Zeitzone, Sprache, Standardwerte | Inhaber, Administration | Einstellungen → Organisation | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#die-organisation-einstellen) |
| Sichtbarkeit der Vorgänge für Mitglieder | Inhaber, Administration | Einstellungen → Organisation „Mitglieder sehen“ | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#sichtbarkeit-der-vorgänge-festlegen) |
| Datenschutzhinweis verlinken | Inhaber, Administration | Einstellungen → Organisation | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#den-datenschutzhinweis-verlinken) |
| Aufbewahrung (löscht Inhalte beendeter Vorgänge) | Inhaber, Administration | Einstellungen → Organisation | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#die-aufbewahrung-festlegen) |
| Eigene Domain für Signaturlinks | Inhaber, Administration; DNS und Proxy | Einstellungen → Organisation | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#eine-eigene-domain-für-signaturlinks-verwenden), [Kap. 11](11-installation.md#eine-eigene-domain-je-organisation-einrichten) |
| Weitere Organisation anlegen | Instanz-Admin | Einstellungen → Organisation | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#weitere-organisationen-anlegen) |
| Team einladen, Rolle ändern, entfernen | Inhaber, Administration; Inhaberrechte nur Inhaber | Einstellungen → Team | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#das-team-einladen-und-verwalten) |
| Logo, Akzentfarbe, Absender, E-Mail-Texte | Inhaber, Administration | Einstellungen → Erscheinungsbild und E-Mails | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#das-erscheinungsbild-anpassen) |
| Siegel und Signaturstufen ansehen, Zertifikat herunterladen | Inhaber, Administration | Einstellungen → Siegel und Signaturstufen | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#siegel-und-signaturstufen-einsehen) |
| Eigenes Siegelzertifikat verwenden | nur Inhaber | Einstellungen → Siegel und Signaturstufen | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#ein-eigenes-siegelzertifikat-verwenden) |
| Qualifizierte elektronische Signatur (QES) | *Vorschau*: Versand mit QES gesperrt | Einstellungen → Siegel und Signaturstufen | [Kap. 12](12-konfiguration.md#qes-anbieter-vorbereitet-nicht-funktionsfähig), [Kap. 17](17-grenzen.md#signaturstufen) |
| System: Diagnose, Tiefenprüfung, Test-E-Mail, Jetzt sichern, Hintergrundaufgaben | Instanz-Admin | Einstellungen → System | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#die-instanz-verwalten-system), [Kap. 15](15-diagnose-und-fehlersuche.md) |
| Benutzerkonten sperren, Zwei-Faktor zurücksetzen, Passwort-Link, Admin-Recht | Instanz-Admin | Einstellungen → System | [Kap. 8](08-kanzlei-team-erscheinungsbild.md#benutzerkonten-der-instanz-verwalten) |

## Anbindung

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| API-Schlüssel mit Berechtigungen, Live- und Testmodus | Inhaber, Administration | Einstellungen → API und Webhooks | [Kap. 10](10-anbindung-api-webhooks.md#einen-api-schlüssel-anlegen) |
| REST-API, Vorgang in einem Aufruf, Idempotency-Key | API-Schlüssel | `/api/v1/…` | [Kap. 10](10-anbindung-api-webhooks.md#einen-vorgang-in-einem-aufruf-anlegen-und-versenden) |
| API-Referenz und OpenAPI-Dokument | öffentlich | `/docs/api`, `/api/v1/openapi.json` | [Kap. 10](10-anbindung-api-webhooks.md#die-api-dokumentation-öffnen) |
| Links aus der Kanzleisoftware übergeben | API-Schlüssel | `notify: false`, `…/recipients/{rid}/link` | [Kap. 10](10-anbindung-api-webhooks.md#links-aus-der-kanzleisoftware-selbst-übergeben) |
| Webhooks mit Signatur und Wiederholung | Inhaber, Administration | Einstellungen → API und Webhooks | [Kap. 10](10-anbindung-api-webhooks.md#webhooks-empfangen) |
| Beispiele für n8n und Make | – | – | [Kap. 10](10-anbindung-api-webhooks.md#beispiele-für-n8n-und-make) |

## Betrieb

| Funktion | Rolle oder Voraussetzung | Fundstelle | Handbuch |
|---|---|---|---|
| Installation auf dem Server | root, Docker | `scripts/install.sh` | [Kap. 11](11-installation.md#mit-installsh-installieren) |
| Probebetrieb auf dem eigenen Rechner | Docker | `scripts/install.sh --probe` | [Kap. 18](18-installation-mit-claude-code.md#probebetrieb-auf-dem-eigenen-rechner) |
| Installation mit Claude Code | Claude-Code-Konto | fertige Aufträge | [Kap. 18](18-installation-mit-claude-code.md) |
| Konfiguration (alle Variablen und Secrets) | Betrieb | `.env`, `secrets/` | [Kap. 12](12-konfiguration.md) |
| Dateiablage in S3 | *optional*: `S3_*` | – | [Kap. 12](12-konfiguration.md#s3-speicher) |
| Automatische, verschlüsselte Sicherung | Betrieb; `BACKUP_INTERVAL_HOURS` | `backups/` | [Kap. 13](13-sicherung-und-updates.md#automatisch-sichern) |
| Sicherung von Hand, prüfen, wiederherstellen | Container-Zugriff, root | `paraph backup`, `paraph verify-backup`, `scripts/restore.sh` | [Kap. 13](13-sicherung-und-updates.md#von-hand-sichern) |
| Update mit Rückweg | root | `scripts/update.sh`, `--rollback` | [Kap. 13](13-sicherung-und-updates.md#paraph-aktualisieren) |
| Diagnose | Container-Zugriff | `paraph doctor`, Einstellungen → System | [Kap. 15](15-diagnose-und-fehlersuche.md) |
| Audit-Ketten prüfen | Container-Zugriff | `paraph verify-audit` | [Kap. 15](15-diagnose-und-fehlersuche.md) |
| Notfallzugang ohne Oberfläche | Container-Zugriff | `paraph setup-code`, `paraph reset-link` | [Kap. 9](09-anmeldung-und-sso.md#notfallzugang-ohne-oberfläche) |
| Bereitschaft und Metriken | `/metrics` nur mit `METRICS_TOKEN` | `/api/health/ready`, `/metrics` | [Kap. 15](15-diagnose-und-fehlersuche.md), [Kap. 12](12-konfiguration.md#monitoring) |
| Hintergrundaufgaben: Ablauf, Erinnerungen, Löschung, Verankerung, Sicherung | automatisch | Einstellungen → System „Hintergrundaufgaben und E-Mails“ | [Kap. 15](15-diagnose-und-fehlersuche.md) |

KI-Funktionen enthält Paraph nicht. Felderkennung und Formhinweise arbeiten mit festen Regeln.

---

[Inhalt](README.md) · [Glossar](glossar.md)
