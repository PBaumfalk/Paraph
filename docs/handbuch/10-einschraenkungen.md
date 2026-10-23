# 10. Einschränkungen

Stand: 22.10.2026, Version 0.2.0. Diese Liste nennt, was Paraph nicht kann, was nicht gegen echte Gegenstellen getestet ist und wo die Grenzen der Schutzmaßnahmen liegen.

## Signaturstufen

- **QES ist nicht angebunden.** Es gibt keine Implementierung für einen qualifizierten Vertrauensdiensteanbieter und keinen Vertrag mit einem Anbieter. Die Variablen `QES_CSC_*` werden nur gelesen. Die Oberfläche zeigt „nicht eingerichtet“ (mit gesetzten Variablen „Anbieter konfiguriert, nicht verifiziert“). Der Versand eines Vorgangs mit Stufe `qes` wird immer blockiert.
- **FES wird nicht beansprucht.** Paraph erzeugt einfache elektronische Signaturen.
- **Siegelzertifikat selbst signiert.** PDF-Programme zeigen „Aussteller unbekannt“. Das Plattformsiegel ist ein technisches Integritätssiegel, kein qualifiziertes Siegel und keine persönliche Signatur der Unterzeichner. Eigene Zertifikate (z. B. von einer CA) lassen sich je Organisation importieren.
- **Zeitstempel:** Die Prüfung der Zeitstempel (Signatur, Hashwert, Nonce, Kette mit `TSA_CA_FILE`) ist automatisiert gegen einen lokalen OpenSSL-Zeitstempeldienst getestet und am 23.10.2026 gegen FreeTSA (`tests/freetsa.test.ts`, mit `PARAPH_LIVE_TSA=1`): Anfrage, Kette zum mitgelieferten Wurzelzertifikat und Plattformsiegel PAdES-B-T. FreeTSA ist die Vorgabe von `install.sh`. Der Dienst ist kostenlos, wird von einer Privatperson betrieben, hat keine Verfügbarkeitszusage und ist **kein qualifizierter Zeitstempeldienst**; die Vermutung nach Art. 41 Abs. 2 eIDAS greift nicht. Fällt er aus, siegelt Paraph ohne Zeitstempel (PAdES-B-B) und holt Zeitstempel der Verankerung beim nächsten Lauf nach. Wechsel zu einem qualifizierten Anbieter: `TSA_URL` und `secrets/tsa_ca.pem` tauschen.

## Nicht gegen echte Gegenstellen getestet

- **SMS:** Die Schnittstelle ist generisch (JSON-POST). Sie ist ungetestet; weder gegen einen echten SMS-Anbieter noch automatisiert. Die Betriebsdiagnose prüft das Gateway nicht.
- **OIDC/authentik:** gegen authentik 2026.8.5 automatisiert getestet (`tests/oidc-authentik.test.ts`). Hinweis: Das Standard-E-Mail-Mapping von authentik liefert `email_verified=false`; bestehende Konten werden dann nicht verknüpft. Abhilfe: eigenes Scope-Mapping oder `OIDC_TRUST_EMAIL=true` ([Kapitel 3](03-konfiguration.md#authentik-einrichten-schritt-für-schritt)). Andere Anbieter (Keycloak, Entra ID, Google) nicht getestet. Kein Single Logout: Abmelden in Paraph meldet nicht beim Anbieter ab.
- **S3:** gegen MinIO getestet (`tests/s3-minio.test.ts`, Pfadstil). Nicht getestet: AWS, Hetzner, Wasabi und der virtual-hosted-Stil (`S3_FORCE_PATH_STYLE=false`).
- **E-Mail-Zustellung:** nur gegen Mailpit (einschließlich erzwungenem STARTTLS und SMTP-Anmeldung) und einen lokalen SMTP-Stub getestet. Echte Zustellung, Zustellbarkeit, SPF, DKIM und DMARC sind nicht geprüft; sie liegen beim Betreiber und seinem Mailanbieter.

## Funktionen

- **Automatische Felderkennung** ist heuristisch (Unterstrichlinien, Beschriftungen, Kästchen). Vorschläge sind zu prüfen.
- **Formhinweise** sind regelbasiert (Schlüsselwörter), keine Einzelfallprüfung. Der Katalog hat den Stand 22.10.2026 und ist vor dem Produktiveinsatz anwaltlich freizugeben. Die Freigabe ist offen; die Punkte stehen in `docs/recht/FREIGABELISTE.md`.
- **Rückdatierungsverzug** (`max_anchor_delay_hours`) wird berechnet, aber weder in der Oberfläche noch in `paraph verify-audit` angezeigt ([Kapitel 7](07-sicherheit.md#externe-verankerung)).
- **Dokumentenumwandlung** (Word, DOC, ODT, RTF) nur mit dem Gotenberg-Container. Ohne ihn nur PDF.
- **Einbettung:** Nur die Signaturseite ist einbettbar. Der Vorlagen- und Vorgangs-Editor nicht. `postMessage`-Nachrichten gibt es nur, wenn beim Einbettungslink eine Herkunft angegeben wurde.
- **Zwei-Faktor** lässt sich nicht organisationsweit erzwingen. Bei OIDC-Anmeldung fragt Paraph einen eigenen zweiten Faktor nur ab, wenn die Person TOTP aktiviert hat. Reine SSO-Konten (ohne Passwort) können ein aktiviertes TOTP nicht selbst abschalten.
- **Anmeldeereignisse** werden protokolliert, erscheinen aber nicht im Aktivitätsprotokoll der Organisation.

## Betrieb

- **Keine Mehrfach-Instanz-Skalierung.** Paraph nutzt SQLite und läuft als ein Container. Mehrere Container auf derselben Datenbank sind nicht vorgesehen.
- **Sicherung mit S3** liest jede Datei aus dem Bucket; bei großen Datenmengen dauert sie entsprechend. Gegen einen echten Cloud-Anbieter ist das nicht getestet.
- **Update von einer mit `init.sh` eingerichteten Installation** ist nicht automatisiert getestet ([Kapitel 2](02-installation.md#update-einer-mit-initsh-eingerichteten-installation-010)).
- **Office-Umwandlung** (DOCX → PDF über Gotenberg) ist in der Docker-Gesamtprüfung von 0.2.0 nicht mehr enthalten.

## Barrierefreiheit

- Die Oberfläche für Unterzeichner ist nicht mit Screenreadern im Volltest geprüft.

## Oberfläche

- Ein manueller Durchgang in Google Chrome war nicht möglich. Die Oberfläche ist per Playwright geprüft: Chromium (Desktop, Pixel 7) und WebKit (iPhone 14). Siehe [Kapitel 9](09-tests-und-nachweise.md#playwright).

## Grenzen der Schutzmaßnahmen

- **Audit-Trail und Root-Zugriff:** Der Audit-Trail schützt nicht gegen jemanden mit Root-Zugriff auf den Server. Datenbank-Trigger verhindern Änderungen nur über die Anwendung. Gegen Root bleibt die Erkennung über die Hash-Kette, die externe Verankerung und, ab Abschluss, das Siegel mit Abschlussbestätigung. Ohne Zeitstempeldienst (`TSA_URL`) schützt die Verankerung nicht gegen jemanden mit vollem Serverzugriff; ohne Vertrauensanker (`TSA_CA_FILE`) ist der Aussteller eines Zeitstempels nicht geprüft. Mit beidem wird eine nachträgliche Fälschung an späteren Zeitstempeln bzw. am Rückdatierungsverzug erkennbar. Ereignisse vor der ersten Verankerung eines Vorgangs kann Root unbemerkt neu berechnen. Siehe [Kapitel 7](07-sicherheit.md#manipulationserkennung-und-manipulationsverhinderung).
- **Aufbewahrung** löscht Inhalte (Dateien, Feldwerte), behält aber den Audit-Trail sowie Namen und E-Mail-Adressen der Beteiligten.
- **Hauptschlüssel:** Geht er verloren, sind alle Dokumente unwiederbringlich verloren. Es gibt keine Schlüsselrotation über die Oberfläche.
