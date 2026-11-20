# 17. Grenzen

Dieses Kapitel nennt ehrlich, was Paraph nicht kann, was nicht gegen echte Gegenstellen geprüft ist und wo die Schutzmaßnahmen enden. Es richtet sich an die Kanzleileitung, die über den Einsatz entscheidet, und an IT und Betrieb. Stand: Version 0.2.0 mit den unveröffentlichten Änderungen vom 23.10.2026.

## Den Freigabestand kennen

Der Abnahmebericht (`docs/STATUS-0.2.0.md`) bewertet Paraph als **„NOT READY FOR PRODUCTION – technisch abnahmefähig, Freigaben offen“**. Drei Punkte blockieren den Produktivstart; keiner lässt sich durch weiteren Code lösen:

1. **Anwaltliche Freigabe** der Formhinweise und Erklärungstexte ist offen (`docs/recht/FREIGABELISTE.md`, [Kapitel 7](07-recht.md)).
2. **Echte Gegenstellen sind nicht verifiziert:** Mailserver mit SPF/DKIM/DMARC, Domain mit Let's-Encrypt-Zertifikat. Geprüft wurde nur gegen lokale Testdienste.
3. **Zeitstempeldienst:** Gewählt ist inzwischen FreeTSA als Vorgabe von `install.sh`. Erledigt ist der Punkt, sobald `paraph doctor` auf dem Server den Zeitstempeldienst mit „Kette vertrauenswürdig“ meldet.

Danach gehört ein Abnahmelauf auf dem eigenen Server dazu ([Kapitel 16](16-tests-und-nachweise.md#abnahme-auf-dem-eigenen-server)).

## Signaturstufen

- **Paraph erzeugt einfache elektronische Signaturen (EES).** Eine fortgeschrittene elektronische Signatur (FES) wird nicht beansprucht.
- **QES ist nicht angebunden.** Es gibt keine Implementierung für einen qualifizierten Vertrauensdiensteanbieter und keinen Vertrag. Die Variablen `QES_CSC_*` werden nur gelesen. Die Oberfläche zeigt „nicht eingerichtet“, mit gesetzten Variablen „Anbieter konfiguriert, nicht verifiziert“. Der Versand eines Vorgangs mit Stufe QES wird immer blockiert.
- **Das Plattformsiegel ist selbst signiert.** PDF-Programme zeigen „Aussteller unbekannt“. Es ist ein technisches Integritätssiegel, kein qualifiziertes Siegel und keine persönliche Signatur der Unterzeichner. Je Organisation lässt sich ein eigenes Zertifikat importieren. Der Siegelschlüssel liegt verschlüsselt in der Datenbank, nicht in einem HSM.
- **FreeTSA ist kein qualifizierter Zeitstempeldienst.** Er ist kostenlos, wird von einer Privatperson betrieben und hat keine Verfügbarkeitszusage. Die Vermutung für qualifizierte Zeitstempel greift nicht. Fällt er aus, siegelt Paraph ohne Zeitstempel (PAdES-B-B). Der Wechsel zu einem qualifizierten Anbieter ist möglich, aber nicht getestet ([Kapitel 14](14-sicherheit-und-nachweis.md#zu-einem-qualifizierten-anbieter-wechseln)).

## Nicht gegen echte Gegenstellen geprüft

| Bereich | Geprüft gegen | Nicht geprüft |
|---|---|---|
| E-Mail | Mailpit mit erzwungenem STARTTLS und Anmeldung; lokaler SMTP-Stub | echte Zustellung, Zustellbarkeit, Spam-Einstufung, SPF, DKIM, DMARC |
| HTTPS | Caddy mit interner CA für `localhost` | Let's Encrypt mit echter Domain |
| Zeitstempel | lokaler OpenSSL-Zeitstempeldienst; FreeTSA live (23.10.2026) | qualifizierter Anbieter; Prüfung eines FreeTSA-versiegelten PDFs mit pdfsig oder pyHanko |
| S3 | MinIO (Pfadstil) | AWS, Hetzner, Wasabi; virtual-hosted-Stil (`S3_FORCE_PATH_STYLE=false`) |
| OIDC | authentik 2026.8.5 | Keycloak, Entra ID, Google und andere |
| SMS | – | **gar nicht**; weder gegen einen Anbieter noch automatisiert. Die Diagnose prüft das Gateway nicht. |
| Docker-Betrieb | Docker Desktop unter macOS | Linux-Server |

Die MinIO- und authentik-Tests liefen bei der Entwicklung mit den Diensten. In den letzten belegten Gesamtläufen waren die Dienste nicht gestartet; die Tests wurden übersprungen.

Zu authentik: Das Standard-E-Mail-Mapping liefert `email_verified=false`. Bestehende Konten werden dann nicht verknüpft. Abhilfe: eigenes Scope-Mapping oder `OIDC_TRUST_EMAIL=true` ([Kapitel 9](09-anmeldung-und-sso.md)).

## Funktionen

- **Automatische Felderkennung** ist heuristisch (Unterstrichlinien, Beschriftungen, Kästchen). Vorschläge sind zu prüfen.
- **Formhinweise** sind regelbasiert (Schlüsselwörter), keine Einzelfallprüfung. Der Katalog hat den Stand 22.10.2026 und ist anwaltlich nicht freigegeben.
- **Dokumentenumwandlung** (Word, DOC, ODT, RTF) nur mit dem Gotenberg-Container; ohne ihn nur PDF.
- **Einbettung:** Nur die Signaturseite ist einbettbar, nicht der Vorlagen- oder Vorgangs-Editor. `postMessage`-Nachrichten gibt es nur, wenn beim Einbettungslink eine Herkunft angegeben wurde.
- **Zwei-Faktor** lässt sich nicht organisationsweit erzwingen. Nach OIDC-Anmeldung fragt Paraph einen eigenen zweiten Faktor nur ab, wenn die Person TOTP aktiviert hat. Reine SSO-Konten ohne Passwort können ein aktiviertes TOTP nicht selbst abschalten.
- **Kein Single Logout:** Abmelden in Paraph meldet nicht beim SSO-Anbieter ab.
- **Anmeldeereignisse** werden protokolliert, erscheinen aber nicht im Aktivitätsprotokoll der Organisation.

## Nachweis und Prüfung

- **Rückdatierungsverzug** meldet nur `paraph verify-audit` auf der Kommandozeile. In der Oberfläche erscheint er nicht.
- **Grund eines fehlenden Siegel-Zeitstempels** zeigt die Oberfläche nicht. Die Vorgangsseite nennt nur die Stufe (PAdES-B-B); den Grund liefert die API unter `result.seal.timestamp_error`.
- **Nachweispaket und Verankerung:** Das Paket enthält nur Anker, die vor dem Abschluss entstanden sind. Die Verankerung des Abschlusses selbst steht nur auf dem Server. Wurde ein Vorgang vor seiner ersten Verankerung abgeschlossen, enthält das Paket keine Verankerung.
- **Ein fertiges PDF lässt sich nicht nachträglich mit Zeitstempel versehen.** Fehlte der Dienst beim Abschluss, bleibt das Siegel PAdES-B-B.
- **Die Diagnose prüft nur das Instanzzertifikat**, nicht importierte Zertifikate einzelner Organisationen.

## Betrieb

- **Keine Skalierung über mehrere Instanzen.** Paraph nutzt SQLite und läuft als ein Container. Mehrere Container auf derselben Datenbank sind nicht vorgesehen; Hochverfügbarkeit gibt es nicht.
- **Sicherung mit S3** liest jede Datei aus dem Bucket; bei großen Datenmengen dauert sie entsprechend. Gegen einen echten Cloud-Anbieter ist das nicht getestet.
- **Update einer mit `init.sh` eingerichteten Installation** (0.1.0) ist nicht automatisiert getestet ([Kapitel 13](13-sicherung-und-updates.md)).
- **Hauptschlüssel:** Geht er verloren und gibt es keine Sicherung mit Wiederherstellungs-Passphrase, sind alle Dokumente unwiederbringlich verloren. Eine Schlüsselrotation über die Oberfläche gibt es nicht.
- **Der Docker-Gesamttest läuft nicht in der CI**, sondern nur von Hand.

## Oberfläche und Barrierefreiheit

- Die Oberfläche ist ausschließlich automatisiert mit Playwright geprüft: Chromium (Desktop, Pixel 7) und WebKit (iPhone 14). Ein manueller Durchgang in Google Chrome, Firefox oder Safari auf echten Geräten ist nicht belegt.
- Die Signaturseite ist nicht mit Screenreadern im Volltest geprüft. Vor dem Einsatz gegenüber Verbrauchern sollte das nachgeholt werden.

## Grenzen der Schutzmaßnahmen

- **Root-Zugriff:** Wer Root auf dem Server hat, kann laufende Vorgänge und den Hauptschlüssel lesen und die Datenbank ändern. Datenbank-Trigger verhindern Änderungen nur über die Anwendung. Gegen Root bleiben die Erkennung über die Hash-Kette, die externe Verankerung und ab Abschluss das Siegel mit Abschlussbestätigung.
- **Ohne Zeitstempeldienst** schützt die Verankerung nicht gegen jemanden mit vollem Serverzugriff; **ohne Vertrauensanker** ist der Aussteller eines Zeitstempels nicht geprüft. Mit beidem wird eine nachträgliche Fälschung an späten Zeitstempeln und am Rückdatierungsverzug erkennbar.
- **Vor der ersten Verankerung** eines Vorgangs kann Root dessen Ereignisse unbemerkt neu berechnen. Zwischen zwei Verankerungen (Standard: 60 Minuten) sind neue Ereignisse nur intern geschützt.
- **Datenbank im Klartext:** Namen, E-Mail-Adressen, Titel, Feldwerte und der Audit-Trail liegen unverschlüsselt in der Datenbank. Schutz nur durch Festplattenverschlüsselung des Servers.
- **Aufbewahrung** löscht Inhalte (Dateien, Feldwerte), behält aber den Audit-Trail sowie Namen und E-Mail-Adressen der Beteiligten.
- **Kompromittiertes Postfach** einer unterzeichnenden Person: Bei Zugang per Link oder E-Mail-Code kann ein Angreifer unterschreiben. Abhilfe: SMS-Code oder Zugangscode auf einem zweiten Weg.

Die vollständige Einordnung steht in [Kapitel 14](14-sicherheit-und-nachweis.md#die-grenzen-bei-root-zugriff-kennen).

---

← [16. Tests und Nachweise](16-tests-und-nachweise.md) · [Inhalt](README.md) · [18. Installation mit Claude Code](18-installation-mit-claude-code.md) →
