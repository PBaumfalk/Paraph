# Glossar

Begriffe, die im Handbuch vorkommen, von A bis Z. Jeder Eintrag nennt das Kapitel, das den Begriff ausführlich erklärt. Oberflächenbegriffe stehen so, wie Paraph sie anzeigt.

## A

**Abgleich mit Verankerung** – Teil der Tiefenprüfung und von `paraph verify-audit`: Vergleicht jeden verankerten Kettenkopf mit dem heutigen Stand des Vorgangs und prüft Ankerkette, Merkle-Wurzeln und Zeitstempel. → [Kapitel 15](15-diagnose-und-fehlersuche.md)

**Ablauf** – Ein Vorgang hat eine Gültigkeit. Danach lässt er sich nicht mehr unterschreiben; Links werden ungültig. → [Kapitel 3](03-vorgaenge-verfolgen.md)

**Ablehnung** – Eine beteiligte Person lehnt mit Begründung ab. Der Vorgang ist damit beendet. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 5](05-so-unterschreiben-mandanten.md)

**Abschluss** – Haben alle Beteiligten ihren Teil erledigt, erzeugt Paraph das unterschriebene PDF, die Abschlussbestätigung, den Audit-Export und das Nachweispaket und versiegelt sie. Der Abschluss prüft vorher die Audit-Kette und bricht bei Abweichungen ab. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 14](14-sicherheit-und-nachweis.md)

**Abschlussbestätigung** – Versiegeltes PDF mit allen Beteiligten, Zeitpunkten, Zugangsverfahren, IP-Adressen, Dokument-Hashes, Kettenkopf und Formhinweisen. Kann an das unterschriebene PDF angehängt werden. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 6](06-dokumente-pruefen.md)

**Akzentfarbe** – Farbe der Kanzlei in Oberfläche und E-Mails. Standard ist Petrol (`#0D5C63`). → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

**Aktivität** – Protokoll der Organisation: wer wann was in Paraph getan hat, über alle Vorgänge. → [Kapitel 3](03-vorgaenge-verfolgen.md)

**Anker** – Eintrag der externen Verankerung: Merkle-Wurzel über die Kettenköpfe vieler Vorgänge, verkettet mit dem vorherigen Anker und, mit Zeitstempeldienst, extern gestempelt. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Ankertext-Feld** – Feld, das über die API nicht mit Koordinaten, sondern über einen Text im Dokument platziert wird. → [Kapitel 10](10-anbindung-api-webhooks.md)

**API-Schlüssel** – Zugang für Programme (Kanzleisoftware, n8n, Make) zur REST-API, mit Scopes und Modus live oder test. Gespeichert nur als Hash. → [Kapitel 10](10-anbindung-api-webhooks.md)

**Audit-Trail** – Lückenlose Liste aller Ereignisse eines Vorgangs (Versand, Öffnen, Codeprüfung, Unterschrift, Abschluss …) mit Zeit, Akteur und Daten, geführt als Hash-Kette. In der Oberfläche heißt er „Verlauf“. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 14](14-sicherheit-und-nachweis.md)

**Aufbewahrung** – Einstellung der Organisation, nach welcher Frist Inhalte abgeschlossener Vorgänge gelöscht werden. Der Audit-Trail sowie Namen und E-Mail-Adressen bleiben. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md), [Kapitel 7](07-recht.md)

## B

**Beteiligte** – Alle Personen eines Vorgangs mit ihrer Rolle: „Unterschreibt“, „Gibt frei“, „Füllt aus“, „Erhält Kopie“, „Zeuge“. → [Kapitel 1](01-paraph-in-fuenf-minuten.md), [Kapitel 2](02-dokument-unterschreiben-lassen.md)

**Betriebszustand** – Abschnitt unter Einstellungen → System mit allen Prüfungen der Betriebsdiagnose. → [Kapitel 15](15-diagnose-und-fehlersuche.md)

## C

**Caddy** – Mitgelieferter Reverse Proxy (Profil `caddy`) mit automatischem HTTPS über Let's Encrypt. → [Kapitel 11](11-installation.md)

**CSRF** – Angriff, bei dem eine fremde Website Anfragen im Namen einer angemeldeten Person auslöst. Paraph verlangt dafür ein Token im Header und prüft die Herkunft. → [Kapitel 14](14-sicherheit-und-nachweis.md)

## D

**Datenschutzhinweis-Link** – Link auf die Datenschutzhinweise der Kanzlei (Art. 13 DSGVO), den Paraph auf der Signaturseite zeigt. Fehlt er, meldet die Diagnose einen Hinweis. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md), [Kapitel 7](07-recht.md)

## E

**EES (einfache elektronische Signatur)** – Die Signaturstufe, die Paraph erzeugt: ausdrückliche Erklärung, Zuordnung zur Person, gebundene Dokumentfassung, Protokoll. → [Kapitel 7](07-recht.md)

**Einbettung** – Die Signaturseite lässt sich in eine eigene Website einbinden (`/embed/s/…`), mit Einbettungslinks, die 10 Minuten und nur einmal gelten. → [Kapitel 10](10-anbindung-api-webhooks.md)

**Einmalcode** – Sechsstelliger Code per E-Mail oder SMS als Zugangsschutz, 10 Minuten gültig. Belegt Zugriff auf Postfach oder Rufnummer, nicht die Identität. → [Kapitel 2](02-dokument-unterschreiben-lassen.md), [Kapitel 5](05-so-unterschreiben-mandanten.md)

**Einrichtungscode** – Code für die Ersteinrichtung unter `/setup`, solange noch kein Konto existiert. Anzeige mit `paraph setup-code`. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md), [Kapitel 11](11-installation.md)

**Entwurf** – Vorgang vor dem Versand. Entwürfe werden nicht verankert. → [Kapitel 2](02-dokument-unterschreiben-lassen.md)

**Erinnerung** – Neue E-Mail mit neuem Link an eine Person, die noch nicht fertig ist. Der unmittelbar vorherige Link bleibt gültig. → [Kapitel 3](03-vorgaenge-verfolgen.md)

## F

**Felder** – Stellen im Dokument, die Beteiligte ausfüllen: zwölf Typen von Unterschrift und Paraphe über Text, Datum und Auswahl bis Formel und Anhang. → [Kapitel 2](02-dokument-unterschreiben-lassen.md)

**FES (fortgeschrittene elektronische Signatur)** – Höhere Signaturstufe nach eIDAS. Paraph beansprucht sie nicht. → [Kapitel 7](07-recht.md)

**Fingerabdruck** – Anderes Wort für einen Hashwert, etwa eines Zertifikats oder einer Datei. → [Kapitel 6](06-dokumente-pruefen.md)

**Formhinweis** – Hinweis beim Versand, wenn ein Dokument nach Schlüsselwörtern einer Formvorschrift unterliegen könnte; muss bestätigt werden. Regelbasiert und anwaltlich nicht freigegeben. → [Kapitel 2](02-dokument-unterschreiben-lassen.md), [Kapitel 7](07-recht.md)

**FreeTSA** – Kostenloser, nicht qualifizierter RFC-3161-Zeitstempeldienst, Vorgabe von `install.sh`. → [Kapitel 14](14-sicherheit-und-nachweis.md), [Kapitel 11](11-installation.md)

## G

**Gotenberg** – Isolierter Container, der Word-, ODT- und RTF-Dateien in PDF umwandelt, ohne Internetzugang. → [Kapitel 11](11-installation.md), [Kapitel 14](14-sicherheit-und-nachweis.md)

## H

**Hash (SHA-256)** – Kurzer, eindeutiger Prüfwert einer Datei oder eines Datensatzes. Schon ein geändertes Byte ergibt einen völlig anderen Wert. → [Kapitel 6](06-dokumente-pruefen.md)

**Hash-Kette** – Jeder Eintrag des Audit-Trails enthält den Hash seines Vorgängers. Wer einen Eintrag ändert, einfügt oder löscht, bricht die Kette ab dieser Stelle. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Hauptschlüssel** – 32-Byte-Schlüssel (`MASTER_KEY_FILE`), aus dem Paraph alle Verschlüsselungsschlüssel ableitet. Ohne ihn sind die Dokumente nicht lesbar. → [Kapitel 12](12-konfiguration.md), [Kapitel 13](13-sicherung-und-updates.md)

## I

**Idempotency-Key** – Header, mit dem ein Programm eine API-Anfrage gefahrlos wiederholen kann: Dieselbe Anfrage liefert die gespeicherte Antwort, eine abweichende wird abgewiesen. → [Kapitel 10](10-anbindung-api-webhooks.md)

**Instanz** – Eine Paraph-Installation auf einem Server. Sie kann mehrere Organisationen enthalten. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

**Instanz-Administration** – Konten mit Zugriff auf Einstellungen → System, die Benutzerverwaltung der Instanz und die Organisationen. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

**Integrität** – Abschnitt der Vorgangsseite mit den Hashes der maßgeblichen Fassung und des unterschriebenen PDFs, der Siegelstufe und dem Kettenkopf. → [Kapitel 3](03-vorgaenge-verfolgen.md)

## K

**Kettenkopf** – Hash des letzten Eintrags einer Audit-Kette. Er steht für den gesamten Verlauf bis dahin. → [Kapitel 14](14-sicherheit-und-nachweis.md)

## L

**Linkübergabe** – Paraph versendet keine Einladungen (`notify: false`); die Kanzleisoftware übergibt die Signaturlinks selbst, etwa aus j-lawyer. → [Kapitel 10](10-anbindung-api-webhooks.md)

## M

**Massenversand** – Aus einer veröffentlichten Vorlage entsteht je Zeile einer CSV- oder XLSX-Datei ein eigener Vorgang, nach einem Probelauf. → [Kapitel 4](04-vorlagen-serien-formulare.md)

**Maßgebliche Fassung** – Das PDF, das nach Hochladen, Umwandlung und Bereinigung feststeht und das alle Beteiligten sehen und unterschreiben. Sein Hash bindet jede Unterschrift. → [Kapitel 1](01-paraph-in-fuenf-minuten.md), [Kapitel 6](06-dokumente-pruefen.md)

**Merkle-Baum** – Verfahren nach RFC 6962, das viele Hashes zu einer Wurzel zusammenfasst. Mit einem kurzen Prüfpfad lässt sich zeigen, dass ein einzelner Kettenkopf in der Wurzel enthalten ist. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Metriken** – Zählwerte im Prometheus-Format unter `/metrics`, nur mit `METRICS_TOKEN`. → [Kapitel 15](15-diagnose-und-fehlersuche.md)

## N

**Nachweispaket** – ZIP-Datei zu einem abgeschlossenen Vorgang: unterschriebene PDFs, Abschlussbestätigung, Audit-Trail als JSON, maßgebliche Fassung, Original, Unterschriftsbilder, Anhänge, Verankerung, Siegelzertifikat, Prüfskript und ein versiegeltes Manifest. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 6](06-dokumente-pruefen.md)

## O

**Öffentliches Formular** – Vorlage, die jede Person über einen öffentlichen Link (`/f/…`) selbst ausfüllen und unterschreiben kann; standardmäßig bestätigt sie vorher ihre E-Mail-Adresse mit einem Einmalcode. → [Kapitel 4](04-vorlagen-serien-formulare.md)

**OIDC (OpenID Connect)** – Standard für die Anmeldung über einen zentralen Anbieter (Single Sign-on), getestet mit authentik. → [Kapitel 9](09-anmeldung-und-sso.md)

**Organisation** – Kanzlei innerhalb einer Instanz mit eigenem Team, Erscheinungsbild, Vorgängen und Einstellungen. Organisationen sind strikt getrennt. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

## P

**PAdES** – Europäischer Standard für Signaturen in PDF-Dateien. Paraph verwendet ihn für das Plattformsiegel. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**PAdES-B-B** – Grundstufe: Signatur ohne Zeitstempel. Entsteht ohne oder bei Ausfall des Zeitstempeldienstes. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**PAdES-B-T** – Signatur mit geprüftem Zeitstempel eines unabhängigen Dienstes. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Plattformsiegel** – Signatur der Paraph-Instanz auf jedem fertigen PDF, der Abschlussbestätigung und dem Manifest. Belegt, dass die Datei seit dem Abschluss unverändert ist; kein qualifiziertes Siegel und keine persönliche Signatur. → [Kapitel 14](14-sicherheit-und-nachweis.md), [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

**Prüfstelle** – Öffentliche Seite `/verify`, die eine vorgelegte Datei im Browser hasht, mit dem Register vergleicht und eingebettete Siegel prüft. → [Kapitel 6](06-dokumente-pruefen.md)

**Prüfwert** – SHA-256 des unterschriebenen Dokuments, den jede beteiligte Person in der Abschluss-E-Mail erhält. → [Kapitel 6](06-dokumente-pruefen.md)

## Q

**QES (qualifizierte elektronische Signatur)** – Höchste Signaturstufe, nur über einen qualifizierten Vertrauensdiensteanbieter. In Paraph nicht angebunden. → [Kapitel 7](07-recht.md), [Kapitel 17](17-grenzen.md)

## R

**RFC-3161-Zeitstempel** – Bestätigung eines Zeitstempeldienstes, dass ein bestimmter Hash zu einer bestimmten Zeit vorlag. Paraph prüft Signatur, Hashwert, Nonce, Zertifikat und Kette. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Rollen (Team)** – Rechte im Team einer Organisation: „Inhaber“, „Administration“, „Mitglied“, „Nur lesen“. → [Kapitel 8](08-kanzlei-team-erscheinungsbild.md)

**Rückdatierungsverzug** – Größter Abstand zwischen einem Ereignis und seiner ersten externen Bestätigung durch einen Zeitstempel. Ein großer Wert deutet auf nachträgliche Fälschung hin; `paraph verify-audit` meldet ihn. → [Kapitel 14](14-sicherheit-und-nachweis.md)

## S

**Scopes** – Berechtigungen eines API-Schlüssels. → [Kapitel 10](10-anbindung-api-webhooks.md)

**Sicherung v2** – Vollständig verschlüsselte Sicherung von Datenbank und Dokumenten, wahlweise mit dem Hauptschlüssel, geschützt durch die Wiederherstellungs-Passphrase. → [Kapitel 13](13-sicherung-und-updates.md)

**Signaturlink** – Persönlicher Link (`/s/…`), über den eine beteiligte Person unterschreibt. 256 Bit Zufall, gespeichert nur als Hash. → [Kapitel 5](05-so-unterschreiben-mandanten.md), [Kapitel 14](14-sicherheit-und-nachweis.md)

**Signaturstufe** – EES, FES oder QES. Paraph erzeugt EES. → [Kapitel 7](07-recht.md)

**Studio** – Der Editor, in dem Beteiligte, Felder und Versand eines Vorgangs oder einer Vorlage festgelegt werden. → [Kapitel 2](02-dokument-unterschreiben-lassen.md)

## T

**Testmodus** – Vorgänge oder API-Schlüssel im Modus „test“: getrennte Daten, keine E-Mails, Wasserzeichen „TEST – NICHT GÜLTIG“ im Ergebnis. → [Kapitel 3](03-vorgaenge-verfolgen.md), [Kapitel 10](10-anbindung-api-webhooks.md)

**Tiefenprüfung** – Ausführliche Betriebsdiagnose, die externe Dienste kontaktiert und alle Audit-Ketten prüft. → [Kapitel 15](15-diagnose-und-fehlersuche.md)

**TOTP** – Zeitbasierte Einmalpasswörter aus einer Authenticator-App als zweiter Faktor bei der Anmeldung. → [Kapitel 9](09-anmeldung-und-sso.md)

**TRUST_PROXY** – Einstellung, wie vielen Reverse-Proxys Paraph bei der Client-IP vertraut. `true` bedeutet genau einen. → [Kapitel 12](12-konfiguration.md), [Kapitel 15](15-diagnose-und-fehlersuche.md)

**TSA (Time Stamping Authority)** – Zeitstempeldienst nach RFC 3161, eingestellt über `TSA_URL`. → [Kapitel 14](14-sicherheit-und-nachweis.md)

## U

**Unterzeichner-Sitzung** – Sitzung von 8 Stunden, die beim Öffnen eines Signaturlinks entsteht und nur im Browser-Tab gilt. → [Kapitel 14](14-sicherheit-und-nachweis.md)

## V

**Verankerung (extern)** – Regelmäßige Zusammenfassung aller geänderten Audit-Ketten in einem Merkle-Baum, bestätigt durch einen Zeitstempeldienst. Macht eine nachträgliche Neuberechnung der Ketten sichtbar. → [Kapitel 14](14-sicherheit-und-nachweis.md)

**Vertrauensanker** – Zertifikat des Zeitstempelanbieters (`TSA_CA_FILE`, in Docker `secrets/tsa_ca.pem`). Erst damit ist geprüft, welcher Dienst einen Zeitstempel ausgestellt hat. → [Kapitel 14](14-sicherheit-und-nachweis.md), [Kapitel 12](12-konfiguration.md)

**Vertretung** – Eine Person gibt ihre Aufgabe an jemand anderen weiter; ihr Link wird ungültig. → [Kapitel 2](02-dokument-unterschreiben-lassen.md), [Kapitel 5](05-so-unterschreiben-mandanten.md)

**Vor-Ort-Signatur** – Unterschrift am Bildschirm eines angemeldeten Kanzleimitglieds, wenn die Person in der Kanzlei ist; die gastgebende Person steht im Audit-Trail und ist zur persönlichen Identitätsprüfung angehalten. → [Kapitel 4](04-vorlagen-serien-formulare.md)

**Vorgang** – Ein Dokument (oder mehrere) mit Beteiligten und Feldern, das zur Unterschrift versandt wird, vom Entwurf bis zum Abschluss. → [Kapitel 1](01-paraph-in-fuenf-minuten.md)

**Vorlage** – Wiederverwendbarer Vorgang mit Rollen statt Personen und unveränderlichen Versionen. → [Kapitel 4](04-vorlagen-serien-formulare.md)

## W

**Webhook** – Nachricht von Paraph an eine Adresse Ihrer Wahl bei Ereignissen wie „Vorgang abgeschlossen“, signiert nach „Standard Webhooks“ und bei Fehlern wiederholt. → [Kapitel 10](10-anbindung-api-webhooks.md)

**Widerruf** – Die Kanzlei zieht einen versandten Vorgang zurück; alle Links und Sitzungen werden ungültig. → [Kapitel 3](03-vorgaenge-verfolgen.md)

**Wiederherstellungs-Passphrase** – Passphrase (`BACKUP_PASSPHRASE_FILE`), die den Hauptschlüssel in jeder Sicherung schützt. Mit ihr lässt sich eine Sicherung auch auf einem neuen Server ohne alten Schlüssel wiederherstellen. → [Kapitel 13](13-sicherung-und-updates.md)

## Z

**Zugangscode** – Von der Kanzlei festgelegter Code (mindestens 6 Zeichen), den sie der Person auf einem zweiten Weg mitteilt. → [Kapitel 2](02-dokument-unterschreiben-lassen.md)

**Zugangsschutz** – Verfahren, mit dem sich eine Person vor dem Unterschreiben ausweist: nur Link, E-Mail-Code, SMS-Code oder Zugangscode. → [Kapitel 2](02-dokument-unterschreiben-lassen.md), [Kapitel 14](14-sicherheit-und-nachweis.md)

---

[Inhalt](README.md)
