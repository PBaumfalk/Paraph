# 7. Recht: Signaturstufen, Formvorschriften, Datenschutz

Dieses Kapitel ordnet ein, was eine Unterschrift mit Paraph rechtlich leistet und was nicht. Es richtet sich an Anwältinnen und Anwälte, die entscheiden, welche Dokumente sie über Paraph unterschreiben lassen, und an die Kanzleileitung, die Paraph datenschutzkonform betreiben muss.

> **Wichtig:** Dieses Kapitel ist eine technische Einordnung, keine Rechtsberatung. Die rechtlichen Inhalte von Paraph, also Formhinweis-Katalog, Erklärungstexte und Hinweise in der Oberfläche, sind **anwaltlich nicht freigegeben**. Ob eine Erklärung im Einzelfall formwirksam ist, prüfen Sie selbst.

## Stand der anwaltlichen Freigabe

Die rechtlichen Prüfpunkte stehen in `docs/recht/FREIGABELISTE.md`, die Begründungen in `docs/recht/formhinweise-analyse.md`. Beide sind eine technische Vorbereitung vom 22.10.2026 und tragen den Status **„NICHT ANWALTLICH FREIGEGEBEN“**. Kein Punkt der Liste ist bisher abgehakt.

| Gruppe | Inhalt | Bedeutung |
|---|---|---|
| A – vor Produktivstart zwingend | F-01 bis F-16: Katalog als Ganzes, Erklärungstexte, Datenschutzinformation, Auftragsverarbeitung, Berufsrecht, Aufbewahrung, Offenlegung von IP-Adressen, Textform, riskante Texte, QES-Abgrenzung, Plattformsiegel, Bestätigungstexte, Beweiswert, Datenschutz-Folgenabschätzung, Stufentexte | Ein offener Punkt der Gruppe A blockiert nach der Liste den Produktivstart. |
| B – vor Nutzung des jeweiligen Dokumenttyps | F-20 bis F-42: jede Regel des Formhinweis-Katalogs einzeln, neue Regeln, Mustervorlagen, Geldwäschegesetz | Eine Regel darf erst nach ihrer Freigabe als „geprüft“ gelten. |
| C – später | F-50 bis F-60: einzelne Formulierungen, qualifizierter Zeitstempel, Behörden und Gerichte, Barrierefreiheit, Anpassung des Handbuchs | keine Sperrwirkung |

Einige Formulierungsvorschläge der Vorprüfung sind in Version 0.2.0 bereits umgesetzt, etwa der neue Erklärungstext (Version `2026-10-2`), die Checkbox „Ich stimme der obigen Erklärung zu.“, „Zugangsnachweis“ statt „Identitätsprüfung“ in der Abschlussbestätigung und die SMS ohne Dokumenttitel. Auch diese Texte sind damit **nicht** freigegeben; sie gehören zu den jeweiligen Punkten der Liste.

Dieses Kapitel gibt den Stand der Vorprüfung wieder. Nach der Freigabe ist es anzupassen (F-60).

## Signaturstufen unterscheiden

Die Verordnung (EU) Nr. 910/2014 (eIDAS-VO) kennt drei Stufen:

| Stufe | Fundstelle | Kern |
|---|---|---|
| Einfache elektronische Signatur (EES) | Art. 3 Nr. 10 | Daten in elektronischer Form, die anderen elektronischen Daten beigefügt oder logisch mit ihnen verbunden sind und die der Unterzeichner zum Unterzeichnen verwendet |
| Fortgeschrittene elektronische Signatur (FES) | Art. 3 Nr. 11, Anforderungen in Art. 26 | eindeutig dem Unterzeichner zugeordnet, ermöglicht seine Identifizierung, mit Daten erstellt, die er mit hohem Maß an Vertrauen unter seiner alleinigen Kontrolle verwenden kann, und so mit den Daten verbunden, dass nachträgliche Änderungen erkennbar sind |
| Qualifizierte elektronische Signatur (QES) | Art. 3 Nr. 12 | FES, erstellt mit einer qualifizierten Signaturerstellungseinheit und beruhend auf einem qualifizierten Zertifikat eines qualifizierten Vertrauensdiensteanbieters |

Art. 25 Abs. 1 eIDAS-VO: Einer elektronischen Signatur darf die Rechtswirkung und die Zulässigkeit als Beweismittel nicht allein deshalb abgesprochen werden, weil sie elektronisch ist oder die Anforderungen an die QES nicht erfüllt. Art. 25 Abs. 2: Eine QES hat die gleiche Rechtswirkung wie eine handschriftliche Unterschrift.

Im deutschen Recht ersetzt nur die QES die gesetzliche Schriftform (§ 126 Abs. 3, § 126a BGB), sofern das Gesetz die elektronische Form nicht ausschließt. Für Textform (§ 126b BGB) und formfreie Erklärungen genügt in der Regel auch eine EES.

## Wissen, was Paraph leistet

Paraph erzeugt **einfache elektronische Signaturen** im Sinne von Art. 3 Nr. 10 eIDAS-VO. Die Unterzeichnung wird dokumentiert durch:

- einen persönlichen Link, auf Wunsch zusätzlich einen Einmalcode per E-Mail oder SMS oder einen Zugangscode,
- eine ausdrückliche Erklärung vor dem Abschluss; der Text ist versioniert, Version und Fingerabdruck werden protokolliert. Er nennt die Stufe EES, stellt klar, dass sie keine qualifizierte Signatur ist und Schrift- oder notarielle Form nicht ersetzt, und zählt die protokollierten Merkmale auf ([Kapitel 5](05-so-unterschreiben-mandanten.md#abschließend-bestätigen)),
- die Bindung an die maßgebliche Fassung über SHA-256,
- einen Audit-Trail als Hash-Kette mit Zeitpunkten, IP-Adresse und Browserkennung,
- das Plattformsiegel und die Abschlussbestätigung.

Die Abschlussbestätigung nennt die Stufe ausdrücklich: „Einfache elektronische Signatur (EES) i. S. v. Art. 3 Nr. 10 eIDAS-VO. Sie ersetzt nicht die gesetzliche Schriftform (§ 126 BGB) und erfüllt nicht die elektronische Form (§ 126a BGB), die eine qualifizierte elektronische Signatur voraussetzt.“

## Wissen, was Paraph nicht beansprucht

- **Keine FES.** Paraph behauptet nicht, die Anforderungen des Art. 26 eIDAS-VO zu erfüllen. Insbesondere die Identifizierung des Unterzeichners und die alleinige Kontrolle über die Signaturerstellungsdaten sind bei Link und Einmalcode nicht gewährleistet. Der Zugangsnachweis belegt den Zugriff auf Postfach oder Mobilnummer, keine Identität.
- **Keine QES.** Paraph ist an keinen qualifizierten Vertrauensdiensteanbieter angebunden. Die Stufe „QES“ ist im Datenmodell vorgesehen, Vorgänge mit dieser Stufe lassen sich aber nicht versenden. Unter Einstellungen → Siegel und Signaturstufen steht bei der QES „nicht eingerichtet“ ([Kapitel 17](17-grenzen.md)).
- **Kein Identifizierungsverfahren.** Nach der Vorprüfung genügt eine EES mit Einmalcode nicht für die Identifizierung nach § 12 Abs. 1 GwG; diese erfolgt außerhalb von Paraph (F-42, nicht freigegeben).

Die Texte unter Einstellungen → Siegel und Signaturstufen sind ebenfalls nicht freigegeben. Die Vorprüfung schlägt dort Änderungen vor: bei der QES „Ermöglicht die elektronische Form nach § 126a BGB, soweit das Gesetz sie nicht ausschließt“ statt „Erfüllt die elektronische Form …“ (F-11) und bei der FES „nach unserer Einschätzung“ statt „nach überwiegender Ansicht“ (F-51).

## Das Plattformsiegel richtig einordnen

Das fertige PDF trägt eine digitale Signatur nach PAdES. Sie stammt von der **Paraph-Instanz** (oder vom importierten Zertifikat der Organisation), nicht von den Unterzeichnern. Sie belegt:

- das PDF stammt von dieser Instanz,
- es wurde seit dem Versiegeln nicht verändert,
- mit Zeitstempeldienst: es existierte spätestens zum Zeitpunkt des Zeitstempels.

Sie belegt **nicht** die Identität der Unterzeichner. Mit dem standardmäßig selbst signierten Zertifikat ist das Siegel weder ein fortgeschrittenes noch ein qualifiziertes elektronisches Siegel im Sinne der eIDAS-VO. PDF-Programme zeigen „Aussteller unbekannt“, bis das Zertifikat bewusst als vertrauenswürdig markiert wird ([Kapitel 6](06-dokumente-pruefen.md#das-siegel-mit-pdf-programmen-prüfen)).

Der Zeitstempeldienst FreeTSA, die Vorgabe der Installation, ist kein qualifizierter Zeitstempeldienst; die Vermutung nach Art. 41 Abs. 2 eIDAS-VO greift nicht (F-55).

## Beweiswert einordnen

Die Vorprüfung (Analyse Teil D, Freigabeliste F-14) ordnet den Beweiswert so ein:

- § 371a Abs. 1 ZPO mit dem Anschein der Echtheit gilt nur für die QES.
- Für die EES greift § 371a ZPO nicht. Ihr Beweiswert unterliegt der freien Beweiswürdigung (§ 286 ZPO). Bestreitet die Gegenseite die Urheberschaft, sind Audit-Trail, Hash-Kette, Zeitstempel und Zugangsweg Indizien, kein Anscheinsbeweis.
- Das Plattformsiegel begründet als weder fortgeschrittenes noch qualifiziertes Siegel keine Vermutung nach Art. 35 Abs. 2 eIDAS-VO.

Die Vorprüfung empfiehlt eine interne Arbeitsanweisung: für beweiskritische Erklärungen, etwa Vergleiche oder Vergütungsvereinbarungen, mindestens einen E-Mail- oder SMS-Code, das Abschluss-PDF als Anhang und einen aktiven Zeitstempeldienst. Außendarstellungen als „rechtssicher“, „beweissicher“ oder „gerichtsfest“ sollen unterbleiben. Diese Einordnung ist **nicht freigegeben**.

Was Sie im Streitfall vorlegen können, beschreibt [Kapitel 6](06-dokumente-pruefen.md#was-sie-einem-gericht-vorlegen).

## Formvorschriften beachten

### Den Formhinweis-Katalog kennen

Paraph enthält einen regelbasierten Katalog deutscher Formvorschriften (`src/shared/formrules.ts`, Stand 22.10.2026, Gesetzestexte von gesetze-im-internet.de). Er gibt Hinweise und Anlass zur Prüfung, er entscheidet keine Einzelfälle. **Der Katalog ist vor dem Produktiveinsatz anwaltlich freizugeben; die Freigabe steht aus** (F-01, Einzelregeln F-20 bis F-39).

| Dokumentart | Norm | Mindestform laut Katalog | Sicherheit laut Katalog |
|---|---|---|---|
| Kündigung oder Aufhebungsvertrag eines Arbeitsverhältnisses | § 623 BGB | Papier | hoch |
| Bürgschaftserklärung | § 766 BGB | Papier | hoch |
| Schuldversprechen oder Schuldanerkenntnis | §§ 780, 781 BGB | Papier | hoch |
| Testament | § 2247 BGB | Papier | hoch |
| Notariell zu beurkundendes Geschäft | §§ 311b, 518, 1410, 2276, 2348 BGB; §§ 2, 15 GmbHG | notarielle Beurkundung | hoch |
| Befristung eines Arbeitsvertrags | § 14 Abs. 4 TzBfG | QES | hoch |
| Arbeitszeugnis | § 109 GewO | QES | hoch |
| Nachvertragliches Wettbewerbsverbot | § 74 HGB | QES | mittel |
| Betriebsvereinbarung | § 77 Abs. 2 BetrVG | QES | hoch |
| Verbraucherdarlehensvertrag | § 492 BGB | QES | hoch |
| Kündigung eines Wohnraummietverhältnisses | § 568 BGB | QES | hoch |
| Wohnraummietvertrag über mehr als ein Jahr | § 550 BGB | QES | hoch |
| Schiedsvereinbarung mit Verbraucher | § 1031 Abs. 5 ZPO | QES | hoch |
| Gewerbemietvertrag | § 578 BGB | Textform | hoch |
| Anwaltliche Vergütungsvereinbarung | § 3a RVG | Textform | hoch |
| Haftungsbeschränkung im Mandat | § 52 BRAO | Textform | hoch |
| Vollmacht (Prozess- oder Kündigungsvollmacht) | § 80 ZPO, § 174 BGB | Papier | niedrig |
| Arbeitsvertrag / Nachweis der Arbeitsbedingungen | § 2 NachwG | Textform | hoch |
| Datenschutz-Einwilligung | Art. 7 DSGVO | keine | mittel |
| Mandatsvertrag, Auftrag, Schweigepflichtentbindung | – | keine | mittel |

Zu jeder Regel zeigt Paraph beim Versand einen Hinweistext und einen Link auf den Gesetzestext. Für die Vergütungsvereinbarung (§ 3a RVG) enthält der Katalog zusätzlich eine Prüfliste zu den inhaltlichen Anforderungen. Den Katalog liefert auch die API unter `GET /api/v1/form-rules`.

Die Mindestform erscheint als Stufentext:

| Stufe | Text in Paraph | Wirkung beim Versand |
|---|---|---|
| keine | „Keine gesetzliche Form“ | nur Hinweis |
| Textform | „Textform genügt – einfache elektronische Signatur reicht, wenn alle Parteien das unterschriebene PDF dauerhaft erhalten“ | nur Hinweis |
| QES | „Schriftform – elektronisch nur mit QES“ | Bestätigung erforderlich |
| Papier | „Papier mit Originalunterschrift erforderlich bzw. empfohlen“ | Bestätigung erforderlich |
| Notar | „Notarielle Beurkundung erforderlich“ | Bestätigung erforderlich |

Offene Punkte der Vorprüfung, die Sie kennen sollten:

- **Stufe „Papier“** vermischt zwingende Papierform (§ 623 BGB) mit einer bloßen Empfehlung (§ 80 ZPO, § 174 BGB). Vorgeschlagen ist eine eigene Stufe „Papieroriginal empfohlen“ ohne Sperrwirkung (F-16). Die Vollmacht-Regel sagt selbst, dass für das Mandat eine einfache Signatur genügt und offen ist, ob eine elektronische Vollmacht gegenüber Gericht oder bei einseitigen Erklärungen genügt (F-36).
- **Verbraucherdarlehen:** Die Vorprüfung nennt eine Neufassung des Verbraucherkreditrechts ab 20.11.2026; ob sie die Form ändert, ist unverifiziert. Die Regel ist vor diesem Datum erneut zu prüfen (F-29).
- **Wettbewerbsverbot:** Ob eine elektronische Aushändigung der Urkunde genügt, ist nach dem Katalog nicht abschließend geklärt.

### Wissen, wie die Formhinweise arbeiten

1. Beim Hochladen durchsucht Paraph Titel und Dokumenttext nach Schlüsselwörtern und **schlägt** passende Dokumentarten vor; sie erscheinen im Versanddialog als „erkannt“. Es gibt keine KI und keine Einzelfallprüfung. Treffer können fehlen oder falsch sein.
2. Die absendende Person ordnet den Vorgang unter „Dokumentart und Formvorschriften“ einer oder mehreren Dokumentarten zu oder entfernt Vorschläge ([Kapitel 2](02-dokument-unterschreiben-lassen.md)).
3. Verlangt eine zugeordnete Regel Papier, notarielle Beurkundung oder (bei Stufe EES) die QES, **blockiert Paraph den Versand**, bis die Person den Hinweis ausdrücklich bestätigt. Regeln mit Textform oder ohne Form zeigt Paraph nur als Hinweis an.
4. Die Bestätigung wird mit Person (E-Mail-Adresse bzw. API-Schlüssel), Zeitpunkt, betroffenen Regeln und Signaturstufe im Vorgang gespeichert, als Ereignis `form.risk_acknowledged` in den Audit-Trail geschrieben und in der Abschlussbestätigung vermerkt.
5. Ändert sich die Zuordnung danach, verfällt die Bestätigung.

Der Text der Bestätigung lautet bei Papier oder Notar: „Mir ist bewusst, dass eine elektronische Unterschrift für dieses Dokument nach dem Katalog nicht genügt. Ich versende es trotzdem, z. B. als Entwurf oder Vorabfassung.“ Bei QES: „Ich habe den Formhinweis gelesen. Mir ist bewusst, dass die gesetzliche Form mit einer einfachen elektronischen Signatur nicht gewahrt wird.“ Jeweils mit dem Zusatz „Die Bestätigung wird protokolliert.“

Die Bestätigung bedeutet nicht, dass die Form gewahrt ist. Sie dokumentiert nur, dass die absendende Person den Hinweis gesehen hat.

### Textform: dem Empfänger eine dauerhafte Kopie geben

Wo Textform genügt (z. B. § 3a RVG, § 578 BGB, § 2 NachwG), sollte jede Partei das unterschriebene PDF dauerhaft erhalten. Ob ein Downloadlink auf den Kanzleiserver dafür genügt, ist eine offene Frage der Vorprüfung (F-09); Einstellungen → Organisation weist darauf hin, dass ein Link allein möglicherweise nicht ausreicht.

Standardmäßig enthält die Abschluss-E-Mail nur den persönlichen Link. Mit der Einstellung „Fertiges PDF an die Abschluss-E-Mail anhängen (sonst nur persönlicher Link)“ erhalten alle Beteiligten das PDF als Anhang ([Kapitel 8](08-kanzlei-team-erscheinungsbild.md)). Übergeben Sie die Links selbst statt per E-Mail, dokumentieren Sie die Übergabe der Kopie.

## Behörden und Gerichte

Die Freigabeliste empfiehlt dazu Hinweise im Handbuch (Gruppe C, nicht freigegeben):

- **Behörden:** Nach § 3a VwVfG ersetzt eine EES dort keine Schriftform. Alternativen sind die QES oder ein Weg nach § 3a Abs. 3 Nr. 2 VwVfG wie das beA (F-57).
- **Gerichte:** Ein Paraph-PDF ist kein Schriftsatz im Sinne von § 130a Abs. 3 ZPO. Die Einreichung erfolgt über das beA mit einfacher Signatur der Anwältin oder des Anwalts oder mit QES (F-58).

## Mustervorlagen anpassen

Mitgelieferte oder in der Oberfläche vorgeschlagene Vorlagen und Texte, z. B. eine Mandatsvereinbarung, sind **Beispiele**. Sie sind nicht auf Ihren Fall geprüft und vor der Verwendung anzupassen (F-41).

## Datenschutz einhalten

Sie betreiben Paraph auf Ihrem eigenen Server und sind Verantwortlicher im Sinne der DSGVO. Rechtsgrundlage, Informationspflichten nach Art. 13 und 14 DSGVO und das Löschkonzept legen Sie fest.

### Wissen, welche Daten Paraph speichert

| Bereich | Daten |
|---|---|
| Beteiligte | Name, E-Mail-Adresse, optional Mobilnummer, Rolle, Status und Zeitpunkte (versendet, geöffnet, abgeschlossen, abgelehnt), Ablehnungs- oder Vertretungsgrund |
| Audit-Trail je Vorgang | Ereignisse mit Zeitpunkt und Akteur (Name, E-Mail); beim Öffnen, Abschließen und Ablehnen **IP-Adresse und Browserkennung**, bei Vertretung und falschen Codes die IP-Adresse; Erklärungstext mit Fingerabdruck; maskierte Zieladresse für Einmalcodes |
| Inhalte | Dokumente, Feldwerte, Unterschriftsbilder, Anhänge (Dateien verschlüsselt) |
| Konten | Name, E-Mail, Passwort-Hash, Sitzungen mit IP und Browserkennung, Aktivitätsprotokoll mit IP |
| Kontakte | Name, E-Mail, Mobilnummer der Beteiligten echter Vorgänge, für die Schnellauswahl |
| E-Mail-Ausgang | Empfänger, Betreff, Status; Inhalt nur bis zum Versand |
| Webhook-Zustellungen | Ereignisdaten, z. B. die E-Mail-Adresse bei `recipient.notified` |

### Aufbewahrung und Löschung festlegen

Unter Einstellungen → Organisation → „Aufbewahrung“ wählen Sie „Unbegrenzt aufbewahren“ (Standard) oder das Löschen der Dokumente 90, 180, 365, 730, 2190 oder 3650 Tage nach Abschluss ([Kapitel 8](08-kanzlei-team-erscheinungsbild.md)). Die Oberfläche erinnert an § 50 BRAO (6 Jahre Handakte).

- **Inhalte** (Dateien, Feldwerte, Unterschriftsbilder): bis zur Löschung nach der Aufbewahrungsfrist, sonst unbegrenzt. Mit gelöscht werden Textauszüge, die Nachricht des Absenders, Ablehnungsgründe, Mobilnummern und die E-Mail-Datensätze des Vorgangs.
- **Audit-Trail, Beteiligte und Fingerabdrücke** bleiben auch nach der Inhaltslöschung erhalten (Nachweisfunktion).
- **E-Mail-Datensätze:** 90 Tage. **Webhook-Zustellungen:** 30 Tage.
- **Sicherungen** enthalten den Stand zum Zeitpunkt der Sicherung, bis sie rotiert oder gelöscht werden.

Offen nach der Vorprüfung (F-07): Der Audit-Trail mit Namen, E-Mail, IP-Adresse und Browserkennung bleibt derzeit unbegrenzt erhalten. Mit Art. 5 Abs. 1 lit. e DSGVO ist das nur mit einer festgelegten Höchstfrist vereinbar. Die Liste nennt dazu § 50 Abs. 1 BRAO, § 147 AO und § 257 HGB und empfiehlt ein Löschkonzept, das auch den Audit-Trail und die Sicherungen umfasst.

### Datenschutzhinweise verlinken

Unter Einstellungen → Organisation hinterlegen Sie im Feld „Datenschutzhinweise für Unterzeichner (Art. 13 DSGVO)“ einen Link (https-Adresse) auf Ihre Datenschutzhinweise. Die Signaturseite zeigt ihn im Fenster „Abschließend bestätigen“ neben der Erklärung als „Hinweise zum Datenschutz ({Organisation})“. Die Adresse wird beim Abschluss im Audit-Trail vermerkt. Ohne Link meldet die Betriebsdiagnose einen Hinweis.

Den Inhalt der Hinweise erstellen Sie selbst; er ist nicht Teil von Paraph. Die Vorprüfung empfiehlt, den Link vor dem Produktivbetrieb verbindlich zu setzen und auch auf der Startseite der Unterzeichnung und in jeder Einladungs-E-Mail zu zeigen; das ist derzeit nicht umgesetzt (F-04). Den Mindestinhalt nach Art. 13 DSGVO listet die Analyse in Abschnitt C6.

### Die Offenlegung von IP-Adressen bedenken

Die Abschlussbestätigung geht an alle Beteiligten und enthält IP-Adresse und Gerät **jeder** beteiligten Person, unter Umständen also auch die der Gegenseite. Ob das erforderlich und von welcher Rechtsgrundlage gedeckt ist, ist offen (F-08). Erwähnen Sie es zumindest in Ihren Datenschutzhinweisen.

### Auftragsverarbeitung und Berufsrecht klären

Paraph selbst ist Software auf Ihrem Server; es gibt keinen Anbieter, der Daten für Paraph verarbeitet. Ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) kommt nur in Betracht, soweit Sie externe Dienste einbinden:

| Dienst | erhält |
|---|---|
| SMTP-Anbieter | Empfängeradresse, Betreff, Text mit Link; beim Abschluss den Prüfwert und optional das PDF als Anhang |
| SMS-Gateway | Mobilnummer, Code und den Namen der Organisation, nicht den Titel des Dokuments |
| Zeitstempeldienst | nur Hashwerte (des Siegels und der Anker der Audit-Ketten), keine Inhalte |
| S3-Speicher | verschlüsselte Dateien |
| Hoster | den Server, falls Sie ihn nicht selbst betreiben |

Sicherungen verlassen den Server nur vollständig verschlüsselt, sofern Sie die Dateien aus `backups/` kopieren ([Kapitel 13](13-sicherung-und-updates.md)).

Offen nach der Vorprüfung:

- **Auftragsverarbeitung (F-05):** Für welche Anbieter ein Vertrag nötig ist, insbesondere beim Zeitstempeldienst (Tendenz der Vorprüfung: kein Vertrag, weil kein Personenbezug erkennbar), und wie mit Anbietern außerhalb von EU/EWR umzugehen ist (Art. 44 ff. DSGVO).
- **Berufsrecht (F-06):** Vereinbarungen nach § 43e BRAO mit allen Dienstleistern; ob § 43e Abs. 5 BRAO (Einwilligung des Mandanten bei Diensten, die unmittelbar einem einzelnen Mandat dienen) den Versand je Vorgang betrifft; Verschwiegenheit nach § 43a Abs. 2 BRAO und § 203 StGB. Der Titel des Vorgangs steht im Betreff der Einladung und ist damit für Mailanbieter und Empfänger sichtbar. Verwenden Sie keine Titel mit Mandantennamen, wenn das nicht gewollt ist.
- **Datenschutz-Folgenabschätzung (F-15):** Schwellwertanalyse dokumentieren, im Zweifel eine Folgenabschätzung nach Art. 35 DSGVO durchführen; Eintrag im Verzeichnis nach Art. 30 DSGVO.

## Vor dem Produktivbetrieb erledigen

Aus den Quellen ergibt sich diese Liste. Sie ersetzt nicht die Freigabeliste.

- [ ] Freigabeliste Gruppe A anwaltlich abarbeiten (`docs/recht/FREIGABELISTE.md`).
- [ ] Regeln des Formhinweis-Katalogs freigeben, bevor Sie den jeweiligen Dokumenttyp über Paraph laufen lassen (Gruppe B).
- [ ] Datenschutzhinweise erstellen und unter Einstellungen → Organisation verlinken.
- [ ] Aufbewahrungsfrist und Löschkonzept festlegen, einschließlich Audit-Trail und Sicherungen.
- [ ] Verträge mit externen Diensten (SMTP, SMS, S3, Hoster) prüfen und abschließen.
- [ ] Für Textform-Dokumente sicherstellen, dass alle Parteien das PDF dauerhaft erhalten.
- [ ] Interne Arbeitsanweisung für beweiskritische Dokumente festlegen (Zugangsschutz, PDF-Anhang, Zeitstempeldienst).

---

← [6. Dokumente prüfen](06-dokumente-pruefen.md) · [Inhalt](README.md) · [8. Kanzlei, Team und Erscheinungsbild einrichten](08-kanzlei-team-erscheinungsbild.md) →
