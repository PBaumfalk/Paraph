# 7. Sicherheit

Dieses Kapitel beschreibt, wovor Paraph schützt, wie, und wo die Grenzen liegen. Alle Angaben beziehen sich auf den Code vom 22.10.2026.

## Bedrohungsmodell

### Schützenswerte Güter

| Gut | Warum |
|---|---|
| Dokumentinhalte (Verträge, Vollmachten, Mandantendaten) | Mandatsgeheimnis, DSGVO |
| Unterschriftsbilder und Feldwerte | Missbrauch, Identitätsdiebstahl |
| Integrität der unterzeichneten Fassung | Beweiswert |
| Audit-Trail | Nachweis, wer wann was getan hat |
| Signaturlinks und Sitzungen | Zugang zum Unterschreiben im Namen Dritter |
| Konten, API-Schlüssel, Webhook-Geheimnisse | Zugang zur gesamten Organisation |
| Hauptschlüssel, Siegelschlüssel | Entschlüsselung aller Daten, Fälschung von Siegeln |

### Angreifer

1. **Außenstehende im Internet** ohne Zugang: raten Links, greifen Anmeldung und Upload an, versuchen SSRF über Webhooks.
2. **Empfänger eines Signaturlinks**: versuchen fremde Felder zu setzen, Dokumente zu tauschen, Abläufe zu umgehen.
3. **Mitarbeitende einer anderen Organisation** auf derselben Instanz: versuchen fremde Vorgänge zu lesen.
4. **Mitglieder mit eingeschränkter Rolle**: versuchen Rechte auszuweiten.
5. **Dritte mit Zugriff auf eine weitergeleitete E-Mail**: nutzen einen alten Link.
6. **Schädliche Dateien**: PDFs mit Skripten, präparierte Office-Dateien.
7. **Wer Zugriff auf Sicherungen oder S3 erlangt**, aber nicht auf den Server.
8. **Wer Root-Zugriff auf den Server hat** (Administrator, Hoster, erfolgreicher Angreifer).

### Angriffswege und Gegenmaßnahmen

| Angriffsweg | Gegenmaßnahme |
|---|---|
| Link erraten | 256-Bit-Zufallstoken, gespeichert nur als Hash |
| Weitergeleitete E-Mail | Erinnerung und „neuer Link“ machen alte Links ungültig; optional Einmalcode oder Zugangscode |
| Passwort raten | Argon2id, Kontosperre nach 5 Fehlversuchen, Rate-Limit, Zwei-Faktor |
| Fremde Daten über die API abrufen | jede Abfrage an die Organisation gebunden, 404 statt 403 |
| CSRF aus fremder Website | CSRF-Token im Header, Origin-Prüfung, SameSite-Cookie |
| Fremde Felder setzen, Dokument tauschen | serverseitige Prüfung jedes Feldes; Abschluss nur mit passenden Dokument-Hashes |
| Doppelte oder parallele Abschlüsse | Abschlussschlüssel und Transaktion; genau ein Abschluss |
| Schädliches PDF | Bereinigung aktiver Inhalte, Neuschreiben |
| Schädliche Office-Datei | Umwandlung in isoliertem Container ohne Netz und ohne Datenzugriff |
| SSRF über Webhooks | Sperrliste, IP-Pinning, keine Weiterleitungen |
| Diebstahl von Sicherung oder S3-Bucket | Dateien AES-256-GCM-verschlüsselt, Schlüssel nicht in der Sicherung |
| Nachträgliche Änderung des Audit-Trails | Hash-Kette (Erkennung), Datenbank-Trigger (Verhinderung im Normalbetrieb), Siegel ab Abschluss |

### Restrisiken

- **Root auf dem Server** kann alles: Hauptschlüssel lesen, Datenbank direkt ändern, Trigger umgehen, laufende Prozesse beobachten. Paraph kann das nicht verhindern, nur teilweise erkennen (siehe unten).
- **Kompromittiertes E-Mail-Postfach** einer unterzeichnenden Person: Bei Zugang nur per Link (`none`) oder per E-Mail-Code kann der Angreifer unterschreiben. Abhilfe: SMS-Code oder Zugangscode auf einem zweiten Weg.
- **Kompromittierter Browser** der unterzeichnenden Person: nicht abwehrbar.
- **OIDC-Anbieter**: Wer dort eine E-Mail-Adresse eines Paraph-Kontos eintragen kann, kann sich als diese Person anmelden. Paraph prüft bei OIDC keinen eigenen zweiten Faktor.
- **Selbst signiertes Siegel**: Beweist nur die Herkunft von dieser Instanz, nicht die Identität eines Ausstellers gegenüber Dritten.
- **SMTP-Strecke**: E-Mails mit Links gehen über Ihren Mailanbieter. Transportverschlüsselung und Zustellung liegen dort.

## Technische Maßnahmen

### Passwörter und Codes

- Passwörter und Zugangscodes: **Argon2id** (19 MiB Speicher, 2 Durchläufe, Parallelität 1; OWASP-Empfehlung), Unicode-normalisiert (NFKC).
- Bei unbekannter E-Mail-Adresse rechnet Paraph trotzdem einen Hash, damit die Antwortzeit nichts verrät. „Passwort vergessen“ antwortet immer gleich.
- Sperre nach 5 Fehlversuchen für 15 Minuten.
- TOTP-Codes sind nur einmal verwendbar; nach 5 falschen Codes wird die Anmeldung verworfen. Das TOTP-Geheimnis ist verschlüsselt gespeichert.

### Sitzungen, CSRF, Origin

- Sitzungscookie `paraph_session`: `HttpOnly`, `SameSite=Lax`, `Secure` bei `https://`-`APP_URL`. In der Datenbank steht nur ein Hash des Tokens.
- Ablauf: 12 Stunden Inaktivität, höchstens 14 Tage. Passwortwechsel und Zurücksetzen beenden andere Sitzungen.
- Jede ändernde Anfrage (POST, PUT, PATCH, DELETE) mit Sitzung braucht den Header `x-csrf-token`, der zum Sitzungstoken passt (zeitkonstanter Vergleich). Zusätzlich wird ein vorhandener `Origin`-Header gegen `APP_URL` und die eigenen Domains der Organisationen geprüft.
- API-Schlüssel kommen nur per `Authorization`-Header und sind damit nicht für CSRF anfällig.

### Signaturlinks und Unterzeichner-Sitzungen

- Linktoken: 256 Bit aus dem Kryptozufall des Betriebssystems, base64url. Gespeichert wird nur `SHA-256("paraph-token:" + token)`. Dasselbe gilt für Einladungen, Passwort-Rücksetzung, Sitzungen und Einbettungslinks. API-Schlüssel enthalten ebenfalls 256 Bit Zufall und werden nur gehasht gespeichert.
- Beim Öffnen eines Links tauscht der Browser das Linktoken gegen eine **Unterzeichner-Sitzung** (8 Stunden). Diese Sitzung wird im Header `x-signer-session` gesendet, nicht als Cookie, und im `sessionStorage` des Tabs gehalten. Fremde Websites können sie deshalb nicht mitsenden.
- **Link-Rotation:** Jede Erinnerung und jeder „neue Link“ ersetzt den Token. Der alte Link ist sofort ungültig.
- Widerruf, Ablehnung, Vertretung und Ablauf entwerten Links und beenden offene Sitzungen.
- Einbettungslinks sind 10 Minuten gültig und nur einmal verwendbar.

### Einmalcodes und Zugangscodes

- E-Mail- und SMS-Code: 6 Ziffern, 10 Minuten gültig, gespeichert nur als Hash.
- Höchstens 5 Codes pro Stunde und Person; höchstens 5 Eingabeversuche je Code.
- Zugangscode: höchstens 5 Fehlversuche in 15 Minuten.
- Öffentliche Formulare: höchstens 3 offene Codes je Adresse, 5 Versuche je Code.
- Im Audit-Trail stehen E-Mail und Telefonnummer des Codeversands nur maskiert.

### Rate-Limits

- 600 Anfragen pro Minute und IP für alle `/api/`-Pfade.
- Anmeldung, Einrichtung, Passwort, Zwei-Faktor, Einladung: 10 pro Minute.
- Signaturseite: Öffnen 30, Code anfordern 10, Code prüfen 20, Abschluss 20, Ablehnung und Vertretung je 10 pro Minute.
- Öffentliche Formulare: Start 5, Bestätigung 10 pro Minute. Hash-Prüfung 30, Signaturprüfung 10 pro Minute.

Ohne `TRUST_PROXY` hinter einem Proxy teilen sich alle Nutzer die IP des Proxys und damit die Limits.

### Verschlüsselung gespeicherter Daten

- Jede Datei (Original, PDF, Unterschrift, Anhang, Ergebnis) wird vor dem Speichern mit **AES-256-GCM** verschlüsselt. Der Schlüssel je Datei wird per **HKDF-SHA256** aus dem Hauptschlüssel abgeleitet (Zweck `blob`, Salz = Datei-ID). Die Datei-ID ist zusätzlich als Associated Data gebunden; vertauschte Dateien schlagen bei der Entschlüsselung fehl.
- Geheimnisse in der Datenbank (TOTP, Webhook-Geheimnisse, privater Siegelschlüssel, E-Mail-Inhalte) verschlüsselt Paraph mit einem eigenen, ebenfalls per HKDF abgeleiteten Teilschlüssel.
- Nicht verschlüsselt in der Datenbank: Namen, E-Mail-Adressen, Titel, Feldwerte, Audit-Trail. Schützen Sie das Datenvolume entsprechend (Festplattenverschlüsselung des Servers).

### E-Mail-Ausgang

E-Mails werden in einer Warteschlange gespeichert. Text- und HTML-Inhalt (mit dem Link) liegen dort verschlüsselt. **Nach erfolgreichem Versand löscht Paraph den Inhalt**; es bleiben Empfänger, Betreff und Status. Fehlgeschlagene Sendungen werden bis zu 8-mal versucht. Die Datensätze werden nach 90 Tagen gelöscht.

### PDF-Bereinigung

Beim Hochladen (`src/server/pdf/inspect.ts`):

- verschlüsselte PDFs werden abgelehnt,
- entfernt werden `OpenAction` und `AA` (automatische Aktionen) im Dokument, auf Seiten und an Annotationen,
- entfernt werden `JavaScript` und `EmbeddedFiles` aus dem Namensverzeichnis,
- entfernt wird `XFA`,
- Link-Aktionen der Typen JavaScript, Launch, SubmitForm, ImportData, GoToR, GoToE und RichMediaExecute werden entfernt,
- vorhandene Formularfelder werden in den Seiteninhalt übernommen oder, wenn das scheitert, entfernt,
- bereits enthaltene digitale Signaturen werden durch die Verarbeitung ungültig; Paraph weist darauf hin.

Jede Bereinigung erscheint als Warnung am Dokument und im Audit-Trail.

Unterschriftsbilder werden als PNG dekodiert, auf Größe und Mindestdeckung geprüft und neu kodiert. Eingebettete Metadaten gehen dabei verloren.

### Office-Umwandlung isoliert

Word-, DOC-, ODT- und RTF-Dateien wandelt der Container `gotenberg` um. Er hängt nur im Docker-Netz `convert`, das als `internal` markiert ist: kein Internetzugang. Er hat keinen Zugriff auf das Paraph-Volume. JavaScript in Chromium ist abgeschaltet. Paraph prüft vorher die Dateisignatur passend zur Endung und nachher, dass ein PDF zurückkommt. Das Ergebnis durchläuft die PDF-Bereinigung.

### SSRF-Schutz mit IP-Pinning

Für Webhooks (`src/server/lib/ssrf.ts`): Nur `http(s)`, ohne Zugangsdaten in der URL, ohne Freigabe nur HTTPS. Der Hostname wird aufgelöst, jede Adresse gegen eine Sperrliste privater, lokaler und reservierter IPv4- und IPv6-Netze geprüft, und die Verbindung wird genau auf die geprüfte IP festgelegt. Ein zweites DNS-Lookup findet nicht statt; DNS-Rebinding greift damit nicht. Weiterleitungen werden nicht verfolgt. Zeitlimit 15 Sekunden.

### HTTP-Sicherheitsheader

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` (bei Einbettung die freigegebene Herkunft)
- `X-Frame-Options: DENY` (außer bei freigegebener Einbettung)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` bei HTTPS
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cache-Control: no-store` für die API und Downloads

### Container-Härtung

Siehe `Dockerfile` und `docker-compose.yml`:

- läuft als Benutzer `node` (UID 1000), nicht als root
- schreibgeschütztes Root-Dateisystem; schreibbar nur `/data`, `/backups`, `/tmp` (tmpfs)
- alle Linux-Capabilities entzogen, `no-new-privileges`
- Speicher- und Prozesslimit (1 GB, 256 Prozesse)
- npm, npx und corepack aus dem Laufzeit-Image entfernt
- Port nur an `127.0.0.1` gebunden
- Hauptschlüssel als Docker-Secret, nicht als Umgebungsvariable

### Datensparsame Logs

- Keine Query-Strings, keine Bodies im Zugriffslog.
- Token in Pfaden (`/s/`, `/embed/s/`, `/invite/`, `/reset/`, `/f/`) werden durch `…` ersetzt.
- `Authorization`, Cookies sowie Felder namens `password`, `token`, `code` werden aus Logeinträgen entfernt.
- Interne Fehler gehen mit Details ins Log, an den Client nur „Interner Fehler“.

Ausnahme: `DEV_MODE=true` schreibt ohne SMTP Links ins Log. Nie produktiv einschalten.

### Mandantentrennung

Jede Abfrage ist an die Organisation des Anfragenden gebunden. Vorgänge, Vorlagen, Dateien, Felder und Webhooks anderer Organisationen, anderer Modi (live/test) oder ohne Sichtbarkeit beantwortet Paraph mit **404**. So lässt sich die Existenz fremder Objekte nicht ermitteln. Unterzeichner können ausschließlich die Felder setzen, die ihnen zugeordnet sind; Feldwerte, Unterschriften und Anhänge werden serverseitig gegen Vorgang, Person und Status geprüft.

## Manipulationserkennung und Manipulationsverhinderung

Paraph unterscheidet beides bewusst.

### Erkennung

- **Hash-Kette des Audit-Trails:** Jeder Eintrag enthält den SHA-256 seines Vorgängers und wird über kanonisches JSON (Vorgang, Nummer, Zeit, Typ, Akteur, Daten, Vorgänger-Hash) gehasht. Wer einen Eintrag ändert, einfügt oder löscht, bricht die Kette ab dieser Stelle. Prüfen: `paraph verify-audit` oder in der Oberfläche am Vorgang.
- **Hashes der Dokumente:** Original, maßgebliche Fassung, finales PDF, Abschlussbestätigung, Audit-Export und Nachweispaket werden mit SHA-256 erfasst und in einem Register geführt. `/verify` vergleicht eine vorgelegte Datei mit dem Register.
- **Plattformsiegel ab Abschluss:** Das finale PDF trägt eine PAdES-Signatur der Instanz. Jede spätere Änderung am PDF macht die Signatur ungültig; das zeigt jeder PDF-Prüfer an. Die Abschlussbestätigung nennt Anzahl und Kopf (letzten Hash) der Audit-Kette und ist ebenfalls versiegelt. Vor dem Abschluss prüft Paraph die Kette; ist sie beschädigt, bricht der Abschluss ab. Mit `TSA_URL` kommt ein unabhängiger Zeitstempel hinzu.

Grenze der Erkennung: Wer Root-Zugriff hat, kann die gesamte Kette eines **noch laufenden** Vorgangs neu berechnen; die Kette bleibt dann in sich stimmig. Erst das Siegel und der externe Zeitstempel beim Abschluss legen den Stand so fest, dass eine spätere Neuberechnung auffällt, sofern eine Kopie des Ergebnisses außerhalb des Servers existiert (z. B. beim Empfänger).

### Verhinderung

- **Datenbank-Trigger** weisen `UPDATE` und `DELETE` auf Audit-Ereignissen, auf Ergebnissen und finalen Dokumenten sowie `UPDATE` auf Vorlagenversionen ab.
- Zustandsübergänge laufen nur serverseitig und in Transaktionen.

Grenze der Verhinderung: Die Trigger wirken gegen Fehler in der Anwendung und gegen Angriffe über die Anwendung. Wer direkten Schreibzugriff auf die Datenbankdatei hat, kann Trigger entfernen oder umgehen. Für das Löschen von Entwürfen gibt es zudem eine interne Freigabe über die Tabelle `meta`, die auch von außen gesetzt werden könnte. Gegen Root schützen nur Erkennung, Siegel und externe Kopien.

## Prüfung und Befunde

Am 22.10.2026 hat ein unabhängiger Prüfer (separater Agent ohne Kenntnis der Entwicklungsentscheidungen) die laufende Testinstanz aktiv angegriffen und den Code gelesen. Ergebnis: **keine kritische und keine hohe Schwachstelle.**

Praktisch bestätigt (Angriff scheiterte wie vorgesehen): Zugriff auf Vorgänge, Dokumente und Audit fremder Organisationen mit Sitzung und API-Schlüssel (404); CSRF ohne Token und mit fremder Origin (403); fremde Felder und fremde Signatur-IDs bei Unterzeichnern (403); falsche Dokument-Hashes (409); Webhook an `169.254.169.254` (bei Zustellung gesperrt, keine Wiederholung); Sicherheitsheader und Cookie-Flags; unveränderliche Tabellen per Trigger.

Aus dem Code abgeleitet und als unbedenklich bewertet: durchgehend parametrisierte SQL-Abfragen, escapte HTML-Mails, CRLF-Filter im Betreff, Pfadschutz bei Blob-Schlüsseln und Wiederherstellung, Argon2id mit Timing-Ausgleich, Login-Sperre, TOTP-Replay-Schutz.

Behandelte Hinweise:
- **Interne Webhook-Ziele** wurden erst bei der Zustellung abgewiesen. Behoben: Die Auflösung wird schon beim Anlegen geprüft.
- **Rate-Limit** galt auch für die statischen Dateien der Oberfläche; viele Anfragen einer IP konnten die Oberfläche sperren. Behoben: Begrenzung nur für `/api`.
- **Vorbelegte, nicht änderbare Werte anderer Rollen** sind für Unterzeichner sichtbar. Bewusste Entscheidung: Solche Werte setzt der Absender als Dokumentinhalt (z. B. Aktenzeichen); wer unterschreibt, soll den vollständigen Inhalt sehen.

Zusätzlich hat der Abgleich zwischen Dokumentation und Code zwei funktionale Schwächen aufgedeckt, die behoben und mit Tests abgesichert sind: Die Linkübergabe (`notify: false`) gilt jetzt für den gesamten Vorgang, und Einbettungslinks verlangen eine freigegebene Herkunft.

## Empfehlungen für den Betrieb

- Server-Updates und Docker-Updates zeitnah einspielen.
- Festplattenverschlüsselung auf dem Server.
- SSH nur mit Schlüssel; wenige Personen mit Root.
- Zwei-Faktor für alle Konten mit Rolle Inhaber oder Administrator.
- Bei sensiblen Vorgängen Einmalcode per SMS oder Zugangscode verwenden.
- Sicherungen außer Haus, Hauptschlüssel getrennt davon.
- Aktivitätsprotokoll und Systemübersicht regelmäßig ansehen.
