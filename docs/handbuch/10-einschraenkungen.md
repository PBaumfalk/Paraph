# 10. Einschränkungen

Stand: 22.10.2026. Diese Liste nennt, was Paraph nicht kann, was nicht gegen echte Gegenstellen getestet ist und wo die Grenzen der Schutzmaßnahmen liegen.

## Signaturstufen

- **QES ist nicht angebunden.** Es gibt keine Implementierung für einen qualifizierten Vertrauensdiensteanbieter und keinen Vertrag mit einem Anbieter. Die Variablen `QES_CSC_*` werden nur gelesen. Die Oberfläche zeigt „nicht eingerichtet“ (mit gesetzten Variablen „Anbieter konfiguriert, nicht verifiziert“). Der Versand eines Vorgangs mit Stufe `qes` wird immer blockiert.
- **FES wird nicht beansprucht.** Paraph erzeugt einfache elektronische Signaturen.
- **Siegelzertifikat selbst signiert.** PDF-Programme zeigen „Aussteller unbekannt“. Eigene Zertifikate (z. B. von einer CA) lassen sich je Organisation importieren.
- **Zeitstempel** nur gegen FreeTSA getestet. FreeTSA ist kein qualifizierter Zeitstempeldienst.

## Nicht gegen echte Gegenstellen getestet

- **SMS:** Die Schnittstelle ist generisch (JSON-POST). Sie wurde nicht gegen einen echten SMS-Anbieter getestet.
- **OIDC/authentik:** gegen authentik 2026.8.5 automatisiert getestet (`tests/oidc-authentik.test.ts`). Andere Anbieter (Keycloak, Entra ID, Google) nicht getestet. Kein Single Logout: Abmelden in Paraph meldet nicht beim Anbieter ab.
- **S3:** Speicher mit SigV4-Signatur implementiert, nicht gegen MinIO oder AWS getestet.
- **E-Mail-Zustellung:** nur gegen Mailpit getestet. Zustellbarkeit, SPF, DKIM und DMARC liegen beim Betreiber und seinem Mailanbieter.

## Funktionen

- **Automatische Felderkennung** ist heuristisch (Unterstrichlinien, Beschriftungen, Kästchen). Vorschläge sind zu prüfen.
- **Formhinweise** sind regelbasiert (Schlüsselwörter), keine Einzelfallprüfung. Der Katalog hat den Stand 22.10.2026 und ist vor dem Produktiveinsatz anwaltlich freizugeben.
- **Dokumentenumwandlung** (Word, DOC, ODT, RTF) nur mit dem Gotenberg-Container. Ohne ihn nur PDF.
- **Einbettung:** Nur die Signaturseite ist einbettbar. Der Vorlagen- und Vorgangs-Editor nicht. `postMessage`-Nachrichten gibt es nur, wenn beim Einbettungslink eine Herkunft angegeben wurde.
- **Zwei-Faktor** lässt sich nicht organisationsweit erzwingen. Bei OIDC-Anmeldung fragt Paraph einen eigenen zweiten Faktor nur ab, wenn die Person TOTP aktiviert hat. Reine SSO-Konten (ohne Passwort) können ein aktiviertes TOTP nicht selbst abschalten.
- **Anmeldeereignisse** werden protokolliert, erscheinen aber nicht im Aktivitätsprotokoll der Organisation.

## Betrieb

- **Keine Mehrfach-Instanz-Skalierung.** Paraph nutzt SQLite und läuft als ein Container. Mehrere Container auf derselben Datenbank sind nicht vorgesehen.
- **Sicherung mit S3** enthält nur die Datenbank; der Bucket ist gesondert zu sichern.

## Barrierefreiheit

- Die Oberfläche für Unterzeichner ist nicht mit Screenreadern im Volltest geprüft.

## Grenzen der Schutzmaßnahmen

- **Audit-Trail und Root-Zugriff:** Der Audit-Trail schützt nicht gegen jemanden mit Root-Zugriff auf den Server. Datenbank-Trigger verhindern Änderungen nur über die Anwendung. Gegen Root bleibt die Erkennung über die Hash-Kette und, ab Abschluss, das Siegel mit Abschlussbestätigung; bei laufenden Vorgängen kann Root die Kette vollständig neu berechnen. Siehe [Kapitel 7](07-sicherheit.md#manipulationserkennung-und-manipulationsverhinderung).
- **Aufbewahrung** löscht Inhalte (Dateien, Feldwerte), behält aber den Audit-Trail sowie Namen und E-Mail-Adressen der Beteiligten.
- **Hauptschlüssel:** Geht er verloren, sind alle Dokumente unwiederbringlich verloren. Es gibt keine Schlüsselrotation über die Oberfläche.
