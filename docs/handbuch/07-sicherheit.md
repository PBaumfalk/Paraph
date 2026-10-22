# 7. Sicherheit

Dieses Kapitel beschreibt, wovor Paraph schützt, wie, und wo die Grenzen liegen. Alle Angaben beziehen sich auf Version 0.2.0 (Code vom 22.10.2026).

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
| Weitergeleitete E-Mail | Je Person gelten höchstens der aktuelle und der unmittelbar vorherige Link; „Link selbst weitergeben“ macht alle bisherigen Links ungültig und beendet offene Sitzungen; optional Einmalcode oder Zugangscode |
| Code auf der Signaturseite raten | Zugangscode mindestens 6 Zeichen; Sperre je Person nach 5 Fehlversuchen in 15 Minuten, unabhängig von der IP; jeder Fehlversuch im Audit-Trail |
| Mitlesen der E-Mail auf dem Weg zum Mailserver | STARTTLS erzwungen, TLS ab Version 1.2, Zertifikatsprüfung |
| Passwort raten | Argon2id, Kontosperre nach 5 Fehlversuchen, Rate-Limit, Zwei-Faktor |
| Fremde Daten über die API abrufen | jede Abfrage an die Organisation gebunden, 404 statt 403 |
| CSRF aus fremder Website | CSRF-Token im Header, Origin-Prüfung, SameSite-Cookie |
| Fremde Felder setzen, Dokument tauschen | serverseitige Prüfung jedes Feldes; Abschluss nur mit passenden Dokument-Hashes |
| Doppelte oder parallele Abschlüsse | Abschlussschlüssel und Transaktion; genau ein Abschluss |
| Schädliches PDF | Bereinigung aktiver Inhalte, Neuschreiben |
| Schädliche Office-Datei | Umwandlung in isoliertem Container ohne Netz und ohne Datenzugriff |
| SSRF über Webhooks | Sperrliste, IP-Pinning, keine Weiterleitungen |
| Diebstahl von Sicherung oder S3-Bucket | Sicherung vollständig verschlüsselt (auch die Datenbank); Hauptschlüssel darin nur mit Passphrase verpackt; Objekte im Bucket AES-256-GCM-verschlüsselt |
| Nachträgliche Änderung des Audit-Trails | Hash-Kette (Erkennung), Datenbank-Trigger (Verhinderung im Normalbetrieb), externe Verankerung mit Zeitstempel, Siegel ab Abschluss |
| Änderung von Feldwerten oder Unterschriftsbildern nach der Unterschrift | Abschluss prüft gegen die Audit-Kette und bricht bei Abweichung ab |
| Gefälschte Client-IP per `X-Forwarded-For` | `TRUST_PROXY=true` vertraut genau einem Proxy-Hop |

### Restrisiken

- **Root auf dem Server** kann alles: Hauptschlüssel lesen, Datenbank direkt ändern, Trigger umgehen, laufende Prozesse beobachten. Paraph kann das nicht verhindern, nur teilweise erkennen (siehe unten).
- **Kompromittiertes E-Mail-Postfach** einer unterzeichnenden Person: Bei Zugang nur per Link (`none`) oder per E-Mail-Code kann der Angreifer unterschreiben. Abhilfe: SMS-Code oder Zugangscode auf einem zweiten Weg.
- **Kompromittierter Browser** der unterzeichnenden Person: nicht abwehrbar.
- **OIDC-Anbieter**: Paraph verknüpft bestehende Konten nur, wenn der Anbieter die E-Mail-Adresse als bestätigt meldet (`email_verified: true`) oder `OIDC_TRUST_EMAIL=true` gesetzt ist. Wer im Anbieter E-Mail-Adressen pflegen und als bestätigt markieren kann, kann sich trotzdem als die betreffende Person anmelden – diese Rechte eng halten. Einen eigenen zweiten Faktor fragt Paraph nach SSO nur bei Personen mit aktiviertem TOTP ab; Mehrfaktor im Anbieter erzwingen.
- **Selbst signiertes Siegel**: Beweist nur die Herkunft von dieser Instanz, nicht die Identität eines Ausstellers gegenüber Dritten. Es ist kein qualifiziertes Siegel und keine persönliche Signatur der Unterzeichner.
- **SMTP-Strecke**: Paraph verschlüsselt bis zu Ihrem Mailserver. Den weiteren Weg zum Postfach des Empfängers, die Zustellung und SPF/DKIM verantwortet Ihr Mailanbieter.
- **Verankerung ohne Zeitstempeldienst**: Ohne `TSA_URL` ist die Ankerkette nur eine weitere interne Kette. Sie schützt dann nicht gegen jemanden mit vollem Serverzugriff (siehe unten).

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
- **Erinnerung:** erzeugt einen neuen Link. Der unmittelbar vorherige Link bleibt gültig, damit die erste E-Mail weiter funktioniert; alle älteren verfallen. Je Person sind also höchstens zwei Links gültig.
- **„Link selbst weitergeben“** (`POST …/recipients/{rid}/link`): ersetzt den Token, macht alle bisherigen Links ungültig und beendet bereits geöffnete Unterzeichner-Sitzungen dieser Person.
- Widerruf, Ablehnung, Vertretung und Ablauf entwerten Links und beenden offene Sitzungen.
- Einbettungslinks sind 10 Minuten gültig und nur einmal verwendbar.

### Einmalcodes und Zugangscodes

- E-Mail- und SMS-Code: 6 Ziffern, 10 Minuten gültig, gespeichert nur als Hash.
- Höchstens 5 Codes pro Stunde und Person; höchstens 5 Eingabeversuche je Code.
- Zugangscode: mindestens 6 Zeichen.
- Sperre je Person, für alle Verfahren gemeinsam: nach 5 Fehlversuchen in 15 Minuten keine weitere Prüfung. Gezählt wird je Empfänger, nicht je IP-Adresse.
- Jeder Fehlversuch steht als `recipient.auth_failed` (mit IP und Zahl der Fehlversuche) im Audit-Trail, die Sperre als `recipient.auth_locked`. Zähler und Audit-Eintrag werden festgeschrieben, bevor der Fehler gemeldet wird.
- Der SMS-Text nennt die Organisation, nicht den Titel des Dokuments.
- Öffentliche Formulare: höchstens 3 offene Codes je Adresse, 5 Versuche je Code.
- Im Audit-Trail stehen E-Mail und Telefonnummer des Codeversands nur maskiert.

### Rate-Limits

- 600 Anfragen pro Minute und IP für alle `/api/`-Pfade.
- Anmeldung, Einrichtung, Passwort, Zwei-Faktor, Einladung: 10 pro Minute.
- Signaturseite: Öffnen 30, Code anfordern 10, Code prüfen 20, Abschluss 20, Ablehnung und Vertretung je 10 pro Minute.
- Öffentliche Formulare: Start 5, Bestätigung 10 pro Minute. Hash-Prüfung 30, Signaturprüfung 10 pro Minute.

- Administration: Tiefenprüfung 6, Test-E-Mail 5 pro Minute.

Ohne `TRUST_PROXY` hinter einem Proxy teilen sich alle Nutzer die IP des Proxys und damit die Limits. `/metrics` ist vom Rate-Limit ausgenommen und ohne `METRICS_TOKEN` abgeschaltet.

### Verschlüsselung gespeicherter Daten

- Jede Datei (Original, PDF, Unterschrift, Anhang, Ergebnis) wird vor dem Speichern mit **AES-256-GCM** verschlüsselt. Der Schlüssel je Datei wird per **HKDF-SHA256** aus dem Hauptschlüssel abgeleitet (Zweck `blob`, Salz = Datei-ID). Die Datei-ID ist zusätzlich als Associated Data gebunden; vertauschte Dateien schlagen bei der Entschlüsselung fehl.
- Geheimnisse in der Datenbank (TOTP, Webhook-Geheimnisse, privater Siegelschlüssel, E-Mail-Inhalte) verschlüsselt Paraph mit einem eigenen, ebenfalls per HKDF abgeleiteten Teilschlüssel.
- Gespeicherte Antworten für Idempotenz-Schlüssel (sie können Signaturlinks enthalten) liegen verschlüsselt in der Datenbank.
- Den Textauszug der Dokumente (für die Formhinweise) löscht Paraph beim Versand.
- Nicht verschlüsselt in der Datenbank: Namen, E-Mail-Adressen, Titel, Feldwerte, Audit-Trail. Schützen Sie das Datenvolume entsprechend (Festplattenverschlüsselung des Servers). Sicherungen verschlüsseln die Datenbank vollständig ([Kapitel 6](06-sicherung.md)).

### E-Mail-Ausgang

E-Mails werden in einer Warteschlange gespeichert. Text- und HTML-Inhalt (mit dem Link) liegen dort verschlüsselt. **Nach erfolgreichem Versand löscht Paraph den Inhalt**; es bleiben Empfänger, Betreff und Status. Vorübergehende Fehler werden bis zu 8-mal versucht; dauerhafte Fehler (z. B. unbekannte Adresse) nicht. Nach einem endgültigen Fehler wird der Inhalt ebenfalls gelöscht. Die Datensätze werden nach 90 Tagen gelöscht.

Bei `smtp://` erzwingt Paraph STARTTLS; ein Server ohne STARTTLS erhält keine E-Mail. Ausnahmen gelten nur für lokale Testserver und mit `SMTP_ALLOW_INSECURE=true` ([Kapitel 3](03-konfiguration.md#e-mail)).

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

Unterschriftsbilder: Vor dem Dekodieren liest Paraph die Abmessungen aus dem PNG-Kopf und weist Bilder außerhalb von 20 × 10 bis 2400 × 1200 Pixel ab (Schutz vor Dekompressionsbomben); höchstens 1,5 MB. Danach wird das Bild dekodiert, auf Mindestdeckung geprüft und neu kodiert. Eingebettete Metadaten gehen dabei verloren.

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
- schreibgeschütztes Root-Dateisystem; schreibbar nur `/data`, `/backups`, `/tmp` (tmpfs, 256 MB)
- alle Linux-Capabilities entzogen, `no-new-privileges`
- Speicher- und Prozesslimit (1 GB, 256 Prozesse)
- npm, npx und corepack aus dem Laufzeit-Image entfernt
- Port nur an `127.0.0.1` gebunden
- Hauptschlüssel und Wiederherstellungs-Passphrase als Docker-Secrets, nicht als Umgebungsvariable; `install.sh` setzt sie auf 0400 mit Eigentümer UID 1000 und `.env` auf 0600
- Images von Gotenberg (`8.38.1`) und Caddy (`2.10.2-alpine`) mit fester Version
- Caddy (Profil `caddy`): schreibgeschützt, nur `NET_BIND_SERVICE`, `no-new-privileges`

### Datensparsame Logs

- Keine Query-Strings, keine Bodies im Zugriffslog.
- Token in Pfaden (`/s/`, `/embed/s/`, `/invite/`, `/reset/`, `/f/`) werden durch `…` ersetzt.
- `Authorization`, Cookies sowie Felder namens `password`, `token`, `code` werden aus Logeinträgen entfernt.
- Interne Fehler gehen mit Details ins Log, an den Client nur „Interner Fehler“.

Der mitgelieferte Caddy kürzt dieselben Pfade in seinem Zugriffsprotokoll und entfernt `Cookie` und `Authorization`.

Ausnahme: `DEV_MODE=true` schreibt ohne SMTP Links ins Log. Nie produktiv einschalten.

### Mandantentrennung

Jede Abfrage ist an die Organisation des Anfragenden gebunden. Vorgänge, Vorlagen, Dateien, Felder und Webhooks anderer Organisationen, anderer Modi (live/test) oder ohne Sichtbarkeit beantwortet Paraph mit **404**. Ein Test-API-Schlüssel sieht und ändert keine Live-Webhooks und erhält über `/api/v1/events` keine Live-Ereignisse (und umgekehrt). So lässt sich die Existenz fremder Objekte nicht ermitteln. Unterzeichner können ausschließlich die Felder setzen, die ihnen zugeordnet sind; Feldwerte, Unterschriften und Anhänge werden serverseitig gegen Vorgang, Person und Status geprüft.

## Manipulationserkennung und Manipulationsverhinderung

Paraph unterscheidet beides bewusst.

### Erkennung

- **Hash-Kette des Audit-Trails:** Jeder Eintrag enthält den SHA-256 seines Vorgängers und wird über kanonisches JSON (Vorgang, Nummer, Zeit, Typ, Akteur, Daten, Vorgänger-Hash) gehasht. Wer einen Eintrag ändert, einfügt oder löscht, bricht die Kette ab dieser Stelle. Prüfen: `paraph verify-audit` oder in der Oberfläche am Vorgang.
- **Hashes der Dokumente:** Original, maßgebliche Fassung, finales PDF, Abschlussbestätigung, Audit-Export und Nachweispaket werden mit SHA-256 erfasst und in einem Register geführt. `/verify` vergleicht eine vorgelegte Datei mit dem Register.
- **Prüfwert in der Abschluss-E-Mail:** Jede beteiligte Person erhält beim Abschluss den SHA-256 des unterschriebenen Dokuments per E-Mail. Damit liegt ein Zeuge außerhalb des Servers.
- **Plattformsiegel ab Abschluss:** Das finale PDF trägt eine PAdES-Signatur der Instanz. Jede spätere Änderung am PDF macht die Signatur ungültig; das zeigt jeder PDF-Prüfer an. Die Abschlussbestätigung nennt Anzahl und Kopf (letzten Hash) der Audit-Kette und ist ebenfalls versiegelt. Vor dem Abschluss prüft Paraph die Kette; ist sie beschädigt, bricht der Abschluss ab. Mit `TSA_URL` kommt ein geprüfter RFC-3161-Zeitstempel hinzu (PAdES-B-T).

### Integritätsprüfung beim Abschluss

Beim Unterschreiben schreibt Paraph in den Audit-Trail die Hashes der Dokumentfassung, einen Hash über die eigenen Feldwerte der Person und den Hash jedes Unterschriftsbilds (`src/server/domain/signing.ts`). Vor dem Einbrennen in das finale PDF vergleicht der Abschluss diese Werte mit dem Stand in der Datenbank (`src/server/domain/finalize.ts`). Weicht etwas ab, etwa ein Feldwert, der nach der Unterschrift direkt in der Datenbank geändert wurde, oder ein ausgetauschtes Unterschriftsbild, bricht der Abschluss ab. Die Änderung gelangt nicht in das versiegelte Dokument.

Formelfelder einer Person, die bereits abgeschlossen hat, ändern sich durch spätere Eingaben anderer nicht mehr. Sie behält genau die Werte, die sie gesehen und unterschrieben hat.

### Geprüfte Zeitstempel

Ein Zeitstempel zählt nur, wenn Signatur des Dienstes, Hashwert, Nonce (bei eigener Anfrage), Verwendungszweck des Zertifikats und die ESS-Bindung des Zertifikats an die Signatur (`signingCertificate`/`signingCertificateV2`) stimmen (`src/server/pdf/timestamp.ts`). Mit `TSA_CA_FILE` prüft Paraph zusätzlich die Zertifikatskette des Dienstes; ein Dienst außerhalb der Vertrauensanker wird beim Stempeln abgelehnt. Als extern bestätigt zählen Anker nur mit geprüfter Kette. Die Prüfstelle bestimmt das Zertifikat einer Signatur über die Signer-ID (nicht über die Reihenfolge der Zertifikate), prüft die ESS-Bindung und weist einen ungültigen oder nicht vertrauenswürdigen Zeitstempel aus.

### Externe Verankerung

Die Hash-Kette allein schützt nicht gegen jemanden, der die ganze Kette neu berechnet. Deshalb fasst Paraph in festen Abständen (`ANCHOR_INTERVAL_MINUTES`, Standard 60) und nach jedem Abschluss die aktuellen Kettenköpfe aller geänderten, versandten Vorgänge in einem Merkle-Baum nach RFC 6962 zusammen (`src/server/domain/anchor.ts`). Entwürfe werden nicht verankert.

- Die Anker bilden ihrerseits eine Kette (jeder Anker enthält den Hash des vorherigen).
- Mit `TSA_URL` lässt Paraph jeden Ankerhash von einem unabhängigen Zeitstempeldienst bestätigen. Ist der Dienst nicht erreichbar, wird der Zeitstempel beim nächsten Lauf nachgeholt.
- `paraph verify-audit` und die Tiefenprüfung vergleichen jeden verankerten Kettenkopf mit dem aktuellen Stand, prüfen Ankerkette, Merkle-Wurzeln und Zeitstempel.
- Das Nachweispaket enthält `08_verankerung.json` mit allen Ankern des Vorgangs, dem Merkle-Prüfpfad und den Zeitstempeln. `pruefen/verify-audit.py` prüft den Prüfpfad und den Ankerhash ohne Paraph, legt die Zeitstempel als `anker-N.tsr` ab und nennt den Befehl `openssl ts -verify` zu ihrer Prüfung.
- Die Funktion `envelopeAnchoring` bestimmt je Vorgang, wie lange es höchstens dauerte, bis ein Ereignis extern bestätigt war (`max_anchor_delay_hours`). Ein auffällig großer Abstand zwischen Ereignis und erster externer Bestätigung weist auf eine Rückdatierung hin. `paraph verify-audit` meldet Vorgänge, deren Verzug über dem Doppelten des Verankerungsabstands plus 24 Stunden liegt; in der Oberfläche erscheint der Wert noch nicht. Von außen lässt er sich aus `03_audit-trail.json` und `08_verankerung.json` ablesen (Zeitpunkt des Ereignisses gegen `genTime` des ersten Zeitstempels).

**Grenze (ehrlich):**

- **Ohne Zeitstempeldienst** ist die Ankerkette nur eine weitere Kette auf demselben Server. Wer vollen Serverzugriff hat, kann sie zusammen mit den Audit-Ketten neu berechnen. Externe Zeugen sind dann nur Sicherungen außerhalb des Servers und die an Beteiligte versandten Prüfwerte. `paraph verify-audit` und die Betriebsdiagnose weisen darauf hin.
- **Zeitstempeldienst ohne Vertrauensanker:** Ohne `TSA_CA_FILE` prüft Paraph, dass ein Zeitstempel rechnerisch gültig ist, aber nicht, wer ihn ausgestellt hat. Wer vollen Serverzugriff hat, könnte mit einem selbst erzeugten Zeitstempel-Zertifikat Zeitstempel beliebiger Zeit erzeugen. Für den Nachweis gegenüber Root deshalb `TSA_CA_FILE` mit dem Zertifikat des Anbieters einrichten und das Zertifikat des Dienstes in Prüfungen von außen (z. B. `openssl ts -verify -CAfile`) unabhängig beschaffen.
- **Mit Zeitstempeldienst und Vertrauensanker** lässt sich ein bereits bestätigter Anker nicht ändern, ohne dass sein Zeitstempel ungültig wird; gelöschte oder neu berechnete Anker brechen die Ankerkette. Baut jemand mit Root-Zugriff die Ankerkette vollständig neu auf und holt neue Zeitstempel, tragen diese die Zeit nach der Fälschung. Erkennbar wird das durch den Vergleich mit früher herausgegebenen Nachweispaketen, Sicherungen und Prüfwerten sowie durch den großen Abstand zwischen Ereigniszeit und Zeitstempel (Rückdatierungsverzug, siehe oben).
- Ereignisse zwischen zwei Verankerungen sind bis zur nächsten Verankerung nur intern geschützt.
- Wer Root-Zugriff hat, kann einen **noch laufenden** Vorgang vor seiner ersten Verankerung beliebig ändern.

### Verhinderung

- **Datenbank-Trigger** weisen `UPDATE` und `DELETE` auf Audit-Ereignissen, auf Ergebnissen und finalen Dokumenten sowie `UPDATE` auf Vorlagenversionen ab.
- Zustandsübergänge laufen nur serverseitig und in Transaktionen.

Grenze der Verhinderung: Die Trigger wirken gegen Fehler in der Anwendung und gegen Angriffe über die Anwendung. Wer direkten Schreibzugriff auf die Datenbankdatei hat, kann Trigger entfernen oder umgehen. Für das Löschen von Entwürfen gibt es zudem eine interne Freigabe über die Tabelle `meta`, die auch von außen gesetzt werden könnte. Gegen Root schützen nur Erkennung, Verankerung mit Zeitstempel, Siegel und externe Kopien.

## Prüfung und Befunde

Am 22.10.2026 hat ein unabhängiger Prüfer (separater Agent ohne Kenntnis der Entwicklungsentscheidungen) die laufende Testinstanz aktiv angegriffen und den Code gelesen. Ergebnis: **keine kritische und keine hohe Schwachstelle.**

Praktisch bestätigt (Angriff scheiterte wie vorgesehen): Zugriff auf Vorgänge, Dokumente und Audit fremder Organisationen mit Sitzung und API-Schlüssel (404); CSRF ohne Token und mit fremder Origin (403); fremde Felder und fremde Signatur-IDs bei Unterzeichnern (403); falsche Dokument-Hashes (409); Webhook an `169.254.169.254` (bei Zustellung gesperrt, keine Wiederholung); Sicherheitsheader und Cookie-Flags; unveränderliche Tabellen per Trigger.

Aus dem Code abgeleitet und als unbedenklich bewertet: durchgehend parametrisierte SQL-Abfragen, escapte HTML-Mails, CRLF-Filter im Betreff, Pfadschutz bei Blob-Schlüsseln und Wiederherstellung, Argon2id mit Timing-Ausgleich, Login-Sperre, TOTP-Replay-Schutz.

Behandelte Hinweise:
- **Interne Webhook-Ziele** wurden erst bei der Zustellung abgewiesen. Behoben: Die Auflösung wird schon beim Anlegen geprüft.
- **Rate-Limit** galt auch für die statischen Dateien der Oberfläche; viele Anfragen einer IP konnten die Oberfläche sperren. Behoben: Begrenzung nur für `/api`.
- **Vorbelegte, nicht änderbare Werte anderer Rollen** sind für Unterzeichner sichtbar. Bewusste Entscheidung: Solche Werte setzt der Absender als Dokumentinhalt (z. B. Aktenzeichen); wer unterschreibt, soll den vollständigen Inhalt sehen.

Zusätzlich hat der Abgleich zwischen Dokumentation und Code zwei funktionale Schwächen aufgedeckt, die behoben und mit Tests abgesichert sind: Die Linkübergabe (`notify: false`) gilt jetzt für den gesamten Vorgang, und Einbettungslinks verlangen eine freigegebene Herkunft.

### Befunde aus der Prüfung für 0.2.0

Eine weitere Sicherheitsprüfung hat Befunde ergeben, die in 0.2.0 behoben und in `tests/hardening.test.ts` bzw. `tests/flows.test.ts` abgesichert sind:

| Befund | Behebung |
|---|---|
| Fehlversuche bei Zugangscodes wurden mit dem Fehler zurückgerollt und damit nicht gezählt. | Zähler und Audit-Eintrag werden vor der Fehlermeldung festgeschrieben; Sperre je Person nach 5 Fehlversuchen in 15 Minuten (`recipient.auth_failed`, `recipient.auth_locked`). |
| Zugangscodes ab 4 Zeichen | mindestens 6 Zeichen |
| `TRUST_PROXY=true` vertraute jedem Eintrag in `X-Forwarded-For`. | genau ein Proxy-Hop |
| Test-API-Schlüssel konnten Live-Webhooks lesen und ändern und Live-Ereignisse empfangen. | strikt nach Modus getrennt |
| Formelfelder einer Person, die schon unterschrieben hatte, änderten sich durch spätere Eingaben. | nach dem eigenen Abschluss eingefroren |
| Textauszug der Dokumente blieb nach dem Versand im Klartext. | beim Versand gelöscht |
| Unterschriftsbild als PNG-Dekompressionsbombe | Abmessungen werden vor dem Dekodieren geprüft |
| Idempotenz-Antworten (mit Signaturlinks) lagen im Klartext. | verschlüsselt gespeichert |
| „Neuer Link“ ließ bereits geöffnete Sitzungen bestehen. | beendet sie |
| API-Schlüssel entfernter oder gesperrter Personen wirkten weiter. | ungültig |

Zusätzlich geändert: Eine Erinnerung lässt den unmittelbar vorherigen Link gültig, damit der Link aus der vorigen E-Mail weiter funktioniert (in 0.1.0 wurde er ungültig); „Link selbst weitergeben“ widerruft alle bisherigen Links.

## Empfehlungen für den Betrieb

- Server-Updates und Docker-Updates zeitnah einspielen.
- Festplattenverschlüsselung auf dem Server.
- SSH nur mit Schlüssel; wenige Personen mit Root.
- Zwei-Faktor für alle Konten mit Rolle Inhaber oder Administrator.
- Bei sensiblen Vorgängen Einmalcode per SMS oder Zugangscode verwenden.
- Zeitstempeldienst einrichten (`TSA_URL`, möglichst mit `TSA_CA_FILE`). Ohne ihn schützt die Verankerung nicht gegen jemanden mit Serverzugriff.
- Sicherungen außer Haus, Wiederherstellungs-Passphrase und Hauptschlüssel getrennt davon.
- Aktivitätsprotokoll und Einstellungen → System regelmäßig ansehen; Alarm-E-Mails an die Instanz-Administration nicht ausfiltern.
