# 1. Überblick und Konzepte

Dieses Kapitel erklärt die Begriffe, mit denen Paraph arbeitet. Grundlage ist der Stand des Codes vom 22.10.2026.

## Vorgang

Ein **Vorgang** bündelt Dokumente, Beteiligte und Felder. Er durchläuft diese Zustände:

| Status | Bedeutung |
|---|---|
| `draft` | Entwurf. Dokumente, Beteiligte und Felder sind änderbar. |
| `sent` | Versendet. Inhalte sind gesperrt; Beteiligte arbeiten ihre Schritte ab. |
| `completed` | Alle haben unterschrieben, freigegeben oder ausgefüllt. Ergebnis ist versiegelt. |
| `declined` | Eine Person hat abgelehnt. Der Vorgang ist beendet. |
| `voided` | Vom Absender widerrufen. Alle Links sind ungültig. |
| `expired` | Ablaufdatum überschritten. |

Nach dem Versand lässt sich ein Vorgang nicht mehr ändern. Ein Entwurf kann gelöscht werden; versendete Vorgänge nicht.

## Dokument und maßgebliche Fassung

Je Vorgang sind bis zu 20 Dokumente möglich. Word-, DOC-, ODT- und RTF-Dateien wandelt Paraph über den Gotenberg-Container in PDF um. Beim Hochladen wird jedes PDF geprüft und bereinigt (aktive Inhalte entfernt, Formularfelder in den Seiteninhalt übernommen; siehe [Kapitel 7](07-sicherheit.md)). Verschlüsselte PDFs werden abgelehnt.

Paraph speichert zwei Fassungen:

- die **Originaldatei** mit ihrem SHA-256-Hash (`source_sha256`),
- die **maßgebliche Fassung** als bereinigtes PDF mit eigenem SHA-256-Hash (`sha256`).

Unterzeichnet wird immer die maßgebliche Fassung. Ihr Hash steht beim Versand im Audit-Trail. Die Signaturseite zeigt genau diese Bytes. Beim Abschluss übermittelt der Browser die Hashes der angezeigten Dokumente; weichen sie von der maßgeblichen Fassung ab, lehnt der Server den Abschluss ab.

Grenzen: höchstens `MAX_PAGES` Seiten (Standard 500) und `MAX_UPLOAD_MB` je Datei (Standard 25).

## Beteiligte und Rollen

Bis zu 30 Beteiligte je Vorgang. Jede Person hat eine Art (`kind`):

| Art | Aufgabe | Felder |
|---|---|---|
| `signer` | unterschreibt | braucht mindestens ein Unterschriftsfeld |
| `approver` | gibt frei | kann Felder haben, muss nicht |
| `filler` | füllt Angaben aus | braucht mindestens ein Feld; keine Unterschrifts- oder Paraphenfelder |
| `viewer` | liest mit | keine Felder; erhält keinen eigenen Arbeitsschritt |
| `witness` | unterschreibt als Zeuge für eine andere Person (`witness_for`) | braucht ein Unterschriftsfeld |

Vor dem Abschluss bestätigt jede handelnde Person einen festen Erklärungstext (`src/shared/consent.ts`). Der Text ist versioniert; Version und Hash werden protokolliert.

### Zugangsschutz je Person

| Methode | Ablauf |
|---|---|
| `none` | Der persönliche Link genügt. |
| `email_otp` | Sechsstelliger Einmalcode per E-Mail, 10 Minuten gültig. |
| `sms_otp` | Sechsstelliger Einmalcode per SMS. Erfordert `SMS_GATEWAY_URL` und eine Mobilnummer. |
| `access_code` | Zugangscode (mindestens 6 Zeichen), den der Absender auf anderem Weg mitteilt. Gespeichert wird nur ein Argon2id-Hash. |

Nach 5 falschen Codes in 15 Minuten sperrt Paraph die Prüfung für diese Person für 15 Minuten. Fehlversuche und Sperre stehen im Audit-Trail.

## Reihenfolge

- **parallel:** Alle handelnden Personen erhalten den Link sofort.
- **sequential:** Paraph aktiviert die Personen nach `routing_order`. Personen mit gleicher Nummer sind gleichzeitig dran. Die nächste Gruppe erhält ihren Link erst, wenn die vorherige fertig ist.

## Felder

Felder werden auf der Seite in normierten Koordinaten (0 bis 1, Ursprung oben links, bezogen auf die sichtbare Seite nach Drehung und CropBox) gespeichert. Typen nach `src/shared/model.ts`:

| Typ | Zweck |
|---|---|
| `signature` | Unterschrift (gezeichnet, getippt oder als Bild hochgeladen) |
| `initials` | Paraphe |
| `name` | Name, Text mit Prüfmustern |
| `email` | E-Mail-Adresse, Formatprüfung |
| `text` | freier Text, Prüfmuster möglich |
| `number` | Zahl, optional mit Mindest- und Höchstwert |
| `date` | Datum (Anzeige `DD.MM.YYYY`, `YYYY-MM-DD` oder `MM/DD/YYYY`) |
| `signed_date` | Datum der Unterzeichnung |
| `checkbox` | Kontrollkästchen |
| `select` | Auswahl aus festen Optionen |
| `formula` | berechneter Wert |
| `attachment` | Datei-Anhang der unterzeichnenden Person |

Weitere Einstellungen je Feld: Pflichtfeld, Beschriftung, Platzhalter, Vorbelegung (`prefill`), schreibgeschützt (`readonly`), Schriftgröße (5 bis 36 pt).

### Bedingungen

Ein Feld kann von einem anderen Feld abhängen. Operatoren: `checked`, `unchecked`, `equals`, `not_equals`, `filled`, `empty`. Bedingungen dürfen sich verketten; ein Feld ist nur aktiv, wenn auch das steuernde Feld aktiv ist. Inaktive Felder sind nicht auszufüllen. Browser und Server werten die Logik mit demselben Code aus (`src/shared/fieldlogic.ts`); maßgeblich ist der Server.

### Formeln

Formelfelder rechnen mit anderen Feldern (`src/shared/formula.ts`). Paraph nutzt dafür einen eigenen Parser, kein `eval`.

- Feldbezug: `{feldschluessel}`
- Rechenzeichen: `+ - * /` und Klammern; Division durch 0 ergibt 0
- Vergleiche: `> < >= <= == !=` (Ergebnis 1 oder 0)
- Funktionen: `sum(...)`, `min(...)`, `max(...)`, `abs(x)`, `round(x, n)`, `if(bedingung, a, b)`
- Zahlen im deutschen Format (`1.234,56`) werden erkannt; leere Felder zählen als 0
- Höchstens 500 Zeichen, Verschachtelungstiefe 50; Formeln dürfen auf andere Formeln verweisen (bis zu fünf Ebenen)
- Nachkommastellen je Feld: 0 bis 6 (Standard 2)

Beispiel: `round({stunden} * {satz} * 1.19, 2)`

### Prüfmuster

Für Text- und Namensfelder: `email`, `iban` (mit Prüfziffer; deutsche IBAN genau 22 Zeichen), `plz` (fünf Ziffern), `phone`, `number`, `integer`, `regex`. Eigene reguläre Ausdrücke werden abgelehnt, wenn sie länger als 200 Zeichen sind, verschachtelte Wiederholungen oder Rückverweise enthalten (Schutz vor Rechenzeit-Angriffen). Zusätzlich: Mindest- und Höchstlänge, eigene Fehlermeldung.

### Feldvorschläge

Paraph kann Felder vorschlagen (`src/server/domain/autodetect.ts`). Die Erkennung arbeitet regelbasiert auf Textpositionen (Unterstrichlinien, typische Beschriftungen, Kästchen), ohne KI. Vorschläge sind zu prüfen.

## Vorlagen und Versionen

Eine Vorlage enthält Dokumente, **Rollen** statt konkreter Personen, Felder und Standardeinstellungen. Bearbeitet wird ein Entwurf. **Veröffentlichen** erzeugt eine neue, nummerierte Version. Versionen sind unveränderlich; ein Datenbank-Trigger weist jede Änderung ab. Vorgänge merken sich die Version, aus der sie entstanden sind. Spätere Änderungen an der Vorlage wirken nicht auf bestehende Vorgänge.

Beim Verwenden einer Vorlage gibt man Name und E-Mail je Rolle an (oder nutzt in der Rolle hinterlegte Standardwerte) und kann Felder vorbelegen. Vorbelegte Felder sind standardmäßig schreibgeschützt. Titel und Nachricht dürfen Platzhalter enthalten, z. B. `{{Mandant.name}}` oder `{{Mandant.email}}`.

Vorlagen sind privat oder für die Organisation sichtbar. Scheidet ein Mitglied aus, gehen seine privaten Vorlagen an die Organisation über.

## Massenversand (CSV/XLSX)

Aus einer veröffentlichten Vorlage lassen sich viele Vorgänge auf einmal erzeugen.

1. Spaltenvorlage herunterladen (`massenversand-vorlage.csv`). Spalten: `<rolle>.name`, `<rolle>.email` für jede Rolle ohne festen Empfänger, dazu Feldschlüssel zum Vorbelegen.
2. Datei als CSV (Trennzeichen wird erkannt) oder XLSX hochladen.
3. Paraph prüft zuerst im Probelauf (`dry_run`, Standard) und meldet Fehler je Zeile.
4. Erst der zweite Aufruf ohne Probelauf versendet.

Höchstens 500 Zeilen je Durchgang. Jede Zeile wird ein eigener Vorgang.

## Öffentliche Formulare

Ein öffentliches Formular macht eine Vorlage unter `/f/<slug>` für jedermann zugänglich, z. B. für Vollmachten oder Einwilligungen.

- Die Vorlage braucht genau eine Rolle „im öffentlichen Formular ausfüllen“. Alle anderen Rollen brauchen feste Namen und E-Mail-Adressen (z. B. die Kanzlei, die gegenzeichnet).
- Die besuchende Person gibt Namen und E-Mail an. Standardmäßig bestätigt sie die Adresse mit einem Einmalcode (`require_otp`).
- Optional lässt sich die Zahl der Einreichungen begrenzen.

## Vor-Ort-Signatur

Ist die unterzeichnende Person in der Kanzlei, startet ein angemeldetes Mitglied über den Vorgang eine **Vor-Ort-Sitzung** am eigenen Bildschirm. Die Sitzung gilt als authentifiziert durch die gastgebende Person; deren Benutzerkennung steht im Audit-Trail. Diese Funktion ist nur in der Oberfläche verfügbar, nicht per API-Schlüssel.

## Vertretung

Erlaubt der Absender Vertretung (`allow_delegation`), kann eine Person den Vorgang an jemand anderen weitergeben: Name, E-Mail, optional Grund. Die ursprüngliche Person erhält den Status `delegated`, ihr Link wird ungültig. Die Vertretung übernimmt Art, Reihenfolge und Felder. War SMS-Code oder Zugangscode verlangt, gilt für die Vertretung der E-Mail-Code.

## Erinnerungen

- **automatisch:** alle `reminder_days` Tage (Standard aus den Organisationseinstellungen: 3; 0 schaltet ab)
- **manuell:** über den Vorgang

Jede Erinnerung erzeugt einen **neuen Link**. Der unmittelbar vorherige Link bleibt gültig, damit die vorige E-Mail weiter funktioniert; alle älteren Links verfallen. Je Person sind also höchstens zwei Links gültig.

„Link selbst weitergeben“ im Vorgang stellt einen neuen Link aus, den Sie auf anderem Weg übergeben. Alle bisherigen Links werden ungültig, bereits geöffnete Sitzungen dieser Person enden.

## Ablauf

Jeder Vorgang hat ein Ablaufdatum (Standard: 30 Tage, einstellbar je Organisation und Vorgang, 1 bis 365 Tage). Ein Hintergrundauftrag prüft alle fünf Minuten. Abgelaufene Vorgänge erhalten den Status `expired`; offene Sitzungen werden beendet.

## Widerruf

Der Absender kann einen laufenden Vorgang mit Begründung widerrufen. Alle Links und offenen Sitzungen werden sofort ungültig. Personen, die bereits benachrichtigt waren, erhalten eine E-Mail.

## Ablehnung

Jede handelnde Person kann mit Begründung ablehnen. Der gesamte Vorgang endet dann mit Status `declined`. Absender und übrige Beteiligte werden benachrichtigt. Danach ist kein Abschluss mehr möglich.

## Abschluss und Ergebnis

Wenn die letzte Person fertig ist, erzeugt Paraph:

- das **finale PDF** mit eingesetzten Feldwerten und Unterschriften, versiegelt mit dem Plattformsiegel (PAdES, `ETSI.CAdES.detached`),
- die **Abschlussbestätigung** (Zertifikat) mit Beteiligten, Zeitpunkten und Hashes; je nach Einstellung an das finale PDF angehängt,
- den **Audit-Trail** als Hash-Kette,
- ein **Nachweispaket** (ZIP) mit allem zusammen, einschließlich der bisherigen externen Verankerungen des Vorgangs (`08_verankerung.json`) und eines Prüfskripts (`pruefen/verify-audit.py`).

Vor dem Einbrennen prüft Paraph, dass Dokumentfassung, Feldwerte und Unterschriftsbilder genau dem Stand entsprechen, den jede Person unterschrieben hat. Bei einer Abweichung bricht der Abschluss ab ([Kapitel 7](07-sicherheit.md#integritätsprüfung-beim-abschluss)).

Die Abschluss-E-Mail an die Beteiligten nennt den SHA-256-Prüfwert des unterschriebenen Dokuments.

Die Hashes stehen in einem Register. Unter `/verify` (Prüfstelle) kann jeder prüfen, ob eine Datei von dieser Instanz stammt und unverändert ist. Die Datei verlässt dabei den Browser nicht; nur ihr Hash wird abgefragt. Je Vorgang erscheint ein Treffer. Auf Wunsch prüft die Prüfstelle zusätzlich die eingebetteten Siegel; dafür wird die Datei an den Server übertragen, nur im Arbeitsspeicher geprüft und nicht gespeichert. Sie nennt je Siegel ein Gesamturteil:

| Urteil | Bedeutung |
|---|---|
| gültig | Siegel dieser Instanz gültig, Datei seit dem Siegel unverändert |
| fremd | Signatur rechnerisch korrekt, aber nicht von dieser Instanz |
| verändert | Nach dem Siegel wurden Daten angehängt oder geändert |
| Zeitstempel ungültig | Siegel gültig, eingebetteter Zeitstempel jedoch ungültig |
| ungültig | Siegel ungültig |

## Testmodus

Vorgänge im Testmodus sind von echten Daten getrennt, versenden keine E-Mails und tragen ein Wasserzeichen. Siehe [Kapitel 5](05-api.md#testmodus).
