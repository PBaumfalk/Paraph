# Paraph – Juristische Freigabeliste

> ## STATUS: NICHT ANWALTLICH FREIGEGEBEN
> **Diese Liste ist eine technische Vorbereitung und ersetzt keine anwaltliche Prüfung.**

| | |
|---|---|
| Prüfer | Patrick Baumfalk, Rechtsanwalt |
| Vorbereitet | 22.10.2026 (technische Vorprüfung, keine Rechtsberatung) |
| Code-Stand | `6934010` |
| Begründungen | [formhinweise-analyse.md](formhinweise-analyse.md) (Abschnittsverweise A1 ff., T1 ff., C1 ff.) |
| Kennzeichnung | **[GII]** Wortlaut am 22.10.2026 auf gesetze-im-internet.de abgerufen · **unverifiziert** = nicht an Primärquelle geprüft |

**So wird die Liste benutzt:** Je Punkt genau ein Kästchen ankreuzen, Datum und Kürzel eintragen. „geändert“ heißt: Text oder Regel wird nach Ihrer Vorgabe angepasst (Vorgabe bitte in die Zeile „Vermerk“). Ein Punkt der Gruppe A, der weder „freigegeben“ noch „geändert“ ist, blockiert den Produktivstart.

**Bereits technisch umgesetzt (Stand 0.2.0) – trotzdem freigabepflichtig:** Folgende Formulierungsvorschläge aus der Analyse sind im Code übernommen worden, weil der bisherige Text ungenau oder riskanter war. Sie sind damit *nicht* freigegeben; sie gehören zu den jeweiligen Punkten unten.
- Erklärung `signer` (de/en) mit Hinweis „nicht qualifiziert“, protokollierten Merkmalen und Kopie; `CONSENT_VERSION` → `2026-10-2` (`src/shared/consent.ts`) – zu F-02
- Checkbox „Ich stimme der obigen Erklärung zu.“ (`src/web/pages/sign/Sign.tsx`) – zu F-02
- Hinweis im Unterschriftsdialog „Ihre Erklärung geben Sie erst mit der abschließenden Bestätigung ab.“ (`SignaturePad.tsx`)
- Abschlussbestätigung „Zugangsnachweis“ statt „Identitätsprüfung“; Vor-Ort-Text (`certificate.ts`, `finalize.ts`)
- Versandbestätigung bei Formhinweisen „nach dem Katalog nicht genügt“ (`EnvelopeEditor.tsx`)
- SMS-Code ohne Dokumenttitel (§ 43a Abs. 2 BRAO) und Stufentext „Textform genügt …, wenn alle Parteien das PDF dauerhaft erhalten“ (`formrules.ts`)
- Neu: Link „Hinweise zum Datenschutz“ je Organisation (Einstellungen → Organisation), der Inhalt der Datenschutzhinweise selbst ist **nicht** Teil von Paraph.
- Neu: Abschluss-E-Mail nennt den SHA-256-Prüfwert des unterschriebenen Dokuments.

**Gesamtfreigabe:** erst wenn alle Punkte der Gruppe A erledigt sind.
[ ] Gruppe A vollständig erledigt — Datum/Kürzel: ____________

---

## A – Vor Produktivstart zwingend

### F-01 · Formhinweis-Katalog als Ganzes
- **Fundstelle:** `src/shared/formrules.ts:1–269`; Anzeige `src/web/pages/EnvelopeEditor.tsx:495–528`; Handbuch `docs/handbuch/08-recht.md:44–83`
- **Offene Rechtsfrage:** Darf der Katalog als regelbasierter Hinweis (Schlüsselwörter, keine Einzelfallprüfung) produktiv eingesetzt werden? Reicht der Hinweis „ersetzt keine rechtliche Prüfung“ (EnvelopeEditor.tsx:499)?
- **Empfehlung:** Freigabe nur zusammen mit den Einzelpunkten der Gruppe B. Bis dahin Regeln, die nicht einzeln freigegeben sind, weiter anzeigen, aber im UI als „ungeprüft“ kennzeichnen.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-02 · Erklärungstext für Unterzeichner (`signer`)
- **Fundstelle:** `src/shared/consent.ts:9–11` (en: 31–33); Anzeige `src/web/pages/sign/Sign.tsx:710–716`; Version `src/shared/model.ts:103`
- **Offene Rechtsfrage:** Satz „Meine Angaben und meine Unterschrift sollen dieselbe Wirkung haben, als hätte ich sie selbst abgegeben.“ ist sinnleer bzw. – als „handschriftlich“ gelesen – irreführend (§ 125 BGB). Fehlende Transparenz zu protokollierten Daten, fehlender Hinweis auf Grenzen der EES, fehlender Datenschutzlink (Analyse C2, C3).
- **Empfehlung:** Ersetzen durch
  - statement: „Ich unterschreibe die oben angezeigten Dokumente in genau dieser Fassung. Mit „Verbindlich unterschreiben“ gebe ich die darin enthaltenen Erklärungen als meine eigenen ab.“
  - electronic: „Ich bin einverstanden, diese Erklärung elektronisch abzugeben. Es handelt sich um eine einfache elektronische Signatur (EES), nicht um eine qualifizierte elektronische Signatur; wo das Gesetz Schriftform oder notarielle Form verlangt, genügt sie nicht. Zum Nachweis werden Zeitpunkte, IP-Adresse, Browserkennung, der Zugangsweg und mein Unterschriftsbild protokolliert. Nach Abschluss erhalte ich eine Kopie der unterschriebenen Dokumente. Informationen zum Datenschutz: {Link}.“
  - `CONSENT_VERSION` erhöhen.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-03 · Erklärungstexte Zeuge, Freigabe, Ausfüllen
- **Fundstelle:** `src/shared/consent.ts:13–27` (en: 35–49)
- **Offene Rechtsfrage:** Fehlende Transparenz wie F-02; `filler` enthält Richtigkeitsbestätigung (vgl. F-13); Freigabe sollte als „keine Unterschrift“ erkennbar sein.
- **Empfehlung:** `electronic` je Rolle um protokollierte Daten und Datenschutzlink ergänzen; approver: „… Die Freigabe ist keine Unterschrift unter das Dokument.“; filler: „Ich übermittle die von mir ausgefüllten Angaben.“
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-04 · Datenschutzinformation für Unterzeichner (Art. 13, 14 DSGVO)
- **Fundstelle:** fehlt; Unterzeichnerseite `src/web/pages/sign/Sign.tsx`, Mails `src/server/domain/mail.ts:25–80`; Fußzeilenfeld `src/web/pages/settings/Settings.tsx:238`
- **Offene Rechtsfrage:** Pflichtinformation bei Direkterhebung (IP, User-Agent, Unterschriftsbild, Mobilnummer) „zum Zeitpunkt der Erhebung“. Reichweite von § 29 Abs. 1, 2 BDSG für Berufsgeheimnisträger (Art. 14 bei Daten vom Absender). Rechtsgrundlage der Protokollierung: Art. 6 Abs. 1 lit. b/c/f – nicht Einwilligung.
- **Empfehlung:** Organisationseinstellung „Link zur Datenschutzinformation“ (Pflichtfeld vor Produktivbetrieb), Anzeige auf Startseite der Unterzeichnung, im Abschlussdialog und in jeder Einladungsmail. Inhalt siehe Analyse C6 (Verantwortlicher, Zwecke, Rechtsgrundlagen, Empfänger inkl. Dienstleister und andere Beteiligte, Drittland, Speicherdauer, Rechte, Beschwerderecht).
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-05 · Auftragsverarbeitung (Art. 28 DSGVO) mit externen Diensten
- **Fundstelle:** `docs/handbuch/08-recht.md:112–120`; Konfiguration SMTP, `SMS_GATEWAY_URL` (`src/server/domain/sms.ts`), S3, `TSA_URL` (`src/server/config.ts:111`), Hoster
- **Offene Rechtsfrage:** Für welche Anbieter ist ein AVV nötig? SMTP (Adresse, Betreff mit Dokumenttitel, Link, optional PDF), SMS (Nummer, Code, Dokumenttitel – siehe F-10/T20), S3 (verschlüsselte Dateien; Schlüssel beim Betreiber – trotzdem Verarbeitung), Hoster. TSA erhält nur Hashwerte (Dokument-Hash bzw. Merkle-Wurzel der Ankerkette, `src/server/domain/anchor.ts`) – personenbezogen? Drittlandübermittlung (Art. 44 ff.) bei US-Anbietern.
- **Empfehlung:** AVV mit SMTP-, SMS-, S3-Anbieter und Hoster abschließen; TSA: Einordnung dokumentieren (Tendenz: kein AVV, weil kein Personenbezug erkennbar – anwaltlich bestätigen). Nur Anbieter mit Sitz/Verarbeitung in EU/EWR.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-06 · Berufsrecht: Verschwiegenheit und Dienstleister (§ 43a Abs. 2, § 43e BRAO, § 203 StGB)
- **Fundstelle:** wie F-05; SMS-Text `src/server/domain/signing.ts:176`; Mailbetreff `src/server/domain/mail.ts:28`
- **Offene Rechtsfrage:** § 43e Abs. 3 BRAO [GII]: Vertrag in Textform mit Verschwiegenheitsverpflichtung unter Belehrung über strafrechtliche Folgen, Beschränkung der Kenntnisnahme, Regelung zu Subunternehmern. Abs. 4: Ausland nur bei vergleichbarem Geheimnisschutz. Abs. 5: Dienste, die „unmittelbar einem einzelnen Mandat dienen“, nur mit Einwilligung des Mandanten – betrifft das SMS-/Mailversand je Vorgang? Abs. 7 S. 2: gesetzlich schweigepflichtige Dienstleister. Unterzeichner sind oft Dritte (Gegenseite); deren Daten unterliegen ebenfalls der Verschwiegenheit.
- **Empfehlung:** § 43e-Vereinbarungen mit allen Anbietern aus F-05; Abs.-5-Frage entscheiden; SMS-Text ohne Dokumenttitel (F-10/T20); Standardbetreff der Einladung prüfen (Titel im Betreff ist für Dritte und Mailanbieter sichtbar) – ggf. Hinweis an Absender, keine sprechenden Titel mit Mandantennamen zu verwenden.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-07 · Aufbewahrung und Löschung (§ 50 BRAO, § 147 AO, § 257 HGB vs. Art. 5 Abs. 1 lit. e, Art. 17 DSGVO)
- **Fundstelle:** Aufbewahrungsfrist der Organisation `src/web/pages/settings/Settings.tsx:181` (Hinweis „§ 50 BRAO: 6 Jahre Handakte“); Handbuch `08-recht.md:103–108`, `10-einschraenkungen.md:40`
- **Offene Rechtsfrage:**
  - § 50 Abs. 1 BRAO [GII]: Handakten 6 Jahre ab Ende des Kalenderjahres der Auftragsbeendigung; § 50 Abs. 4: gilt auch elektronisch.
  - § 147 Abs. 3 AO [GII]: Bücher/Abschlüsse 10 Jahre, **Buchungsbelege 8 Jahre** (seit BEG IV), sonstige Unterlagen (Geschäftsbriefe) 6 Jahre; Ablaufhemmung bei offener Festsetzungsfrist. § 257 Abs. 4 HGB [GII] gleichlaufend; gilt nur für Kaufleute (z. B. Rechtsanwalts-GmbH), nicht für Einzelanwalt/PartG. Ob § 147 AO für die Kanzlei (Gewinnermittlung) im konkreten Umfang greift, ist steuerlich zu prüfen.
  - Beweisinteresse: Verjährungsfristen (bis 10/30 Jahre, §§ 195, 199 BGB [nicht abgerufen]) vs. Speicherbegrenzung.
  - Ist: Audit-Trail mit Namen, E-Mail, **IP-Adresse und User-Agent bleibt unbegrenzt** erhalten, auch nach Inhaltslöschung. Mit Art. 5 Abs. 1 lit. e DSGVO nur mit festgelegter Höchstfrist vereinbar.
- **Empfehlung:** Löschkonzept festlegen: Inhalte nach Ablauf der längsten einschlägigen Frist (Vorschlag: 6 Jahre nach Mandatsende; Vergütungsvereinbarungen/Rechnungsbelege nach steuerlicher Prüfung 8 bzw. 10 Jahre); Audit-Trail spätestens zusammen mit den Inhalten oder nach eigener Frist löschen bzw. IP-Adressen nach Frist kürzen; E-Mail-Datensätze 90 Tage, Webhook 30 Tage beibehalten; Sicherungen in das Konzept aufnehmen. Hinweistext Settings.tsx:181 um § 147 AO / § 257 HGB ergänzen.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-08 · Offenlegung von IP-Adresse und Gerät aller Beteiligten in der Abschlussbestätigung
- **Fundstelle:** `src/server/pdf/certificate.ts:286–287`; Versand an alle Unterzeichner `src/server/domain/finalize.ts` (Abschlussmitteilungen)
- **Offene Rechtsfrage:** Jede Partei erhält IP-Adresse und User-Agent jeder anderen Partei (z. B. Gegenseite). Erforderlich und von welcher Rechtsgrundlage gedeckt?
- **Empfehlung:** In der an Beteiligte versandten Fassung IP kürzen (z. B. letzte Stelle maskiert) oder nur die eigene IP vollständig zeigen; vollständige Werte nur im Nachweispaket der Kanzlei. Alternativ bewusste Entscheidung mit Begründung (Beweisfunktion) und Hinweis in der Datenschutzinformation.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-09 · Textform und dauerhafter Datenträger (§ 126b BGB)
- **Fundstelle:** Voreinstellung `attachCompletedPdf: false` in `src/server/domain/orgs.ts:35`; Abschlussmail `src/server/domain/mail.ts:37–41`; Stufentext `src/shared/formrules.ts:232`; Zustellart ohne E-Mail (`notify:false`)
- **Offene Rechtsfrage:** Genügt ein Downloadlink auf den Kanzleiserver als „dauerhafter Datenträger“ für die Erklärung der Kanzlei gegenüber dem Mandanten (z. B. § 3a RVG, § 578 BGB, NachwG)? (vgl. EuGH C-49/11, nicht abgerufen)
- **Empfehlung:** Für Vorgänge mit TEXT-Regeln das fertige PDF als Anhang versenden (Voreinstellung `attachCompletedPdf: true` oder automatisch je Formklasse); bei Zustellart ohne E-Mail Übergabe der Kopie dokumentieren. LEVEL_TEXT.TEXT anpassen (Analyse A21).
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-10 · Riskante Texte (Identität, unbedingte Verbindlichkeit, Formhinweis-Bestätigung)
- **Fundstelle und Ersatztext** (Analyse B2):
  - T1 `src/web/components/SignaturePad.tsx:255` → „Mit „Übernehmen“ wird das Bild Ihrer Unterschrift den Feldern zugeordnet. Ihre Erklärung geben Sie erst mit der abschließenden Bestätigung ab.“
  - T2 `src/server/pdf/certificate.ts:70` „Identitätsprüfung“ → „Zugangsnachweis“ (en :114 „Authentication“)
  - T3 `src/server/domain/finalize.ts:29` → „Vor Ort auf dem Gerät der gastgebenden Person unterschrieben; diese war zur persönlichen Identitätsprüfung angehalten (Art der Prüfung nicht protokolliert)“
  - T11 `src/web/pages/EnvelopeEditor.tsx:525` „voraussichtlich nicht genügt“ → „nach dem Katalog nicht genügt“
  - T12 `src/web/pages/EnvelopeEditor.tsx:525` → „Ich habe den Formhinweis gelesen. Mir ist bewusst, dass die gesetzliche Form mit einer einfachen elektronischen Signatur nicht gewahrt wird.“
  - T19 `src/server/domain/signing.ts:148` → „Bitte bestätigen Sie zuerst Ihren Zugang mit dem Code.“
  - T20 `src/server/domain/signing.ts:176` → „{code} ist Ihr Bestätigungscode für {Organisation}. Gültig 10 Minuten.“
- **Offene Rechtsfrage:** Keine; Formulierungsfreigabe.
- **Empfehlung:** Übernehmen; `en.ts` entsprechend anpassen.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-11 · QES nur über Vertrauensdiensteanbieter, nicht vorgetäuscht
- **Fundstelle:** `src/shared/model.ts:97–100`; Settings `src/web/pages/settings/Settings.tsx:464–477`; Handbuch `08-recht.md:32`, `10-einschraenkungen.md:7`; Abschlussbestätigung `src/server/pdf/certificate.ts:89` (fest „EES“)
- **Offene Rechtsfrage:** Ist sichergestellt, dass nirgends eine QES behauptet wird? Ist der Satz „Erfüllt die elektronische Form nach § 126a BGB“ (Settings.tsx:476) zu weit (Namenszusatz, gleichlautende Dokumente, gesetzliche Ausschlüsse)?
- **Empfehlung:** Befund: keine Vortäuschung; Versand mit Stufe `qes` wird blockiert. Text T10: „Ermöglicht die elektronische Form nach § 126a BGB, soweit das Gesetz sie nicht ausschließt.“ Bei künftiger QTSP-Anbindung: QTSP-Status in der Vertrauensliste prüfen, Abschlussbestätigung und Prüfanleitung stufenabhängig machen, keine „QES“-Anzeige ohne erfolgreiche Validierung.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-12 · Plattformsiegel – Abgrenzung zu Signatur und qualifiziertem Siegel
- **Fundstelle:** `src/server/pdf/certificate.ts:84–85, 128–129`; `src/server/domain/finalize.ts:160–161, 263–271`; `src/web/pages/settings/Settings.tsx:480, 508`
- **Offene Rechtsfrage:** Kann das PDF-Signaturfeld „Paraph (Organisation)“ als Unterschrift der Kanzlei oder der Beteiligten missverstanden werden?
- **Empfehlung:** Befund: Siegel wird nirgends als qualifiziert, FES/QES oder persönliche Signatur bezeichnet. Reason-Text ergänzen (T18): „Plattformsiegel Paraph (Integritätsschutz, keine Unterschrift der Beteiligten) – Vorgang … abgeschlossen“. Formulierungen „weist nach“ abschwächen (T5–T8, Gruppe C).
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-13 · Bestätigungen „gelesen“ / „richtig“ (§ 309 Nr. 12 lit. b BGB)
- **Fundstelle:** `src/web/pages/sign/Sign.tsx:716` („Ich habe die Dokumente gelesen und stimme der Erklärung zu.“); `src/shared/consent.ts:25`
- **Offene Rechtsfrage:** Sind die Plattformtexte vorformulierte Vertragsbedingungen der Kanzlei? Falls ja: Tatsachenbestätigung gegenüber Verbrauchern unwirksam (§ 309 Nr. 12 lit. b BGB, nicht abgerufen)? Schadet sie (Unwirksamkeit) oder ist sie nur wirkungslos?
- **Empfehlung:** Checkbox-Text „Ich stimme der obigen Erklärung zu.“
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-14 · Beweiswert der EES (§ 371a ZPO, freie Beweiswürdigung)
- **Fundstelle:** Handbuch `08-recht.md:17`; Abschlussbestätigung; interne Kanzleipraxis
- **Offene Rechtsfrage:** § 371a Abs. 1 ZPO [GII] (Anscheinsbeweis) gilt nur für QES; EES ist Augenscheinsobjekt, freie Beweiswürdigung (§ 286 ZPO). Welche Zugangswege verlangt die Kanzlei für streitanfällige Dokumente (z. B. Vergleiche, Vergütungsvereinbarungen)?
- **Empfehlung:** Interne Arbeitsanweisung: für beweiskritische Erklärungen mindestens E-Mail- oder SMS-Code, Abschluss-PDF als Anhang, externer Zeitstempeldienst (`TSA_URL`) aktiv. Keine Außendarstellung als „rechtssicher“, „beweissicher“, „gerichtsfest“.
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-15 · Datenschutz-Folgenabschätzung (Art. 35 DSGVO) und Verzeichnis (Art. 30 DSGVO)
- **Fundstelle:** – (Betriebsdokumentation)
- **Offene Rechtsfrage:** DSFA erforderlich? Faktoren: Daten unter Berufsgeheimnis, Dokumente können besondere Kategorien (Gesundheit, Strafverfahren) enthalten, Protokollierung von IP/Geräten Dritter, Unterschriftsbilder. Ob der Vorgang auf der DSK-Muss-Liste steht: unverifiziert.
- **Empfehlung:** Schwellwertanalyse dokumentieren; bei Zweifel DSFA durchführen (Tendenz: durchführen). Eintrag im Verzeichnis der Verarbeitungstätigkeiten; TOM nach Art. 32 einschließlich der dokumentierten Grenze „Root-Zugriff“ (`10-einschraenkungen.md:39`).
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

### F-16 · Stufentexte und Warnstufen
- **Fundstelle:** `src/shared/formrules.ts:230–236`; Blocklogik `src/web/pages/EnvelopeEditor.tsx:403`, `formrules.ts:264–269`
- **Offene Rechtsfrage:** `PAPER` vermischt zwingende Papierform (§ 623 BGB) mit bloßer Empfehlung (§ 80 ZPO, § 174 BGB). Warnmüdigkeit durch die Vollmacht-Regel.
- **Empfehlung:** Stufe `PAPER` = „Elektronisch ausgeschlossen – nur eigenhändige Unterschrift auf Papier wirksam“; neue Stufe „Papieroriginal empfohlen“ ohne Sperrwirkung; TEXT-Text nach F-09 (Analyse A21).
- [ ] freigegeben  [ ] geändert  [ ] gestrichen — Datum/Kürzel: ________ — Vermerk: ____________________

---

## B – Vor Nutzung des jeweiligen Dokumenttyps

Jede Regel darf erst nach Freigabe als „geprüft“ angezeigt werden. Ersatztexte stehen in der Analyse (Abschnitt in Klammern).

| ID | Gegenstand | Fundstelle | Offene Rechtsfrage | Empfehlung | Entscheidung | Datum/Kürzel |
|---|---|---|---|---|---|---|
| F-20 | Kündigung/Aufhebung Arbeitsverhältnis, § 623 BGB [GII] | formrules.ts:24–33 | Ergänzung Ausnahmen (notarielle Beurkundung, gerichtlicher Vergleich); Reformvorhaben unverifiziert | Text nach A1 ergänzen | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-21 | Bürgschaft, § 766 BGB, § 350 HGB [GII] | formrules.ts:34–43 | Ausnahme „Kaufleute“ zu weit; Formbedürftigkeit der Vollmacht unverifiziert | Text nach A2 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-22 | Schuldversprechen/-anerkenntnis, §§ 780–782 BGB [782 GII] | formrules.ts:44–53 | Deklaratorisches Anerkenntnis formfrei; Vergleichsfälle § 782 | Text nach A3 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-23 | Testament, § 2247 BGB | formrules.ts:54–63 | – | unverändert (optional § 2267) | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-24 | Notarielle Geschäfte | formrules.ts:64–73 | § 925 BGB fehlt in `norm`; Heilung | Norm und Text nach A5 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-25 | Befristung, § 14 Abs. 4 TzBfG [GII] | formrules.ts:74–83 | Ausnahme § 41 SGB VI; Reformvorhaben unverifiziert | Text nach A6 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-26 | Arbeitszeugnis, § 109 Abs. 3 GewO [GII] | formrules.ts:84–93 | **Keine Textform** – elektronische Form = QES + Einwilligung (Auftragsprämisse korrigiert) | Text nach A7 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-27 | Wettbewerbsverbot, § 74 HGB [GII] | formrules.ts:94–103 | Elektronische „Aushändigung“ ungeklärt | QES oder Papier; Karenz-Hinweis (A8) | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-28 | Betriebsvereinbarung, § 77 Abs. 2 BetrVG | formrules.ts:104–113 | Fehlalarm bei bloßer Bezugnahme | Muster verengen; Text A9 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-29 | Verbraucherdarlehen, § 492 BGB [GII] | formrules.ts:114–123 | Anwendungsbereich § 491; **Neufassung Verbraucherkreditrecht ab 20.11.2026** (BGBl. 2026 I Nr. 139 laut Sekundärquellen) – Formänderung unverifiziert | Text nach A10; **vor 20.11.2026 erneut prüfen** | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-30 | Kündigung Wohnraum, § 568 BGB | formrules.ts:124–133 | Zugang der QES-Datei; § 174 BGB | Text nach A11 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-31 | Wohnraummietvertrag, § 550 BGB [GII] | formrules.ts:134–143 | Muster „Staffelmiete“ gehört zu § 557a BGB [GII] | Text A12; eigene Regel Staffelmiete | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-32 | Gewerbemiete, § 578 Abs. 1 S. 2 BGB [GII] | formrules.ts:144–153 | Dauerhafter Datenträger (F-09); Einheitlichkeit der Urkunde unter Textform unverifiziert | Text nach A13 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-33 | Schiedsvereinbarung Verbraucher, § 1031 Abs. 5 ZPO | formrules.ts:154–163 | B2B-Fehlalarm | Text nach A14 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-34 | Vergütungsvereinbarung, § 3a RVG [GII] | formrules.ts:164–179 | Checkliste: „Verfahrensbeteiligter“ fehlt; § 4a RVG; § 49b Abs. 5 BRAO [GII]; dauerhafte Kopie | Checkliste nach A15 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-35 | Haftungsbeschränkung, § 52 BRAO [GII] | formrules.ts:180–189 | Nr. 2 (AGB, vierfache Summe) und Abs. 2 fehlen | Text nach A16 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-36 | Vollmacht, § 80 ZPO [GII], § 174 BGB | formrules.ts:190–199 | `PAPER` widerspricht Text; § 130a Abs. 3 S. 3 ZPO [GII] vs. BGH VI ZB 16/22 (Original) – unverifiziert, ob EES-Bild „unterschrieben“ ist | Regel teilen (A17) | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-37 | Nachweis Arbeitsbedingungen, § 2 NachwG [GII] | formrules.ts:200–209 | Aufforderung statt Bestätigung; Praktikanten § 2 Abs. 1a; Nachweis ≠ Wirksamkeit | Text nach A18 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-38 | Datenschutz-Einwilligung, Art. 7 DSGVO | formrules.ts:210–218 | Widerrufshinweis Art. 7 Abs. 3 S. 3; Art. 9; § 26 BDSG (Änderungsstand unverifiziert) | Text nach A19 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-39 | Mandatsvertrag | formrules.ts:219–227 | Fernabsatz/Verbraucher; § 356a BGB ungeprüft | Text nach A20 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-40 | Neue Regeln N1–N11 (Staffelmiete, § 41 SGB VI, Vorsorgevollmacht § 1820 Abs. 2 BGB [GII], Patientenverfügung, Leibrente, § 655b/§ 484/§ 650h, öffentliche Beglaubigung, Erfolgshonorar, vorzeitiger Leistungsbeginn, § 22 BBiG, GwG-Identifizierung § 12 GwG [GII]) | Analyse A22 | QES-Tauglichkeit bei § 1820/§ 1827 BGB und § 22 BBiG unverifiziert | einzeln aufnehmen oder streichen | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-41 | Mustervorlagen (z. B. Mandatsvereinbarung) | Handbuch `08-recht.md:85–87` | Inhaltliche Prüfung vor Verwendung | vor erster Nutzung prüfen | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-42 | GwG: Paraph ist kein Identifizierungsverfahren | – | § 12 Abs. 1 GwG [GII]: Ausweis, eID, QES u. a.; EES/OTP genügt nicht | Interne Anweisung: Identifizierung außerhalb von Paraph | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |

---

## C – Später

| ID | Gegenstand | Fundstelle | Offene Rechtsfrage | Empfehlung | Entscheidung | Datum/Kürzel |
|---|---|---|---|---|---|---|
| F-50 | Siegel-Formulierungen „weist nach“ | certificate.ts:85/129; finalize.ts:270; Settings.tsx:480; EnvelopePage.tsx:164 | Überzeichnung bei selbst signiertem Schlüssel | Texte T5–T8 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-51 | „nach überwiegender Ansicht“ (FES) | Settings.tsx:472 | Behauptung einer h. M. unbelegt | T9: „nach unserer Einschätzung“ | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-52 | Zugangsweg „per E-Mail zugestellt“ | finalize.ts:25 | falsch bei Zustellart ohne E-Mail | T4 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-53 | Englische Bezeichnung „AdES“ | en.ts:618 | Verwechslung mit PAdES-Format | T17 | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-54 | Frei anpassbare Mailtexte der Organisation | `branding.mail`, mail.ts:127 | Organisationsadmins können „rechtsgültig“ o. Ä. einfügen | Hinweis im Einstellungsdialog; interne Richtlinie | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-55 | Qualifizierter Zeitstempel | `TSA_URL`; Handbuch 10:10 | Vermutung Art. 41 Abs. 2 eIDAS nur bei qualifiziertem Dienst | Kosten/Nutzen; ggf. D-Trust o. a. (Vertrauensliste prüfen) | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-56 | FES-Referenzstandards Art. 26 Abs. 2 eIDAS | – | Durchführungsrechtsakt erlassen? unverifiziert | beobachten; FES weiter nicht beanspruchen | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-57 | Behördenkommunikation, § 3a VwVfG [GII] | – | EES ersetzt dort keine Schriftform; Alternativen: QES, beA-Weg (§ 3a Abs. 3 Nr. 2 VwVfG) | Hinweis im Handbuch | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-58 | Gerichtliche Einreichung, § 130a ZPO [GII] | – | Paraph-PDF ist kein Schriftsatz i. S. v. § 130a Abs. 3; Einreichung nur über beA mit einfacher Signatur des Anwalts oder QES | Hinweis im Handbuch | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-59 | Barrierefreiheit der Unterzeichnerseite | Handbuch 10:35 | Anwendbarkeit BFSG auf die Kanzleiplattform unverifiziert | prüfen, ob Pflicht oder nur Empfehlung | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |
| F-60 | Handbuch `08-recht.md` an Freigabeergebnis anpassen | 08-recht.md:44–83, 103–120 | Tabelle und Datenschutzteil spiegeln Freigaben | nach Abschluss von A/B aktualisieren | [ ] freigegeben  [ ] geändert  [ ] gestrichen | |

---

**Abschlussvermerk**

Gruppe A geprüft am __________ · Gruppe B geprüft am __________ · Gruppe C geprüft am __________

Unterschrift / Kürzel: ______________________
