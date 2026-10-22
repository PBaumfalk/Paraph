# Formvorschriften, eIDAS und Marktvergleich

Recherche für eine selbst gehostete E-Signatur-Plattform (Einsatz u. a. in einer deutschen Anwaltskanzlei).
Stand: 22.10.2026. Keine Rechtsberatung im Einzelfall. Der Katalog soll regelbasierte Hinweise im Produkt speisen und muss vor dem Produktiveinsatz anwaltlich freigegeben werden.

## Methodik

- **Gesetzestexte:** am 22.10.2026 direkt von gesetze-im-internet.de abgerufen (HTML-Rohtext). Der Wortlaut ist also tagesaktuell nach dem Stand dieser Seite.
- **Zitate:** Wörtliche Zitate stehen in Anführungszeichen. Alles andere ist Paraphrase.
- **EUR-Lex:** Die Seite ließ sich aus der Recherche-Umgebung für die DSGVO nicht abrufen (leere Antwort). Das betrifft Art. 7 DSGVO und ist dort vermerkt.
- **Sicherheitsstufen im Katalog:**
  - **hoch:** Der Gesetzeswortlaut ist eindeutig und wurde abgerufen.
  - **mittel:** Der Wortlaut ist abgerufen, aber die Anwendung auf E-Signaturen ist in Literatur oder Rechtsprechung umstritten oder nicht abschließend geklärt.
  - **niedrig:** Die Rechtslage ist unklar, oder der Wortlaut wurde nicht selbst geprüft.
- **Begriffe:**
  - **EES:** einfache elektronische Signatur, z. B. gezeichnete Unterschrift, getippter Name oder Klick.
  - **FES:** fortgeschrittene elektronische Signatur.
  - **QES:** qualifizierte elektronische Signatur.
  - **Schriftform:** § 126 BGB. **Elektronische Form:** § 126a BGB, verlangt eine QES. **Textform:** § 126b BGB.

---

## Teil 1 – Deutsches Recht

### 1.1 Grundnormen (Wortlaut abgerufen)

**§ 126 BGB – Schriftform**
- Abs. 1: Die Urkunde muss „von dem Aussteller eigenhändig durch Namensunterschrift oder mittels notariell beglaubigten Handzeichens unterzeichnet werden“.
- Abs. 3: „Die schriftliche Form kann durch die elektronische Form ersetzt werden, wenn sich nicht aus dem Gesetz ein anderes ergibt.“
- Abs. 5: Die notarielle Beurkundung ersetzt die Schriftform.
- Quelle: https://www.gesetze-im-internet.de/bgb/__126.html

**§ 126a BGB – Elektronische Form**
- Abs. 1: Der Aussteller muss der Erklärung „seinen Namen hinzufügen und das elektronische Dokument mit seiner qualifizierten elektronischen Signatur versehen“.
- Abs. 2: Bei Verträgen müssen die Parteien „jeweils ein gleichlautendes Dokument“ so signieren.
- **Folge für das Produkt:** Ersatz der gesetzlichen Schriftform nur durch QES. Weder EES noch FES genügen.
- Quelle: https://www.gesetze-im-internet.de/bgb/__126a.html

**§ 126b BGB – Textform**
- Verlangt wird eine „lesbare Erklärung, in der die Person des Erklärenden genannt ist, auf einem dauerhaften Datenträger“.
- Eine Unterschrift ist nicht nötig. PDF oder E-Mail genügen, ein Webformular allein ist zweifelhaft, weil es kein dauerhafter Datenträger beim Empfänger ist.
- **Folge für das Produkt:** Jede Signaturstufe genügt, wenn der Empfänger eine speicherbare Kopie erhält (z. B. abgeschlossenes PDF per E-Mail oder Download).
- Quelle: https://www.gesetze-im-internet.de/bgb/__126b.html

**§ 127 BGB – Vereinbarte Form**
- Abs. 2: Zur Wahrung der vertraglich vereinbarten Schriftform genügt im Zweifel „die telekommunikative Übermittlung und bei einem Vertrag der Briefwechsel“.
- Abs. 3: Bei vereinbarter elektronischer Form genügt im Zweifel „auch eine andere als die in § 126a bestimmte elektronische Signatur“.
- **Folge für das Produkt:** Vertragliche Schriftformklauseln (z. B. „Änderungen bedürfen der Schriftform“) lassen sich im Zweifel per EES wahren.
- Quelle: https://www.gesetze-im-internet.de/bgb/__127.html

**§ 125 BGB – Rechtsfolge**
- Ein Rechtsgeschäft ohne gesetzlich vorgeschriebene Form „ist nichtig“.
- Quelle: https://www.gesetze-im-internet.de/bgb/__125.html

**§ 129 BGB – Öffentliche Beglaubigung**
- Verlangt eine notarielle Beglaubigung, seit der Neufassung auch elektronisch nach Abs. 3 („notariell beglaubigte eigenhändige elektronische Namensunterschrift“).
- Eine Signaturplattform kann das nicht leisten.
- Quelle: https://www.gesetze-im-internet.de/bgb/__129.html

**Bürokratieentlastungsgesetz IV (BEG IV)**
- Fundstelle: „Viertes Gesetz zur Entlastung der Bürgerinnen und Bürger, der Wirtschaft sowie der Verwaltung von Bürokratie“ vom 23.10.2024, BGBl. 2024 I Nr. 323. Die meisten Änderungen gelten seit 1.1.2025.
- Amtliche Fundstelle: https://www.recht.bund.de/bgbl/1/2024/323/VO.html. Der Link leitet beim Abruf weiter. Die Fundstelle „BGBl. 2024 I Nr. 323, 29.10.2024“ ist über die IHK-Kopie und buzer.de bestätigt: https://www.ihk-muenchen.de/ihk/documents/Recht-Steuern/Steuerrecht/Neuer-Ordner/BEG-IV-BGBl-29102024.pdf
- **Im aktuellen Wortlaut sichtbar:**
  - § 578 Abs. 1 S. 2 BGB (Gewerbemiete): Textform.
  - § 585a BGB (Landpacht): Textform.
  - § 2 Abs. 1 S. 2 NachwG: Textform-Option.
  - § 12 Abs. 1 AÜG: Textform.
  - § 41 Abs. 3 SGB VI: Textform.
- **Zuordnung unsicher:** Welche dieser Änderungen genau auf BEG IV und welche auf andere Gesetze zurückgehen, wurde nur für §§ 578, 585a BGB (Übergangsrecht Art. 229 § 70 EGBGB) und das NachwG (Art. 50 BEG IV laut buzer.de) belegt. Bei AÜG und SGB VI ist die Zuordnung zu BEG IV nicht selbst geprüft (mittel). Der Gesetzeswortlaut selbst ist geprüft.
- **Nicht geändert, Stand heute:** § 623 BGB. Die elektronische Form ist dort weiterhin ausgeschlossen.

### 1.2 Einzelfälle mit Erläuterung

#### Arbeitsrecht

**§ 623 BGB – Kündigung und Auflösungsvertrag**
- Wortlaut: „bedürfen zu ihrer Wirksamkeit der Schriftform; die elektronische Form ist ausgeschlossen.“
- **EES, FES, QES:** jeweils unwirksam (§ 125 BGB). Nur Papier mit Originalunterschrift wirkt. Die Klagefrist nach § 4 KSchG beginnt erst „nach Zugang der schriftlichen Kündigung“.
- **Produkt:** harter Block bzw. Warnung „Nicht elektronisch signierbar“.

**§ 14 Abs. 4 TzBfG – Befristung des Arbeitsvertrags**
- Wortlaut: „bedarf zu ihrer Wirksamkeit der Schriftform.“ Kein ausdrücklicher Ausschluss der elektronischen Form, also greift § 126 Abs. 3 BGB.
- **EES, FES:** Die Befristung ist unwirksam, der Vertrag gilt als unbefristet (Rechtsfolge § 16 TzBfG, nicht abgerufen).
- **QES beider Seiten** auf demselben bzw. einem gleichlautenden Dokument: nach Wortlaut wirksam.
- **Ausnahme:** Die Vereinbarung über das Ende mit Erreichen der Regelaltersgrenze bedarf nach § 41 Abs. 3 SGB VI nur der Textform, „§ 14 Absatz 4 des Teilzeit- und Befristungsgesetzes gilt nicht“.

**§ 2 NachwG – Nachweis der Arbeitsbedingungen**
- Grundsatz: schriftlich niederlegen, unterzeichnen, aushändigen. Dabei „ist der Nachweis … in elektronischer Form ausgeschlossen“ (§ 126a scheidet also aus).
- Seit BEG IV aber (Abs. 1 S. 2): Die Niederschrift „kann in Textform (§ 126b …) abgefasst und elektronisch übermittelt werden“. Bedingungen: Das Dokument ist zugänglich, speicherbar und druckbar, und der Arbeitgeber fordert einen **Empfangsnachweis** an.
- Auf Verlangen des Arbeitnehmers muss die Schriftform nachgeholt werden (S. 3).
- **Nicht** in den Branchen nach § 2a SchwarzArbG (S. 6).
- § 2 Abs. 5 S. 2: Ein Arbeitsvertrag in Textform ersetzt den Nachweis.
- **Produkt:** EES genügt, aber zwei Funktionen sind Pflicht: Empfangsbestätigung abfragen und Branchenhinweis ausgeben. Gleiches gilt für Änderungen nach § 3 NachwG.

**§ 109 GewO, § 630 BGB – Zeugnis**
- Anspruch auf ein „schriftliches Zeugnis“. Abs. 3: „kann mit Einwilligung des Arbeitnehmers in elektronischer Form erteilt werden“.
- **Produkt:** QES und Einwilligung nötig. EES oder FES reichen nicht.

**§ 74 Abs. 1 HGB – Nachvertragliches Wettbewerbsverbot**
- Verlangt Schriftform und „Aushändigung einer vom Prinzipal unterzeichneten, die vereinbarten Bestimmungen enthaltenden Urkunde“. Die elektronische Form ist nicht ausdrücklich ausgeschlossen.
- **QES:** wahrt nach § 126 Abs. 3 BGB wohl die Form.
- **Unsicher:** Ob die „Aushändigung“ elektronisch erfolgen kann, ist nicht abschließend geklärt (mittel). Empfehlung: QES oder Papier.

**§ 77 Abs. 2 BetrVG – Betriebsvereinbarung**
- Schriftlich niederlegen und unterzeichnen. Bei elektronischer Form müssen Arbeitgeber und Betriebsrat „abweichend von § 126a Absatz 2 … dasselbe Dokument elektronisch signieren“.
- **Produkt:** QES beider Seiten auf **einem** Dokument. Gleichlautende Kopien genügen hier nicht.

**§ 12 Abs. 1 AÜG – Arbeitnehmerüberlassungsvertrag**
- Verleiher und Entleiher: „bedarf der Textform“. EES genügt.

**§ 26 Abs. 2 BDSG – Einwilligung von Beschäftigten**
- Sie hat „schriftlich oder elektronisch zu erfolgen, soweit nicht wegen besonderer Umstände eine andere Form angemessen ist“. Die Aufklärung erfolgt in Textform.
- „Elektronisch“ ist dabei nicht § 126a. EES genügt nach h. M. (mittel).
- **Unsicher:** Nach EuGH C-34/21 ist die Unionsrechtskonformität des § 26 BDSG teilweise fraglich. Die Formvorgabe steht aber weiter im Gesetz.

#### Bürgschaft, Schuldversprechen, Leibrente, Darlehen

**§ 766 BGB – Bürgschaft**
- Wortlaut: „Die Erteilung der Bürgschaftserklärung in elektronischer Form ist ausgeschlossen.“
- Nur die Erklärung des Bürgen ist formbedürftig, der Gläubiger kann elektronisch annehmen.
- **Ausnahme:** Nach § 350 HGB gilt die Form nicht für Kaufleute, wenn die Bürgschaft für sie ein Handelsgeschäft ist. Diese Norm wurde nicht abgerufen (mittel).

**§§ 780, 781 BGB – Schuldversprechen, Schuldanerkenntnis**
- Für die Erklärung des Versprechenden bzw. Anerkennenden ist die elektronische Form „ausgeschlossen“.
- Ausnahmen nach § 782 BGB (Vergleich/Abrechnung) und § 350 HGB wurden nicht abgerufen (mittel).
- **Praxis Kanzlei:** Ein Anerkenntnis im Vergleich ist häufig formfrei nach § 782. Das kann der regelbasierte Katalog nicht erkennen, deshalb nur als Warnung ausgeben.

**§ 761 BGB – Leibrente**
- Schriftform. Elektronisch ausgeschlossen nur, „soweit das Versprechen der Gewährung familienrechtlichen Unterhalts dient“. Sonst ist QES möglich.

**§ 492 BGB – Verbraucherdarlehen**
- Schriftform, kein Ausschluss, also QES möglich.
- Antrag und Annahme dürfen getrennt erklärt werden. Die Erklärung des Darlehensgebers braucht bei automatischer Erstellung keine Unterschrift.
- **Achtung Abs. 4:** Gilt auch für die Vollmacht des Darlehensnehmers. Ausgenommen sind Prozessvollmacht und notariell beurkundete Vollmacht.

**§ 655b BGB – Darlehensvermittlungsvertrag mit Verbraucher**
- Schriftform, QES möglich.

#### Miete, Grundstück, Bau

**§ 550 BGB – Wohnraummietvertrag über mehr als 1 Jahr**
- Schriftform. Fehlt sie, ist der Vertrag nicht nichtig, sondern gilt als „für unbestimmte Zeit“ geschlossen.
- **EES:** Der Vertrag ist wirksam, aber vorzeitig kündbar. **QES:** wahrt die Form.

**§ 578 Abs. 1 BGB – Gewerberaum und Grundstücke (nach BEG IV)**
- Ein Vertrag „für längere Zeit als ein Jahr“ muss nur in **Textform** geschlossen werden, sonst gilt er als unbefristet. EES genügt.
- **Übergang nach Art. 229 § 70 Abs. 1 EGBGB:**
  - Altverträge vor 1.1.2025: altes Recht (Schriftform) bis einschließlich 1.1.2026.
  - Bei Änderung ab 1.1.2025: neues Recht ab der Änderung.
  - Seit 2.1.2026 gilt also für alle Gewerbemietverträge Textform.
- Quelle: https://www.gesetze-im-internet.de/bgbeg/art_229__70.html
- Die Landpacht (§ 585a BGB) folgt dem gleichen Muster, Übergang bis 1.7.2026.

**§ 568 Abs. 1 BGB – Kündigung Wohnraummiete**
- „bedarf der schriftlichen Form.“ Kein Ausschluss, also QES möglich. EES und FES sind unwirksam.
- Über § 578 Abs. 3 gilt das auch für bestimmte Anmietungen durch öffentliche Träger.
- Eine Kündigung von Gewerberaum ist gesetzlich formfrei. Vertragliche Formklauseln gehen nach § 127 BGB.

**§§ 557a, 558a BGB – Staffelmiete und Mieterhöhung**
- Staffelmiete: „schriftlich“, also QES.
- Mieterhöhungsverlangen: „in Textform“, also EES.

**§ 311b BGB – Grundstücke, Vermögen, Erbschaftsverträge**
- Notarielle Beurkundung. Eine Signaturplattform ist ungeeignet.
- Heilung durch Auflassung und Eintragung (Abs. 1 S. 2).

**§§ 650h, 650i BGB – Bauvertrag**
- Kündigung des Bauvertrags: Schriftform, also QES.
- Verbraucherbauvertrag: Textform, also EES.

**§ 484 BGB – Teilzeit-Wohnrecht (Timesharing) u. a.**
- Schriftform, kein Ausschluss, also QES.

#### Gesellschafts-, Erb- und Familienrecht

**§ 15 Abs. 3, 4 GmbHG – Abtretung von GmbH-Anteilen**
- Abtretung und Verpflichtung dazu „in notarieller Form“. Eine Plattform ist ungeeignet.
- **Hinweis:** § 2 Abs. 3 GmbHG erlaubt die Video-Beurkundung (§§ 16a ff. BeurkG) für Gründungen. Abtretungsverpflichtungen sind nur innerhalb der Gründungsurkunde ausdrücklich genannt.
- **Unsicher:** Ob isolierte Anteilsabtretungen per Video beurkundet werden können, wurde nicht geprüft (niedrig). Für das Produkt ist das unerheblich, denn der Notar ist zwingend.

**§ 2247 BGB – Eigenhändiges Testament**
- Eine „eigenhändig geschriebene und unterschriebene Erklärung“. Ausgeschlossen sind jede elektronische Signatur und jeder Druck mit Unterschrift. Alternativ notarielles Testament (§ 2231 Nr. 1).

**Weitere notarielle Formen**
- Erbvertrag § 2276, Erbverzicht § 2348, Ehevertrag § 1410, Schenkungsversprechen § 518 (Heilung durch Bewirkung).
- Erbausschlagung § 1945: Niederschrift des Nachlassgerichts oder öffentliche Beglaubigung. Für Bevollmächtigte ist eine öffentlich beglaubigte Vollmacht nötig.

#### Anwaltliches Berufsrecht und Mandat

**§ 3a Abs. 1 RVG – Vergütungsvereinbarung**
- „bedarf der Textform“, also EES ausreichend.
- **Inhaltliche Pflichten:**
  - als „Vergütungsvereinbarung oder in vergleichbarer Weise bezeichnet“
  - „von anderen Vereinbarungen mit Ausnahme der Auftragserteilung deutlich abgesetzt“
  - „darf nicht in der Vollmacht enthalten sein“
  - Hinweis auf die beschränkte Kostenerstattung
- Gilt nicht für die Gebührenvereinbarung nach § 34 RVG.
- **Produkt:** Regelprüfung auf ein eigenes Dokument (nicht im selben Envelope-Dokument wie die Vollmacht).
- Quelle: https://www.gesetze-im-internet.de/rvg/__3a.html

**§ 4 RVG – Niedrigere als gesetzliche Vergütung**
- Keine eigene Formvorschrift. Die Form folgt aus § 3a Abs. 1 S. 1, der für jede „Vereinbarung über die Vergütung“ gilt, also Textform.
- Inhaltliche Grenze: angemessenes Verhältnis zu Leistung, Verantwortung und Haftung.
- **Erfolgshonorar § 4a RVG:** zusätzliche Pflichtangaben nach Abs. 3. Die Form richtet sich ebenfalls nach § 3a.

**§ 52 Abs. 1 Nr. 1 BRAO – Haftungsbeschränkung im Einzelfall**
- „im Einzelfall in Textform getroffene Vereinbarung bis zur Höhe der Mindestversicherungssumme“. EES genügt, Individualvereinbarung erforderlich.
- Abs. 2: Die Zustimmung zur Beschränkung auf einzelne Mitglieder „darf keine anderen Erklärungen enthalten und bedarf der Textform“.
- **Produkt:** Separates Dokument erzwingen.
- Quelle: https://www.gesetze-im-internet.de/brao/__52.html

**§ 167 BGB – Vollmacht**
- Abs. 2: Die Vollmacht „bedarf nicht der Form, welche für das Rechtsgeschäft bestimmt ist“. Grundsätzlich formfrei, EES genügt.
- **Ausnahmen (Auswahl):**
  - Verbraucherdarlehen § 492 Abs. 4 BGB: Schriftform.
  - GmbH-Gründung § 2 Abs. 2 GmbHG: notariell errichtet oder beglaubigt.
  - Erbausschlagung § 1945 Abs. 3 BGB: öffentlich beglaubigt.
  - Ausnahmen aus Rechtsprechung (z. B. unwiderrufliche Grundstücksvollmacht) wurden nicht geprüft (mittel).
- **Praxisfalle § 174 BGB:** Ein einseitiges Rechtsgeschäft durch einen Bevollmächtigten (z. B. eine Kündigung durch den Anwalt) ist zurückweisbar, wenn „eine Vollmachtsurkunde nicht vorlegt“ wird.
- **Unsicher:** Ob ein QES-signiertes PDF als „Vollmachtsurkunde“ genügt, ist nicht gesichert (niedrig). Sicher ist das Papieroriginal.

**§ 80 ZPO – Prozessvollmacht**
- Wortlaut: „Die Vollmacht ist schriftlich zu den Gerichtsakten einzureichen.“
- Der BGH verlangt nach § 80 S. 1 ZPO die Vorlage im **Original**, eine Kopie genügt nicht (BGH, Beschl. v. 23.01.2024 – VI ZB 88/21 und VI ZB 16/22). Bericht des Vorsitzenden Richters Dr. Bacher: https://www.otto-schmidt.de/blog/zivil-und-zivilverfahrensrecht-blog/montagsblog-neues-vom-bgh-ZRBLOG0003147.html. Das ist eine Sekundärquelle, die Primärentscheidung wurde nicht abgerufen.
- In der Praxis wird die Vollmacht nur bei Rüge (§ 88 ZPO, nicht abgerufen) geprüft.
- **Unsicher:** Ob eine QES-signierte Vollmacht, als elektronisches Dokument über § 130a ZPO eingereicht, das „Original“ ersetzt, ist nicht höchstrichterlich geklärt (niedrig).
- **EES:** genügt für das Mandatsverhältnis, aber nicht für den Nachweis bei Rüge.

#### Schiedsvereinbarung, Verbraucherrecht, Datenschutz

**§ 1031 Abs. 5 ZPO – Schiedsvereinbarung mit Verbraucher**
- Muss „in einer von den Parteien eigenhändig unterzeichneten Urkunde“ enthalten sein. Sie kann „durch die elektronische Form nach § 126a“ ersetzt werden, also QES.
- Die Urkunde darf keine anderen Vereinbarungen enthalten (außer bei notarieller Beurkundung).
- Abs. 6: Heilung durch rügelose Einlassung.
- Zwischen Unternehmern (Abs. 1): Ein unterzeichnetes Dokument oder Nachrichtenaustausch „die einen Nachweis der Vereinbarung sicherstellen“ genügt, also EES.

**Widerruf, Fernabsatz (§§ 312d, 355, 356, 356a, 357a BGB)**
- **Widerrufserklärung:** keine Form, sie muss nur eindeutig sein (§ 355 Abs. 1).
- **Belehrung und Informationen:** nach Art. 246a EGBGB, Informationspflichten nach § 312d BGB.
- **Vorzeitiger Beginn einer Dienstleistung** (relevant beim Mandatsvertrag mit Verbraucher im Fernabsatz):
  - Erlöschen des Widerrufsrechts nach § 356 Abs. 5 Nr. 2: ausdrückliche Zustimmung und Bestätigung der Kenntnis vom Erlöschen.
  - Wertersatz nach § 357a Abs. 2: ausdrückliches Verlangen.
  - Bei Verträgen außerhalb von Geschäftsräumen muss das Verlangen bzw. die Zustimmung jeweils „auf einem dauerhaften Datenträger übermittelt“ werden.
- **Produkt:** separate, nicht vorausgefüllte Checkboxen, PDF-Kopie an den Verbraucher. EES genügt.
- **Neu, § 356a BGB:** Bei Fernabsatzverträgen über eine Online-Benutzeroberfläche ist eine Widerrufsfunktion „Vertrag widerrufen“ Pflicht, mit Eingangsbestätigung auf einem dauerhaften Datenträger. Das betrifft die Plattform nur, wenn über sie Verbraucherverträge **geschlossen** werden.
- **Unsicher:** Ob das Signieren eines Mandatsvertrags über die Plattform ein Vertragsschluss „über eine Online-Benutzeroberfläche“ ist, wurde nicht geprüft (niedrig).
- Quellen: https://www.gesetze-im-internet.de/bgb/__356.html, https://www.gesetze-im-internet.de/bgb/__356a.html, https://www.gesetze-im-internet.de/bgb/__357a.html

**Art. 7 DSGVO – Einwilligung**
- Keine Form. Abs. 1: Der Verantwortliche „muss nachweisen können“, dass eingewilligt wurde.
- Bei schriftlicher Erklärung, die auch andere Sachverhalte betrifft, muss das Ersuchen klar abgesetzt sein (Abs. 2).
- Widerruf jederzeit, so einfach wie die Erteilung (Abs. 3).
- **Wortlaut nicht selbst abgerufen:** EUR-Lex war technisch nicht erreichbar. Der Wortlaut stammt aus Vorkenntnis (mittel). Quelle: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679
- **Produkt:** EES mit Prüfprotokoll (Zeit, Identität, Version des Textes) erfüllt den Nachweiszweck. Die Einwilligung gehört in einen eigenen, abgesetzten Block.

### 1.3 Weitere praxisrelevante Fälle (Kurzliste)
- **Vertragliche Schriftformklauseln (§ 127 Abs. 2, 3 BGB):** EES genügt im Zweifel.
- **Mandatsvertrag, Auftrag, Schweigepflichtentbindung, Honorarvorschussrechnung:** gesetzlich formfrei, EES genügt. Für den Beweis ist das Prüfprotokoll wichtig.
- **Abtretung einer Hypothekenforderung (§ 1154 BGB):** Schriftform plus Briefübergabe. Die Plattform passt nur bedingt.
- **Kündigung durch Bevollmächtigten (§ 174 BGB) und Einwilligung des gesetzlichen Vertreters (§ 111 BGB):** Die Urkunde ist vorzulegen bzw. die schriftliche Einwilligung, sonst droht Zurückweisung. Empfehlung: Papieroriginal.

---

### 1.4 Maschinenlesbarer Katalog

Spalte „Mindeststufe“:
- `KEINE`: formfrei, EES empfohlen für den Beweis
- `TEXTFORM`: EES plus speicherbare Kopie an den Empfänger
- `QES`: elektronische Form nach § 126a
- `PAPIER`: eigenhändige Unterschrift, elektronisch ausgeschlossen
- `NOTAR`: Beurkundung oder Beglaubigung

| Norm | Dokumentart | Form | E-Form ausgeschlossen | Mindeststufe | Hinweistext für Nutzer | Quelle-URL | Sicherheit |
|---|---|---|---|---|---|---|---|
| § 623 BGB | Kündigung Arbeitsverhältnis, Aufhebungs-/Auflösungsvertrag | Schriftform | ja | PAPIER | Kündigungen und Aufhebungsverträge im Arbeitsverhältnis sind nur mit Originalunterschrift auf Papier wirksam. Jede elektronische Signatur, auch die QES, führt zur Unwirksamkeit. | https://www.gesetze-im-internet.de/bgb/__623.html | hoch |
| § 14 Abs. 4 TzBfG | Befristungsabrede im Arbeitsvertrag | Schriftform | nein | QES | Die Befristung braucht Schriftform. Elektronisch wirksam nur mit QES beider Seiten vor Arbeitsantritt, sonst gilt der Vertrag als unbefristet. | https://www.gesetze-im-internet.de/tzbfg/__14.html | hoch |
| § 41 Abs. 3 SGB VI | Beendigung mit Erreichen der Regelaltersgrenze | Textform | – | TEXTFORM | Für die Vereinbarung über das Ende mit Erreichen der Regelaltersgrenze genügt die Textform; eine einfache elektronische Signatur reicht. | https://www.gesetze-im-internet.de/sgb_6/__41.html | hoch |
| § 2 NachwG | Nachweis wesentlicher Arbeitsbedingungen, Arbeitsvertrag als Nachweis | Schriftform oder Textform (mit Empfangsnachweis) | ja (§ 126a), aber Textform zulässig | TEXTFORM | Textform genügt, wenn das Dokument speicher- und druckbar ist und der Arbeitnehmer den Empfang bestätigt. Nicht in Branchen nach § 2a SchwarzArbG (z. B. Bau, Gastronomie); auf Verlangen ist ein Papierexemplar zu erteilen. | https://www.gesetze-im-internet.de/nachwg/__2.html | hoch |
| § 3 NachwG | Mitteilung von Änderungen der Arbeitsbedingungen | wie § 2 | ja (§ 126a), Textform zulässig | TEXTFORM | Änderungen sind spätestens am Tag des Wirksamwerdens mitzuteilen; Textform mit Empfangsnachweis genügt, außer in Branchen nach § 2a SchwarzArbG. | https://www.gesetze-im-internet.de/nachwg/__3.html | hoch |
| § 109 GewO / § 630 BGB | Arbeitszeugnis | Schriftform | nein, aber nur mit Einwilligung | QES | Ein elektronisches Zeugnis ist nur mit QES und Einwilligung des Arbeitnehmers zulässig; sonst ist es auf Papier zu unterschreiben. | https://www.gesetze-im-internet.de/gewo/__109.html | hoch |
| § 74 Abs. 1 HGB | Nachvertragliches Wettbewerbsverbot | Schriftform und Aushändigung einer unterzeichneten Urkunde | nein | QES | Wettbewerbsverbote brauchen Schriftform und Aushändigung einer unterzeichneten Urkunde. Sicher sind QES oder Papier; ob die elektronische Aushändigung genügt, ist nicht abschließend geklärt. | https://www.gesetze-im-internet.de/hgb/__74.html | mittel |
| § 77 Abs. 2 BetrVG | Betriebsvereinbarung | Schriftform | nein | QES | Elektronisch nur mit QES von Arbeitgeber und Betriebsrat auf demselben Dokument (nicht auf zwei Kopien). | https://www.gesetze-im-internet.de/betrvg/__77.html | hoch |
| § 12 Abs. 1 AÜG | Arbeitnehmerüberlassungsvertrag | Textform | – | TEXTFORM | Für den Überlassungsvertrag zwischen Verleiher und Entleiher genügt die Textform. Die Erlaubniserklärung des Verleihers muss enthalten sein. | https://www.gesetze-im-internet.de/a_g/__12.html | hoch |
| § 26 Abs. 2 BDSG | Datenschutz-Einwilligung von Beschäftigten | schriftlich oder elektronisch | – | KEINE | Die Einwilligung ist schriftlich oder elektronisch einzuholen; über Zweck und Widerrufsrecht ist in Textform aufzuklären. | https://www.gesetze-im-internet.de/bdsg_2018/__26.html | mittel |
| § 766 BGB | Bürgschaftserklärung | Schriftform | ja | PAPIER | Die Bürgschaftserklärung muss auf Papier eigenhändig unterschrieben werden; die elektronische Form ist gesetzlich ausgeschlossen. Ausnahme bei Kaufleuten (§ 350 HGB). | https://www.gesetze-im-internet.de/bgb/__766.html | hoch |
| § 780 BGB | Selbständiges Schuldversprechen | Schriftform | ja | PAPIER | Das Schuldversprechen muss auf Papier eigenhändig unterschrieben werden; elektronisch ausgeschlossen (Ausnahmen §§ 782 BGB, 350 HGB). | https://www.gesetze-im-internet.de/bgb/__780.html | hoch |
| § 781 BGB | Abstraktes Schuldanerkenntnis | Schriftform | ja | PAPIER | Das Schuldanerkenntnis muss auf Papier eigenhändig unterschrieben werden; elektronisch ausgeschlossen. In Vergleichen kann es formfrei sein (§ 782 BGB). Bitte prüfen. | https://www.gesetze-im-internet.de/bgb/__781.html | hoch |
| § 761 BGB | Leibrentenversprechen | Schriftform | teilweise (bei familienrechtlichem Unterhalt) | QES (bei Unterhalt: PAPIER) | Das Leibrentenversprechen braucht Schriftform; elektronisch nur per QES. Dient es dem familienrechtlichen Unterhalt, ist nur Papier zulässig. | https://www.gesetze-im-internet.de/bgb/__761.html | hoch |
| § 492 BGB | Verbraucherdarlehensvertrag, Vollmacht dazu | Schriftform | nein | QES | Verbraucherdarlehen und Vollmachten dazu brauchen Schriftform; elektronisch nur mit QES des Darlehensnehmers. | https://www.gesetze-im-internet.de/bgb/__492.html | hoch |
| § 655b BGB | Darlehensvermittlungsvertrag mit Verbraucher | Schriftform | nein | QES | Der Vermittlungsvertrag braucht Schriftform (QES) und darf nicht mit dem Darlehensantrag verbunden werden. | https://www.gesetze-im-internet.de/bgb/__655b.html | hoch |
| § 484 BGB | Teilzeit-Wohnrecht, langfristiges Urlaubsprodukt, Vermittlung, Tauschsystem | Schriftform | nein | QES | Der Vertrag braucht Schriftform; elektronisch nur per QES. | https://www.gesetze-im-internet.de/bgb/__484.html | hoch |
| § 550 BGB | Wohnraummietvertrag über mehr als 1 Jahr | Schriftform (Folge: unbefristet) | nein | QES | Ohne Schriftform (QES oder Papier) gilt der Mietvertrag als unbefristet und ist vorzeitig kündbar; er bleibt aber wirksam. | https://www.gesetze-im-internet.de/bgb/__550.html | hoch |
| § 578 Abs. 1 BGB | Gewerbemiet-/Grundstücksmietvertrag über mehr als 1 Jahr | Textform (seit 1.1.2025, Übergang bis 1.1.2026) | – | TEXTFORM | Für Gewerbemietverträge genügt seit BEG IV die Textform; eine einfache elektronische Signatur reicht, damit die feste Laufzeit gilt. | https://www.gesetze-im-internet.de/bgb/__578.html | hoch |
| § 585a BGB | Landpachtvertrag über mehr als 2 Jahre | Textform (Übergang bis 1.7.2026) | – | TEXTFORM | Für Landpachtverträge genügt die Textform. | https://www.gesetze-im-internet.de/bgb/__585a.html | hoch |
| § 568 Abs. 1 BGB | Kündigung Wohnraummietvertrag | Schriftform | nein | QES | Die Kündigung von Wohnraum braucht Schriftform: Papier oder QES. E-Mail und einfache Signatur sind unwirksam. | https://www.gesetze-im-internet.de/bgb/__568.html | hoch |
| § 557a BGB | Staffelmietvereinbarung | Schriftform („schriftlich“) | nein | QES | Die Staffelmiete ist schriftlich zu vereinbaren: Papier oder QES. | https://www.gesetze-im-internet.de/bgb/__557a.html | mittel |
| § 558a BGB | Mieterhöhungsverlangen | Textform | – | TEXTFORM | Das Mieterhöhungsverlangen braucht nur Textform; die Zustimmung des Mieters ist gesetzlich formfrei. | https://www.gesetze-im-internet.de/bgb/__558a.html | hoch |
| § 650h BGB | Kündigung Bauvertrag | Schriftform | nein | QES | Die Kündigung eines Bauvertrags braucht Schriftform: Papier oder QES. | https://www.gesetze-im-internet.de/bgb/__650h.html | hoch |
| § 650i BGB | Verbraucherbauvertrag | Textform | – | TEXTFORM | Für den Verbraucherbauvertrag genügt die Textform. | https://www.gesetze-im-internet.de/bgb/__650i.html | hoch |
| § 311b BGB | Grundstückskauf, Vermögensübertragung, Erbteilsverträge unter künftigen Erben | notarielle Beurkundung | ja (faktisch) | NOTAR | Dieser Vertrag muss notariell beurkundet werden; eine elektronische Signatur genügt nicht. | https://www.gesetze-im-internet.de/bgb/__311b.html | hoch |
| § 15 Abs. 3, 4 GmbHG | Abtretung von GmbH-Anteilen und Verpflichtung dazu | notarielle Form | ja (faktisch) | NOTAR | Die Übertragung von GmbH-Anteilen und die Verpflichtung dazu müssen notariell beurkundet werden. | https://www.gesetze-im-internet.de/gmbhg/__15.html | hoch |
| § 2 GmbHG | GmbH-Gesellschaftsvertrag, Gründungsvollmacht | notarielle Form (auch Video-Beurkundung) | ja (faktisch) | NOTAR | Gesellschaftsvertrag und Gründungsvollmacht brauchen den Notar (auch per Video-Beurkundung). | https://www.gesetze-im-internet.de/gmbhg/__2.html | hoch |
| § 2247 BGB | Privatschriftliches Testament | eigenhändig geschrieben und unterschrieben | ja | PAPIER | Ein Testament muss vollständig handschriftlich geschrieben und unterschrieben werden oder notariell errichtet werden. Elektronisch ist es unwirksam. | https://www.gesetze-im-internet.de/bgb/__2247.html | hoch |
| § 2276 BGB | Erbvertrag | notarielle Beurkundung | ja (faktisch) | NOTAR | Ein Erbvertrag muss bei gleichzeitiger Anwesenheit vor dem Notar geschlossen werden. | https://www.gesetze-im-internet.de/bgb/__2276.html | hoch |
| § 2348 BGB | Erb-/Pflichtteilsverzicht | notarielle Beurkundung | ja (faktisch) | NOTAR | Ein Erb- oder Pflichtteilsverzicht muss notariell beurkundet werden. | https://www.gesetze-im-internet.de/bgb/__2348.html | hoch |
| § 1410 BGB | Ehevertrag | notarielle Beurkundung | ja (faktisch) | NOTAR | Ein Ehevertrag muss bei gleichzeitiger Anwesenheit beider vor dem Notar geschlossen werden. | https://www.gesetze-im-internet.de/bgb/__1410.html | hoch |
| § 518 BGB | Schenkungsversprechen | notarielle Beurkundung | ja (faktisch) | NOTAR | Ein Schenkungsversprechen muss notariell beurkundet werden; der Formmangel heilt erst mit Vollzug der Schenkung. | https://www.gesetze-im-internet.de/bgb/__518.html | hoch |
| § 1945 BGB | Erbausschlagung, Vollmacht dazu | Niederschrift des Nachlassgerichts oder öffentliche Beglaubigung | ja (faktisch) | NOTAR | Ausschlagung und Vollmacht dazu müssen öffentlich beglaubigt oder beim Nachlassgericht erklärt werden. | https://www.gesetze-im-internet.de/bgb/__1945.html | hoch |
| § 3a RVG | Anwaltliche Vergütungsvereinbarung (auch Erfolgshonorar § 4a) | Textform | – | TEXTFORM | Textform genügt. Das Dokument muss als Vergütungsvereinbarung bezeichnet, von anderen Vereinbarungen abgesetzt und darf nicht Teil der Vollmacht sein; der Hinweis auf die begrenzte Kostenerstattung ist Pflicht. | https://www.gesetze-im-internet.de/rvg/__3a.html | hoch |
| § 4 RVG | Vereinbarung einer niedrigeren Vergütung (außergerichtlich) | Textform (über § 3a Abs. 1) | – | TEXTFORM | Auch eine Unterschreitung der gesetzlichen Vergütung ist eine Vergütungsvereinbarung und braucht Textform; sie muss angemessen sein. | https://www.gesetze-im-internet.de/rvg/__4.html | mittel |
| § 52 BRAO | Haftungsbeschränkung im Mandat | Textform, Einzelfallvereinbarung | – | TEXTFORM | Die Haftungsbeschränkung muss im Einzelfall in Textform vereinbart werden. Die Zustimmung zur Beschränkung auf einzelne Anwälte darf keine anderen Erklärungen enthalten. | https://www.gesetze-im-internet.de/brao/__52.html | hoch |
| § 167 BGB | Vollmacht (allgemein) | formfrei | – | KEINE | Vollmachten sind grundsätzlich formfrei. Wird mit ihr gegenüber Dritten gekündigt oder einseitig erklärt, kann ohne Original-Vollmachtsurkunde zurückgewiesen werden (§ 174 BGB). | https://www.gesetze-im-internet.de/bgb/__167.html | hoch |
| § 174 BGB | Vollmachtsurkunde für einseitige Erklärungen (z. B. Kündigung durch Anwalt) | Vorlage der Urkunde | ungeklärt | PAPIER (empfohlen) | Für Kündigungen durch Bevollmächtigte sollte eine Originalvollmacht auf Papier vorliegen; ob eine QES-Datei als Vollmachtsurkunde genügt, ist nicht gesichert. | https://www.gesetze-im-internet.de/bgb/__174.html | niedrig |
| § 80 ZPO | Prozessvollmacht (Nachweis gegenüber Gericht) | schriftlich, im Original | ungeklärt | PAPIER (empfohlen) | Für das Mandat genügt eine einfache Signatur; bei Rüge verlangt der BGH die Originalvollmacht. Ob eine QES-signierte Vollmacht über beA ausreicht, ist nicht abschließend geklärt. | https://www.gesetze-im-internet.de/zpo/__80.html | niedrig |
| § 1031 Abs. 5 ZPO | Schiedsvereinbarung mit Verbraucher | eigenhändig unterzeichnete Urkunde oder § 126a | nein | QES | Mit Verbrauchern nur eigenhändig auf Papier oder mit QES, und zwar in einem separaten Dokument ohne weitere Vereinbarungen. | https://www.gesetze-im-internet.de/zpo/__1031.html | hoch |
| § 1031 Abs. 1 ZPO | Schiedsvereinbarung zwischen Unternehmern | unterzeichnetes Dokument oder Nachrichtenaustausch mit Nachweis | – | TEXTFORM | Zwischen Unternehmern genügt ein Dokument oder Nachrichtenaustausch, der die Vereinbarung nachweist. | https://www.gesetze-im-internet.de/zpo/__1031.html | hoch |
| §§ 356 Abs. 5, 357a Abs. 2 BGB | Verlangen des vorzeitigen Leistungsbeginns, Bestätigung des Erlöschens (Verbraucher, Dienstleistung) | ausdrücklich; außerhalb von Geschäftsräumen auf dauerhaftem Datenträger | – | TEXTFORM | Der Verbraucher muss den vorzeitigen Beginn ausdrücklich verlangen und die Kenntnis vom Erlöschen bestätigen (eigene, nicht vorausgefüllte Checkbox); er erhält eine Kopie als PDF. | https://www.gesetze-im-internet.de/bgb/__356.html | mittel |
| § 355 BGB | Widerrufserklärung des Verbrauchers | formfrei, eindeutig | – | KEINE | Der Widerruf braucht keine Form und keine Begründung; eine Signatur ist nicht erforderlich. | https://www.gesetze-im-internet.de/bgb/__355.html | hoch |
| § 356a BGB | Widerrufsfunktion bei Online-Fernabsatzverträgen | Schaltfläche, Eingangsbestätigung auf dauerhaftem Datenträger | – | KEINE | Werden Verbraucherverträge online geschlossen, muss eine Funktion „Vertrag widerrufen“ angeboten werden. | https://www.gesetze-im-internet.de/bgb/__356a.html | niedrig (Anwendbarkeit auf Signaturplattform ungeprüft) |
| Art. 7 DSGVO | Datenschutz-Einwilligung | formfrei, Nachweispflicht | – | KEINE | Die Einwilligung ist formfrei, muss aber nachweisbar sein. Sie gehört in einen eigenen, klar abgesetzten Abschnitt und muss widerrufbar sein. | https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679 | mittel (Wortlaut nicht abgerufen) |
| § 127 BGB | Vertraglich vereinbarte Schriftform (z. B. Schriftformklausel) | im Zweifel telekommunikative Übermittlung | – | KEINE | Für vertraglich vereinbarte Schriftform genügt im Zweifel eine elektronische Übermittlung; die Gegenseite kann nachträglich eine Urkunde verlangen. | https://www.gesetze-im-internet.de/bgb/__127.html | hoch |
| – | Mandatsvertrag, Auftrag, Schweigepflichtentbindung | formfrei | – | KEINE | Gesetzlich formfrei; die elektronische Signatur dient dem Nachweis. | – (keine Formnorm) | mittel |

---

## Teil 2 – eIDAS

**Quellen:**
- Konsolidierte Fassung CELEX 02014R0910-20241018: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:02014R0910-20241018
- Änderungs-VO 2024/1183: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32024R1183
- EUR-Lex blockierte den direkten Abruf. Der Volltext kam deshalb über den inhaltsgleichen Cellar-Endpunkt des Amtes für Veröffentlichungen.
- Ob es nach 18.10.2024 eine neuere konsolidierte Fassung gibt, wurde nicht geprüft (niedrig). Die Kernartikel sind davon nach bisherigem Stand nicht betroffen.

### 2.1 Normen

**Art. 3 – Begriffe**
- **Nr. 10, elektronische Signatur:** Daten in elektronischer Form, die anderen elektronischen Daten beigefügt oder logisch mit ihnen verbunden werden und die der Unterzeichner zum Unterzeichnen verwendet.
- **Nr. 11, FES:** eine elektronische Signatur, die die Anforderungen des Art. 26 erfüllt.
- **Nr. 12, QES:** eine FES, die von einer qualifizierten Signaturerstellungseinheit (QSCD) erstellt wurde und auf einem qualifizierten Zertifikat beruht.
- **Nr. 9:** Unterzeichner ist eine natürliche Person. Juristische Personen nutzen Siegel.
- **Neu durch 2024/1183:** die „qualifizierte elektronische Fernsignaturerstellungseinheit“, die ein QTSP nach Art. 29a für den Unterzeichner verwaltet.

**Art. 25 – Rechtswirkung**
- **Abs. 1:** Einer elektronischen Signatur darf die Rechtswirkung und die Zulässigkeit als Beweismittel nicht allein deshalb abgesprochen werden, weil sie elektronisch ist oder die QES-Anforderungen nicht erfüllt.
- **Abs. 2:** Die QES hat die gleiche Rechtswirkung wie eine handschriftliche Unterschrift.
- **Abs. 3** (grenzüberschreitende Anerkennung) wurde durch 2024/1183 gestrichen. Der Inhalt steht jetzt in Art. 24a.

**Art. 26 – Anforderungen an die FES** (kumulativ)
- a) eindeutig dem Unterzeichner zugeordnet;
- b) ermöglicht seine Identifizierung;
- c) erstellt mit Signaturerstellungsdaten, die der Unterzeichner „mit einem hohen Maß an Vertrauen unter seiner alleinigen Kontrolle verwenden kann“;
- d) so mit den Daten verbunden, dass eine nachträgliche Veränderung erkannt werden kann.
- **Neu, Abs. 2 (2024/1183):** Die Kommission prüft bis 21.05.2026 Referenzstandards. Werden sie eingehalten, gilt die Vermutung der FES-Konformität.
- **Unsicher:** Ob ein solcher Durchführungsrechtsakt inzwischen erlassen wurde, ist ungeklärt.
- **Nicht verwechseln:** Die Durchführungs-VO (EU) 2026/248 betrifft nur FES-Formate, die öffentliche Stellen anerkennen müssen (Art. 27, 37): https://eur-lex.europa.eu/eli/reg_impl/2026/248/oj

**Art. 29 Abs. 1a, Art. 29a – Fernsignatur (neu)**
- Signaturerstellungsdaten für eine QES darf nur ein QTSP im Namen des Unterzeichners verwalten, und zwar im Rahmen eines qualifizierten Dienstes.
- Die Übergangsfrist für nicht qualifizierte Verwaltungsdienste endete am 21.05.2026.
- Durchführungs-VO (EU) 2025/1567: https://eur-lex.europa.eu/eli/reg_impl/2025/1567/oj

**Art. 35 – Siegel**
- **Abs. 1:** gleiches Diskriminierungsverbot wie bei Signaturen.
- **Abs. 2:** Für qualifizierte Siegel gilt die Vermutung der Unversehrtheit und der richtigen Herkunftsangabe.
- **Abs. 3** wurde gestrichen.
- **Für die Plattform:** Ein Siegel der Kanzlei bzw. des Betreibers kann die Herkunft und Integrität des abgeschlossenen Dokuments belegen. Es ist aber **keine Signatur der Unterzeichner**.

**Art. 41, 42 – Zeitstempel**
- **Art. 41 Abs. 1:** Diskriminierungsverbot.
- **Art. 41 Abs. 2:** Nur für den **qualifizierten** Zeitstempel gilt die Vermutung der Richtigkeit von Datum und Zeit und der Unversehrtheit.
- **Art. 42 Abs. 1:** Ein qualifizierter Zeitstempel muss
  - Datum und Zeit so mit den Daten verknüpfen, dass eine unbemerkte Änderung ausgeschlossen ist;
  - auf einer korrekten, mit UTC verknüpften Zeitquelle beruhen;
  - mit einer FES oder einem fortgeschrittenen Siegel des QTSP versehen sein.
- Normen dazu: Durchführungs-VO (EU) 2025/1929 mit ETSI EN 319 421 und 319 422: https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj

### 2.2 Was die Plattform ohne Vertrauensdiensteanbieter ehrlich erreicht

**EES – sicher erreichbar.** Art. 3 Nr. 10 stellt praktisch keine technischen Anforderungen. Den Beweiswert bewertet das Gericht frei. Er steigt mit:
- Prüfprotokoll (Audit-Trail)
- Dokument-Hash
- Siegel bzw. PAdES-Signatur des Betreibers
- Zeitstempel
- Authentifizierung über E-Mail-Link, OTP oder SMS

**FES – nur unter Bedingungen; die Abgrenzung ist umstritten.** Mindestens nötig:
1. Ein **eigenes Schlüsselpaar je Unterzeichner**, nicht ein Plattformschlüssel für alle (lit. a).
2. Eine **belastbare Identifizierung** (lit. b). Der Nachweis einer E-Mail-Adresse ist schwach, ein Ausweis- oder eID-Abgleich ist stark.
3. **Alleinige Kontrolle mit hohem Vertrauen** (lit. c):
   - starke Authentifizierung bei jeder Auslösung;
   - technische Sperre, damit der Betreiber den Schlüssel nicht selbst auslösen kann (z. B. HSM mit Signaturaktivierungsmodul);
   - Referenz: CEN EN 419241-1, Stufen SCAL1 und SCAL2. Der Normtext wurde nicht gelesen.
4. **Erkennen nachträglicher Änderungen** (lit. d) durch eine PAdES-Signatur über das Dokument.

**Bewertung (unsicher):**
- Ein Plattformschlüssel mit E-Mail-OTP ist nach hier vertretener Einschätzung **keine FES**, sondern eher ein Betreibersiegel über ein Ereignisprotokoll.
- Eine amtliche Leitlinie (BSI, BNetzA, Kommission) zu genau dieser Konstellation wurde nicht gefunden.
- **Produktempfehlung:**
  - Nach außen „EES mit Prüfprotokoll“ zusagen.
  - „FES“ nur ausweisen, wenn die Punkte 1 bis 4 nachweisbar umgesetzt sind.
  - Für Deutschland ist das ohnehin zweitrangig, weil das deutsche Recht die FES nirgends als Formersatz verlangt. Formersatz bietet nur die QES (§ 126a BGB).

**QES – nie ohne QTSP.**
- Art. 3 Nr. 12 verlangt ein qualifiziertes Zertifikat und eine QSCD.
- Seit 2024/1183 darf nur ein QTSP Fernsignaturschlüssel verwalten.
- QES gibt es also nur über die Anbindung eines QTSP (Fernsignatur-API) oder über eine Karte bzw. einen Token des Unterzeichners (z. B. beA-Karte Signatur, nicht Teil dieser Recherche).

### 2.3 QES-Anbieter mit Fernsignatur-API

**CSC-API:**
- Aktuell v2.2 vom 06.11.2025. Download nur über ein Formular: https://cloudsignatureconsortium.org/resources/csc-api-v2-2/
- v2.0.0.2 als PDF: https://cloudsignatureconsortium.org/wp-content/uploads/2023/04/csc-api-v2.0.0.2.pdf
- Eine CSC-Mitgliedschaft (https://cloudsignatureconsortium.org/our-members/) beweist **keine** öffentlich nutzbare CSC-Schnittstelle.

| Anbieter | CSC-API | Entwicklerzugang / Sandbox ohne Vertrag | Preise öffentlich | Quelle |
|---|---|---|---|---|
| D-Trust / Bundesdruckerei (sign-me) | ja (laut Adobe-Doku) | nein, Zugang über den Vertrieb | nein | https://helpx.adobe.com/document-cloud/digital-identity/d-trust.html |
| Swisscom Trust Services (AIS) | unsicher; eigene Schnittstelle und ETSI TS 119 432 dokumentiert | Handbuch öffentlich, Zugang per Vertrag | nein | https://trustservices.swisscom.com/hubfs/Website%20Files/Documents/Developer%20Documentation/Reference_Guide-All-in-Signing-Service-en.pdf |
| Namirial (SignBox) | unsicher | OpenAPI- und Postman-Doku öffentlich, Sandbox unklar | nein | https://docs.namirial.app/products/namirialpkiaas/signbox/enterprise-documentation/developer-documentation/overview.md |
| InfoCert | unsicher | nein (nichts gefunden) | nein | https://knowledgecenter.infocert.digital/documents/Guide%20to%20manage%20a%20remote%20signature%20certificate_2023.pdf |
| Intesi Group (PkBox Remote, Time4Mind) | ja (Anbieterangabe), SDKs für Java und .NET | nein, über den Vertrieb | nein | https://www.intesigroup.com/en/digital-signature-software/pkbox-remote-as-a-service/ |
| A-Trust (ID Austria) | unsicher | nein | nein | https://www.a-trust.at/docs/rk/asignRKHSMDeveloper_en.pdf |
| Certum (SimplySign) | ja (laut Faltblatt) | Doku nicht gefunden | nein | https://files.certum.eu/documents/a-leaflet-certum-2021/Leaflet-certum-simplysign.pdf |
| SK ID Solutions (Smart-ID) | nein, eigene RP-API v3 | **ja**, Demo-Umgebung; Produktivbetrieb per Vertrag | nein | https://github.com/SK-EID/smart-id-java-client |
| Evrotrust | nicht als CSC dokumentiert | öffentliche API-Doku, Testzugang auf E-Mail-Anfrage | nein | https://docs.evrotrust.com/reference/server-sign |
| Skribble | nein, eigene Sign-API (eIDAS- oder ZertES-QES) | Demo-Konto auf Anfrage; im Scale-Plan enthalten | **ja**: Team 23 €, Pro 36 € pro Nutzer und Monat, zusätzliche QES 4–4,50 € | https://www.skribble.com/en-eu/dev_pricing/, https://api.docs.skribble.com/ |
| SSL.com (eSigner) | ja | **ja**, öffentliche Sandbox | – | https://www.ssl.com/guide/integration-guide-testing-remote-signing-with-esigner-csc-api/. **Status als eIDAS-QTSP nicht belegt**, belegt ist nur AATL. |
| Entrust, GlobalSign | unsicher (CSC-Mitglieder) | nicht geprüft | – | – |

**Befund:**
- Echte Self-Service-Zugänge zu **EU-qualifizierter** Fernsignatur gibt es kaum. Am offensten sind Skribble (Preise veröffentlicht), SK ID (Demo) und Evrotrust (Test auf Anfrage).
- Für Deutschland naheliegend: D-Trust sign-me oder Swisscom AIS, beide per Vertrag.
- Der QTSP-Status ist vor jeder Anbindung in der Vertrauensliste zu prüfen:
  - EU TL Browser (Anzeige-Werkzeug): https://eidas.ec.europa.eu/efda/tl-browser
  - Rechtlich maßgeblich sind die signierten nationalen Vertrauenslisten (Art. 22). Erläuterung der Kommission: https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eIDAS+Dashboard

### 2.4 RFC-3161-Zeitstempel

Rechtsgrundlage: RFC 3161, https://www.rfc-editor.org/rfc/rfc3161.

**Kostenlose Dienste**

Alle sind **nicht qualifiziert**. Sie haben Beweiswert nach Art. 41 Abs. 1, aber keine Vermutungswirkung nach Abs. 2.

- **FreeTSA:**
  - Endpunkt `https://freetsa.org/tsr`, SHA-1 bis SHA-512.
  - höchstens 1 Anfrage pro Sekunde und IP-Adresse; Betrieb nach bestem Bemühen, keine SLA; kommerzielle Nutzung erlaubt.
  - Kein eIDAS-Status. Für eine Kanzlei ist ein Ein-Personen-Dienst ohne SLA nur als Zweit-TSA geeignet.
  - Quellen: https://www.freetsa.org/index_en.php, https://www.freetsa.org/freetsa.html
- **DigiCert:**
  - Endpunkt `http://timestamp.digicert.com`, ausgerichtet auf Codesignierung.
  - Nutzungsbedingungen und Rate-Limit sind nicht veröffentlicht (unsicher).
  - Quelle: https://knowledge.digicert.com/general-information/rfc3161-compliant-time-stamp-authority-server
- **Sectigo:**
  - Endpunkt `http://timestamp.sectigo.com`; bei Skripten mindestens 15 Sekunden Abstand.
  - Zusätzlich gibt es `http://timestamp.sectigo.com/qualified`. Ob dieser Endpunkt kostenlos und tatsächlich qualifiziert ist, ist ungeprüft (unsicher, Vertrauensliste prüfen).
  - Quelle: https://www.sectigo.com/resource-library/time-stamping-server
- **GlobalSign und Entrust:** Öffentliche Endpunkte sind nur aus Drittquellen bekannt (unsicher). Offiziell ist GlobalSign ein kostenpflichtiger Dienst: https://globalsign.com/timestamp-service
- **Apple und SwissSign:** Kein offiziell dokumentierter öffentlicher RFC-3161-Dienst gefunden.

**Qualifiziert, kostenpflichtig** (Vertrauensliste prüfen):
- **D-Trust:** https://www.d-trust.de/files/dokumente/pdf/produktblatt_qualifizierte_zeitstempel.pdf
- **Swisscom IT Services Finance S.E.:** https://trustservices.swisscom.com/en/about-us/news/swisscom-becomes-issuer-of-an-eu-eidas-qualified-time-stamp. Bei AIS-Signaturen laut Factsheet inklusive.
- **Laut Eigenangabe, nicht geprüft:** DGN und GlobalTrust.

**Empfehlung:**
- Standardmäßig zwei unabhängige freie TSAs anfragen, z. B. FreeTSA und DigiCert. Die Antworten (TSR) im Dokument (PAdES-LTA bzw. DocTimeStamp) und im Prüfprotokoll ablegen.
- Einen qualifizierten Zeitstempel als konfigurierbare Option anbieten.

---

## Teil 3 – Wettbewerb

Stand der Abrufe: 22.10.2026. Quellen sind überwiegend Herstellerseiten und Repositories.
- G2 und Capterra waren nicht abrufbar (HTTP 403). Nutzerkritik stammt deshalb aus GitHub-Issues und Trustpilot und ist **anekdotisch**.
- Preise können sich kurzfristig ändern.

### DocuSeal
**Lizenz**
- AGPL-3.0 **mit Zusatzbedingungen nach Section 7(b)**: Die DocuSeal-Attribution in der Oberfläche muss erhalten bleiben.
- Den Volltext der Zusatzbedingungen wurde nur sinngemäß geprüft (mittel).
- Quelle: https://github.com/docusealco/docuseal/blob/master/LICENSE_ADDITIONAL_TERMS

**Open-Source-Version** (https://github.com/docusealco/docuseal)
- PDF-Feldeditor mit 12 Feldtypen, mehrere Unterzeichner
- SMTP; Speicher Disk, S3, GCS oder Azure
- automatische PDF-Signatur und Prüfung
- Benutzerverwaltung, mobil optimiert
- API und Webhooks

**Nur in Pro** (README, https://www.docuseal.com/pricing)
- Firmenlogo und White-Label
- Rollen und Teams
- automatische Erinnerungen
- SMS-Einladung und SMS-2FA
- bedingte Felder und Formeln (https://www.docuseal.com/resources/add-conditional-fields)
- Massenversand (CSV/XLSX)
- SSO/SAML
- eigene Absenderadresse
- Vorlagen aus HTML oder DOCX-Tags
- Embedding

**Preise**
- Cloud Pro: 20 $ pro Nutzer und Monat.
- On-Prem Pro: 20 $ pro Nutzer und Monat bzw. 240 $ pro Jahr.
- API und Embedding im Produktivbetrieb: **0,20 $ pro abgeschlossenem Dokument, auch selbst gehostet**.
- Add-ons: QES (EU) 2–4 $, Ausweisprüfung 2 $.

**Kritik**
- Self-Hoster zahlen den gleichen Preis wie in der Cloud, schon das Logo kostet. Nutzer nennen das einen „Dealbreaker“.
- Quelle: https://github.com/docusealco/docuseal/discussions/273

### DocuSign eSignature (DE-Shop, Jahrespreise)
**Pläne** (https://ecom.docusign.com/plans-and-pricing/esignature)
- Personal: 9 € pro Monat, 5 Umschläge pro Monat.
- Standard: 23 € pro Nutzer und Monat.
- Business Pro: 38 € pro Nutzer und Monat.
- Erweiterte Pläne (Enhanced): auf Anfrage, ab etwa 50 Nutzern. Enthalten sind SSO, FES/QES und 24/7-Support.

**Umschlag-Limit**
- Standard und Business Pro: **100 Umschläge pro Nutzer und Jahr** (monatlich 10).
- Jeder gesendete Umschlag zählt, auch ohne Unterschrift.

**Erst ab Business Pro**
- Massenversand, Zahlungen, Unterzeichner-Anhänge, PowerForms, Webformulare
- Dropdown- und Radio-Felder, gesperrte Vorlagen

**Erst ab Enhanced**
- bedingtes Routing, SSO

**SMS- und ID-Prüfung**
- Kontingente pro Vorgang. Bei Business Pro steht für SMS und Telefon „Vertrieb kontaktieren“.
- Die Planzuordnung bedingter Felder ist nicht sicher geklärt (unsicher).

**Kritik**
- Trustpilot 1,3/5 bei etwa 1.270 Bewertungen.
- Themen: kaum menschlicher Support, automatische Verlängerung und Kündigung, Erstattungen, verwirrende Oberfläche.
- Quelle: https://www.trustpilot.com/review/docusign.com

### Documenso
**Lizenz**
- AGPL-3.0 (Community Edition), dazu eine kommerzielle Enterprise Edition aus derselben Codebasis.
- Selbst gehostet nur mit Lizenzschlüssel: **SSO, White-Label für den eingebetteten Editor, 21 CFR Part 11**.
- Quellen: https://github.com/documenso/documenso, https://docs.documenso.com/docs/self-hosting, https://docs.documenso.com/docs/policies/enterprise-edition

**Cloud-Pläne** (https://documenso.com/pricing)
- Free: 5 Dokumente pro Monat.
- Individual: 25 $ pro Monat.
- Teams: 40 $ pro Monat für 5 Nutzer.
- Platform: 250 $ pro Monat, mit White-Label-Embedding.
- Ob „Teams“ selbst gehostet frei ist, ist unsicher.

**Kritik (GitHub-Issues)** (https://github.com/documenso/documenso/issues?q=is%3Aissue+mobile+signing)
- Mobile-Probleme bei vielen Feldern oder Seiten (#2092, #2531)
- Eingabedialog bei Zoom außerhalb des Bildschirms (#3333)
- Zahlenfelder mobil defekt (#1850)
- Unterzeichner findet die Aktion nicht (#1503)

### OpenSign
**Lizenz und Funktionen** (https://github.com/OpenSignLabs/OpenSign)
- AGPL-3.0, Docker.
- Mehrere Unterzeichner mit Reihenfolge, E-Mail-OTP
- Ablauf und Ablehnung
- Erinnerungen, Vorlagen
- Prüfprotokoll und Abschlusszertifikat

**Bezahlschranken (offiziell)**
- Free: 15 Einladungs-Mails pro Monat.
- API, Massenversand und öffentliche Links verbrauchen Credits.
- Live-Webhooks nur in bezahlten Plänen.
- Quellen: https://www.opensignlabs.com/post/understanding-unlimited-signatures-on-opensign, https://docs.opensignlabs.com/docs/help/Settings/Webhook
- Preise nur aus Drittquellen bekannt, deshalb unsicher.

**Kritik (GitHub-Issues)** (https://github.com/OpenSignLabs/OpenSign/issues?q=is%3Aissue+self-host)
- brüchige Docker-Installation (#1915, #2242, #2255)
- fehlendes SSO, LDAP und Keycloak (#2172, #1724, #2133)

### Künstlich hinter Bezahlstufen

Gemeint ist: Bei Selbsthosting entstehen dem Anbieter dafür keine Stückkosten.
- **Eigenes Logo und White-Label:** DocuSeal Pro, Documenso Platform bzw. EE
- **Bedingte Felder und Formeln:** DocuSeal Pro. **Bedingtes Routing:** DocuSign Enhanced
- **Massenversand:** DocuSeal Pro, DocuSign ab Business Pro, OpenSign-Credits
- **Erinnerungen, Rollen und Teams:** DocuSeal Pro, Documenso Teams
- **SSO/SAML:** DocuSeal Pro, Documenso EE, DocuSign Enhanced
- **Gebühr pro Dokument für API und Embedding trotz Selbsthosting:** DocuSeal
- **Webhooks:** OpenSign
- **Unterzeichner-Anhänge, Dropdown- und Radio-Felder, gesperrte Vorlagen:** DocuSign ab Business Pro
- **Umschlag-Kontingente:** DocuSign

Echte Stückkosten haben nur SMS, Ausweisprüfung, KBA und QES. Deren Preise pro Vorgang sind sachlich begründbar.

### Wiederkehrende Nutzerkritik (anekdotisch)
- Preis pro Nutzer auch beim Selbsthosting
- Umschlag-Limits
- Support sowie Verlängerungs- und Kündigungspraxis (DocuSign)
- mobiles Signieren und Feldeditor bei vielen Feldern oder Seiten
- brüchige Erstinstallation (OpenSign)
- fehlendes SSO in Open-Source-Varianten

---

## Offene Punkte und Unsicherheiten (Sammelliste)
1. **Prozessvollmacht, § 80 ZPO, und Vollmachtsurkunde, § 174 BGB:** Ob ein QES-signiertes PDF das Original ersetzt, ist nicht geklärt. Bis dahin Papieroriginal empfehlen.
2. **§ 74 HGB:** Ob die „Aushändigung“ elektronisch erfolgen kann, ist umstritten. QES oder Papier empfehlen.
3. **Art. 7 DSGVO:** Der Wortlaut wurde nicht abgerufen, weil EUR-Lex blockiert war. Er stammt aus Vorkenntnis.
4. **BEG IV:** Die Zuordnung von § 12 AÜG und § 41 Abs. 3 SGB VI zum BEG IV ist nicht belegt. Der Wortlaut der Normen selbst ist geprüft.
5. **§ 356a BGB (Widerrufsfunktion):** Ob er auf das Signieren eines Mandatsvertrags über die Plattform anwendbar ist, wurde nicht geprüft.
6. **Ausnahmen § 350 HGB und § 782 BGB:** nicht abgerufen. Die Regel-Engine kann sie nicht erkennen, deshalb nur warnen, nicht blockieren.
7. **FES-Einstufung einer Plattform ohne QTSP:** Keine amtliche Leitlinie gefunden. Ob ein Rechtsakt nach Art. 26 Abs. 2 eIDAS erlassen wurde, ist offen.
8. **QES-Anbieter:** CSC-Status von Swisscom, Namirial, InfoCert und A-Trust ist unsicher. Preise von D-Trust und Swisscom sind nicht öffentlich.
9. **Wettbewerb:** OpenSign-Preise nur aus Drittquellen. Bei DocuSign ist die Planzuordnung bedingter Felder unsicher. Ob Documenso „Teams“ selbst gehostet frei ist, ist offen.
