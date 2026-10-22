# Formhinweise, Plattformtexte und Erklärungstexte – juristische Vorprüfung

> **STATUS: NICHT ANWALTLICH FREIGEGEBEN.** Dieses Dokument ist eine technische Vorbereitung für die anwaltliche Prüfung. Es ersetzt keine Rechtsberatung und keine Einzelfallprüfung. Bewertungen sind Vorschläge.

Stand: 22.10.2026. Geprüfter Code-Stand: Arbeitskopie auf `b309198` mit nicht committeten Änderungen in `src/server/domain/finalize.ts` (Verankerung, Integritätsprüfung). Zeilennummern beziehen sich auf diesen Stand.

Freigabeliste mit Kästchen: [FREIGABELISTE.md](FREIGABELISTE.md).

## Methodik und Kennzeichnung

- **Primärquelle abgerufen (22.10.2026, gesetze-im-internet.de, Rohtext):** § 126a, § 126b, § 492, § 550, § 557a, § 578, § 623, § 630, § 782, § 1820 BGB; § 109 GewO; § 2 NachwG; § 14 TzBfG; § 74, § 257, § 350 HGB; § 43e, § 49b, § 50, § 52 BRAO; § 3a RVG; § 80, § 130a, § 371a ZPO; § 3a VwVfG; § 147 AO; § 12 GwG. Diese Normen sind im Text mit **[GII]** markiert.
- **Aus der Vorrecherche übernommen** (`docs/recherche/formvorschriften-und-markt.md`, dort ebenfalls von gesetze-im-internet.de abgerufen, hier nicht erneut geprüft): § 126, § 127, § 568, § 766, § 780, § 781, § 2247, § 311b BGB; § 77 BetrVG; § 1031 ZPO; § 15 GmbHG; eIDAS-Artikel. Markiert mit **[Rech.]**.
- **Aus Vorkenntnis, nicht abgerufen:** markiert mit **[nicht abgerufen]**.
- **Unverifiziert:** Rechtsänderungen oder Rechtsprechung, die ich nicht an einer Primärquelle prüfen konnte, sind ausdrücklich mit **„unverifiziert“** gekennzeichnet.

### Korrektur einer Prämisse aus dem Prüfauftrag

Im Auftrag stand: „§ 109 GewO Textform für Arbeitszeugnis mit Einwilligung“. Das trifft nach dem abgerufenen Wortlaut **nicht** zu. § 109 Abs. 3 GewO [GII] lautet: „Das Zeugnis kann mit Einwilligung des Arbeitnehmers in elektronischer Form erteilt werden.“ Elektronische Form ist § 126a BGB, also QES. Textform (§ 126b BGB) genügt nicht. § 630 S. 3 BGB [GII] ist gleich gefasst. Der Katalog (QES) ist hier richtig.

Ebenso: Die Textform bei der Gewerbemiete steht nicht in § 550 BGB, sondern in § 578 Abs. 1 S. 2 BGB [GII] („§ 550 ist mit der Maßgabe anzuwenden, dass ein Mietvertrag, der für längere Zeit als ein Jahr nicht in Textform geschlossen wird, für unbestimmte Zeit gilt“). § 550 BGB selbst verlangt für Wohnraum weiter die schriftliche Form [GII].

### Bewertungsskala

| Bewertung | Bedeutung |
|---|---|
| zutreffend | Aussage stimmt; allenfalls Ergänzungen |
| ungenau | Kern richtig, aber Bedingungen, Ausnahmen oder Rechtsfolge fehlen oder sind unscharf |
| falsch | Aussage widerspricht dem Gesetz |
| zu riskant | Aussage könnte Nutzer zu einer formunwirksamen Erklärung verleiten oder Sicherheit vortäuschen |

### Mindestniveau-Begriffe

keine Form · Textform (§ 126b BGB) · EES · FES · QES (= elektronische Form § 126a BGB) · Schriftform, nicht elektronisch ersetzbar (Papier) · notariell.

Hinweis zur Technik: Der Code kennt nur `NONE`, `TEXT`, `QES`, `PAPER`, `NOTARY` (`src/shared/formrules.ts:6`). FES taucht als Mindestniveau im deutschen Privatrecht praktisch nicht auf; das deutsche Recht verlangt die FES nirgends als Formersatz [Rech.]. Das Fehlen der Stufe FES im Katalog ist daher sachgerecht.

---

## Teil A – Katalog `src/shared/formrules.ts`, Eintrag für Eintrag

### A1 `arbeit_kuendigung` – § 623 BGB (formrules.ts:24–33)

- **Kernaussage Hinweis:** Kündigung und Aufhebungsvertrag nur mit Originalunterschrift auf Papier; jede E-Signatur inkl. QES unwirksam.
- **Rechtsgrundlage:** § 623 BGB [GII]: „bedürfen zu ihrer Wirksamkeit der Schriftform; die elektronische Form ist ausgeschlossen.“ Rechtsfolge § 125 S. 1 BGB (Nichtigkeit). § 126 Abs. 2 BGB: beim Aufhebungsvertrag Unterschrift beider Parteien auf derselben Urkunde (oder gleichlautende Urkunden je Partei) [Rech.].
- **Mindestniveau:** Schriftform, nicht elektronisch ersetzbar.
- **Grenzen/Ausnahmen:** Schriftform wird durch notarielle Beurkundung ersetzt (§ 126 Abs. 4 BGB) [Rech.]; ein Aufhebungsvertrag kann als gerichtlicher Vergleich geschlossen werden (§ 127a BGB, § 278 Abs. 6 ZPO) [nicht abgerufen]. Gilt für Kündigungen beider Seiten. Rechtsänderungen bis 22.10.2026: Wortlaut heute unverändert [GII]; ob ein Gesetzentwurf zur Lockerung anhängig ist, habe ich nicht geprüft (unverifiziert).
- **Bewertung:** **zutreffend.** Kleine Ergänzung sinnvoll.
- **Vorschlag:** „Kündigungen und Aufhebungsverträge im Arbeitsverhältnis sind nur mit eigenhändiger Unterschrift auf Papier wirksam (beim Aufhebungsvertrag beide Parteien auf derselben Urkunde). Jede elektronische Signatur – auch die QES – führt zur Unwirksamkeit. Ausnahmen: notarielle Beurkundung, gerichtlicher Vergleich.“

### A2 `buergschaft` – § 766 BGB (formrules.ts:34–43)

- **Kernaussage:** Bürgschaftserklärung eigenhändig auf Papier; elektronische Form ausgeschlossen; Ausnahme Kaufleute § 350 HGB.
- **Rechtsgrundlage:** § 766 S. 1, 2 BGB [Rech.]; § 350 HGB [GII]: Formvorschriften gelten nicht, „sofern die Bürgschaft auf der Seite des Bürgen … ein Handelsgeschäft ist“. Heilung durch Erfüllung, § 766 S. 3 BGB [nicht abgerufen].
- **Mindestniveau:** Schriftform, nicht elektronisch ersetzbar (nur Erklärung des Bürgen; die Annahme durch den Gläubiger ist formfrei).
- **Grenzen:** „Kaufleute“ ist zu weit: Maßgeblich ist, dass die Bürgschaft **für den Bürgen** ein Handelsgeschäft ist. Die Vollmacht zur Bürgschaftserteilung bedarf nach BGH-Rechtsprechung ebenfalls der Schriftform [nicht abgerufen, unverifiziert]. Musterfalle: Das Muster `/bürgschaft/` trifft auch Mietverträge mit Mietsicherheitsklausel („Bankbürgschaft“) – Fehlalarm möglich, aber unschädlich (nur Bestätigung).
- **Bewertung:** **ungenau** (Ausnahme zu weit formuliert).
- **Vorschlag:** „Die Bürgschaftserklärung muss der Bürge eigenhändig auf Papier unterschreiben; die elektronische Form ist gesetzlich ausgeschlossen. Ausnahme: Die Bürgschaft ist für den Bürgen ein Handelsgeschäft (§ 350 HGB) – bitte prüfen. Die Annahme durch den Gläubiger ist formfrei.“

### A3 `schuldversprechen` – §§ 780, 781 BGB (formrules.ts:44–53)

- **Kernaussage:** Schuldversprechen/-anerkenntnis eigenhändig auf Papier; Ausnahmen § 782 BGB, § 350 HGB.
- **Rechtsgrundlage:** §§ 780, 781 BGB [Rech.]; § 782 BGB [GII]: keine Schriftform, wenn „auf Grund einer Abrechnung oder im Wege des Vergleichs erteilt“; § 350 HGB [GII].
- **Mindestniveau:** Schriftform, nicht elektronisch ersetzbar – **nur** beim selbständigen (konstitutiven, abstrakten) Versprechen/Anerkenntnis. Das deklaratorische (kausale) Anerkenntnis ist gesetzlich formfrei [nicht abgerufen; ständige Rspr.].
- **Grenzen:** Das Muster `/schuldanerkenntnis/` trifft praktisch jedes Anerkenntnis in Vergleichen und Ratenzahlungsvereinbarungen. Gerade in der Kanzleipraxis sind das meist § 782-Fälle oder deklaratorische Anerkenntnisse. § 781 S. 3 BGB (strengere Form des Grundgeschäfts) fehlt [nicht abgerufen].
- **Bewertung:** **ungenau** – der Hinweis unterscheidet nicht zwischen konstitutivem und deklaratorischem Anerkenntnis und wirkt dadurch strenger als das Gesetz. Für Nutzer ist das eher zu vorsichtig als zu riskant.
- **Vorschlag:** „Ein selbständiges (abstraktes) Schuldversprechen oder Schuldanerkenntnis muss der Schuldner eigenhändig auf Papier unterschreiben; die elektronische Form ist ausgeschlossen. Formfrei sind: das bloß bestätigende (deklaratorische) Anerkenntnis, ein Anerkenntnis im Vergleich oder aufgrund einer Abrechnung (§ 782 BGB) und Handelsgeschäfte des Schuldners (§ 350 HGB). Bitte im Einzelfall prüfen.“

### A4 `testament` – § 2247 BGB (formrules.ts:54–63)

- **Kernaussage:** vollständig handschriftlich oder notariell; elektronisch unwirksam.
- **Rechtsgrundlage:** § 2247 Abs. 1 BGB [Rech.]; öffentliches Testament § 2231 Nr. 1, § 2232 BGB [nicht abgerufen]; gemeinschaftliches Testament § 2267 BGB (einer schreibt, beide unterschreiben) [nicht abgerufen].
- **Mindestniveau:** eigenhändig geschrieben und unterschrieben (strenger als Schriftform) oder notariell.
- **Grenzen:** Nottestamente (§§ 2249–2251 BGB) bleiben außen vor; für das Produkt unerheblich.
- **Bewertung:** **zutreffend.**
- **Vorschlag:** unverändert; optional: „… beim gemeinschaftlichen Testament genügt es, wenn ein Ehegatte den Text eigenhändig schreibt und beide eigenhändig unterschreiben (§ 2267 BGB).“

### A5 `notariell` – §§ 311b, 518, 1410, 2276, 2348 BGB; §§ 2, 15 GmbHG (formrules.ts:64–73)

- **Kernaussage:** aufgezählte Geschäfte nur notariell; E-Signatur genügt nicht.
- **Rechtsgrundlage:** § 311b Abs. 1, 3, 5 BGB; § 518 Abs. 1 BGB; § 1410 BGB; § 2276 BGB; § 2348 BGB (über § 2346 Abs. 2 auch Pflichtteilsverzicht); § 2 Abs. 1, 3 GmbHG (auch Online-Beurkundung §§ 16a ff. BeurkG); § 15 Abs. 3, 4 GmbHG [Rech.]. **Auflassung § 925 BGB** (gleichzeitige Anwesenheit vor dem Notar) [nicht abgerufen] – das Muster `/\bauflassung\b/` ist vorhanden, die Norm fehlt in `norm`.
- **Mindestniveau:** notariell.
- **Grenzen:** Heilung durch Vollzug (§ 311b Abs. 1 S. 2, § 518 Abs. 2 BGB, § 15 Abs. 4 S. 2 GmbHG) – Hinweis sinnvoll, weil Nutzer sonst eine „Nichtigkeit für immer“ annehmen. Ein privatschriftlicher **Entwurf** zur Abstimmung vor dem Notartermin ist unproblematisch; das kann der Katalog nicht erkennen.
- **Bewertung:** **zutreffend**, Norm-Liste unvollständig.
- **Vorschlag `norm`:** `§§ 311b, 518, 925, 1410, 2276, 2348 BGB; §§ 2, 15 GmbHG`. **Hinweis:** „Grundstücksgeschäfte und Auflassung, Schenkungsversprechen, Eheverträge, Erbverträge, Erb- und Pflichtteilsverzichte, GmbH-Gründungen und Anteilsabtretungen müssen notariell beurkundet werden. Eine elektronische Signatur genügt nicht. Paraph eignet sich hier allenfalls für die Abstimmung eines Entwurfs.“

### A6 `befristung` – § 14 Abs. 4 TzBfG (formrules.ts:74–83)

- **Kernaussage:** Schriftform; elektronisch nur QES beider Seiten vor Arbeitsantritt; sonst unbefristet.
- **Rechtsgrundlage:** § 14 Abs. 4 TzBfG [GII]: „bedarf zu ihrer Wirksamkeit der Schriftform.“ Kein Ausschluss der elektronischen Form → § 126 Abs. 3, § 126a Abs. 2 BGB [GII]. Rechtsfolge § 16 TzBfG (gilt als unbefristet; ordentliche Kündigung auch vor dem vereinbarten Ende möglich) [nicht abgerufen]. „Vor Arbeitsantritt“: ständige BAG-Rspr., nachträgliche Schriftform heilt nicht [nicht abgerufen].
- **Mindestniveau:** QES (beide Seiten, gleichlautendes Dokument).
- **Grenzen:** Ausnahme § 41 S. 3 SGB VI (Beendigung mit Regelaltersgrenze: Textform) [Rech., Zuordnung zu BEG IV dort offen]. § 14 Abs. 4 gilt über § 21 TzBfG auch für auflösende Bedingungen [nicht abgerufen]. Rechtsänderungen: Wortlaut heute unverändert [GII]; Reformvorhaben zur Textform habe ich nicht verifiziert (unverifiziert).
- **Bewertung:** **zutreffend.**
- **Vorschlag:** „Die Befristungsabrede braucht Schriftform. Elektronisch wirksam nur, wenn beide Seiten dasselbe bzw. ein gleichlautendes Dokument mit QES unterzeichnen – und zwar vor Arbeitsantritt. Sonst gilt der Vertrag als unbefristet (§ 16 TzBfG). Ausnahme: Beendigung mit Erreichen der Regelaltersgrenze, dort genügt Textform (§ 41 SGB VI).“

### A7 `zeugnis` – § 109 GewO (formrules.ts:84–93)

- **Kernaussage:** elektronisch nur QES + Einwilligung, sonst Papier.
- **Rechtsgrundlage:** § 109 Abs. 1, 3 GewO [GII]; § 630 S. 3, 4 BGB [GII].
- **Mindestniveau:** QES **und** Einwilligung des Arbeitnehmers; ohne Einwilligung Papier.
- **Grenzen:** Im Produkt unterschreibt typischerweise nur der Arbeitgeber. Die Einwilligung des Arbeitnehmers ist formlos, sollte aber nachweisbar eingeholt werden. Entgegen der Auftragsprämisse **keine Textform** (siehe oben).
- **Bewertung:** **zutreffend.**
- **Vorschlag:** „Ein elektronisches Zeugnis ist nur zulässig, wenn der Arbeitnehmer eingewilligt hat und der Arbeitgeber es mit QES unterzeichnet (elektronische Form, § 126a BGB). Textform oder eine einfache elektronische Signatur genügen nicht. Sonst auf Papier unterschreiben.“

### A8 `wettbewerbsverbot` – § 74 HGB (formrules.ts:94–103)

- **Kernaussage:** Schriftform + Aushändigung einer unterzeichneten Urkunde; QES oder Papier sicher; elektronische Aushändigung ungeklärt.
- **Rechtsgrundlage:** § 74 Abs. 1 HGB [GII]; Karenzentschädigung Abs. 2 [GII]; Anwendung auf alle Arbeitnehmer über § 110 S. 2 GewO [nicht abgerufen].
- **Mindestniveau:** QES (unsicher), sicher: Papier.
- **Grenzen:** Gilt nicht unmittelbar für Organmitglieder (GmbH-Geschäftsführer) [nicht abgerufen]. Fehlende Form → nichtig; fehlende/zu geringe Karenzentschädigung → unverbindlich (Wahlrecht des Arbeitnehmers) [nicht abgerufen].
- **Bewertung:** **zutreffend** (confidence „mittel“ angemessen).
- **Vorschlag:** unverändert; Ergänzung: „Ohne Zusage einer Karenzentschädigung von mindestens der Hälfte der zuletzt bezogenen Leistungen ist das Verbot unverbindlich (§ 74 Abs. 2 HGB).“

### A9 `betriebsvereinbarung` – § 77 Abs. 2 BetrVG (formrules.ts:104–113)

- **Kernaussage:** elektronisch nur QES von Arbeitgeber und Betriebsrat auf demselben Dokument.
- **Rechtsgrundlage:** § 77 Abs. 2 S. 1–3 BetrVG [Rech.] („abweichend von § 126a Absatz 2 … dasselbe Dokument elektronisch signieren“).
- **Mindestniveau:** QES beider Seiten auf einem Dokument.
- **Grenzen:** Muster `/betriebsvereinbarung/` trifft auch Arbeitsverträge, die bloß auf Betriebsvereinbarungen verweisen (Fehlalarm → unnötige Bestätigungspflicht bei EES). Gleiches gilt für Sprüche der Einigungsstelle (§ 76 Abs. 3 BetrVG) [nicht abgerufen].
- **Bewertung:** **zutreffend.** Technisch: Muster verengen (z. B. Titel enthält „Betriebsvereinbarung“).
- **Vorschlag:** „Elektronisch nur wirksam, wenn Arbeitgeber und Betriebsrat dasselbe Dokument mit QES unterzeichnen; gleichlautende Exemplare genügen hier nicht.“

### A10 `verbraucherdarlehen` – § 492 BGB (formrules.ts:114–123)

- **Kernaussage:** Schriftform; elektronisch nur QES des Darlehensnehmers; Vollmachten ebenso.
- **Rechtsgrundlage:** § 492 Abs. 1 S. 1–3, Abs. 4 BGB [GII]. Anwendungsbereich § 491 BGB (Unternehmer als Darlehensgeber, Verbraucher als Darlehensnehmer) [nicht abgerufen]. Rechtsfolge § 494 BGB (nichtig, Heilung durch Auszahlung mit reduziertem Zins) [nicht abgerufen].
- **Mindestniveau:** QES des Darlehensnehmers; Erklärung des Darlehensgebers bei automatischer Erstellung ohne Unterschrift.
- **Grenzen:** Muster `/darlehensvertrag/` trifft jedes Darlehen, auch Privat- und Gesellschafterdarlehen, für die § 492 nicht gilt. Abs. 4 S. 2: Prozessvollmacht und notariell beurkundete Vollmacht ausgenommen [GII]. **Rechtsänderung:** Das Gesetz zur Umsetzung der Verbraucherkreditrichtlinie (EU) 2023/2225 ist laut Sekundärquellen im BGBl. 2026 I Nr. 139 verkündet und tritt am 20.11.2026 in Kraft. Ob es § 492 Abs. 1 (Form) ändert und ob es den Anwendungsbereich (z. B. Kleinkredite, BNPL) erweitert, habe ich nicht am Gesetzestext geprüft – **unverifiziert**, vor dem 20.11.2026 prüfen.
- **Bewertung:** **ungenau** (Anwendungsbereich fehlt).
- **Vorschlag:** „Gilt nur, wenn ein Unternehmer einem Verbraucher ein Darlehen gewährt (§ 491 BGB). Dann Schriftform: elektronisch nur mit QES des Darlehensnehmers. Auch die Vollmacht des Darlehensnehmers braucht diese Form, außer Prozessvollmacht und notariell beurkundete Vollmacht. Achtung: Neufassung des Verbraucherkreditrechts ab 20.11.2026 prüfen.“

### A11 `wohnraummiete_kuendigung` – § 568 BGB (formrules.ts:124–133)

- **Kernaussage:** Kündigung von Wohnraum: Papier oder QES; EES unwirksam.
- **Rechtsgrundlage:** § 568 Abs. 1 BGB [Rech.]; kein Ausschluss der elektronischen Form → § 126 Abs. 3 BGB.
- **Mindestniveau:** QES.
- **Grenzen:** Kündigung durch Bevollmächtigten (Anwalt): Zurückweisungsrisiko nach § 174 BGB → siehe A17. Gewerberaumkündigung gesetzlich formfrei, vertragliche Klauseln § 127 BGB [Rech.]. Hinweis auf Widerspruchsrecht § 568 Abs. 2 BGB (Sollvorschrift) [nicht abgerufen].
- **Bewertung:** **zutreffend.** Praktisch wichtig: Eine QES-Kündigung muss dem Empfänger als elektronisches Dokument mit prüfbarer Signatur **zugehen**; ein Ausdruck des QES-PDF ist keine Schriftform [nicht abgerufen, herrschende Auffassung].
- **Vorschlag:** „Die Kündigung von Wohnraum braucht Schriftform: Papier oder QES (die signierte Datei muss dem Empfänger elektronisch zugehen, ein Ausdruck genügt nicht). Eine einfache elektronische Signatur ist unwirksam. Bei Kündigung durch einen Bevollmächtigten Originalvollmacht beifügen (§ 174 BGB).“

### A12 `wohnraummiete` – § 550 BGB (formrules.ts:134–143)

- **Kernaussage:** ohne Schriftform unbefristet und vorzeitig kündbar, aber wirksam.
- **Rechtsgrundlage:** § 550 BGB [GII]: gilt „für unbestimmte Zeit“; Kündigung „frühestens zum Ablauf eines Jahres nach Überlassung des Wohnraums“.
- **Mindestniveau:** QES (sonst wirksam, aber Laufzeitbindung entfällt).
- **Grenzen:** Relevanz nur bei fester Laufzeit oder Kündigungsverzicht über ein Jahr; bei üblichen unbefristeten Wohnraummietverträgen ist § 550 praktisch folgenlos. **Fehler im Muster:** `/staffelmiete/` gehört zu **§ 557a Abs. 1 BGB** [GII] („schriftlich vereinbart“) – andere Norm, andere Rechtsfolge (Unwirksamkeit der Staffelvereinbarung, nicht Unbefristung) [Rechtsfolge nicht abgerufen].
- **Bewertung:** **ungenau** (Kündigungssperre ein Jahr fehlt; Staffelmiete falsch zugeordnet).
- **Vorschlag:** „Ein Wohnraummietvertrag mit fester Laufzeit oder Kündigungsverzicht über mehr als ein Jahr braucht Schriftform (Papier oder QES). Fehlt sie, bleibt der Vertrag wirksam, gilt aber als unbefristet; kündbar frühestens zum Ablauf eines Jahres nach Überlassung.“ Zusätzlich eigene Regel `staffelmiete` (§ 557a Abs. 1 BGB, QES): „Eine Staffelmiete muss schriftlich vereinbart werden (Papier oder QES); sonst ist die Staffelvereinbarung unwirksam.“

### A13 `gewerbemiete` – § 578 BGB (formrules.ts:144–153)

- **Kernaussage:** seit BEG IV Textform; EES reicht für feste Laufzeit.
- **Rechtsgrundlage:** § 578 Abs. 1 S. 2 BGB [GII]; Übergang Art. 229 § 70 EGBGB (Altverträge bis 1.1.2026 altes Recht) [Rech.]; BEG IV, BGBl. 2024 I Nr. 323 [Rech.]. Textform § 126b BGB [GII].
- **Mindestniveau:** Textform. EES genügt **nur**, wenn die Erklärungen beider Parteien lesbar, mit Nennung des Erklärenden auf einem dauerhaften Datenträger vorliegen.
- **Grenzen:**
  - Der Grundsatz der Einheitlichkeit der Urkunde (alle wesentlichen Vertragsbedingungen, Anlagen, Nachträge) dürfte nach der Rspr. zu § 550 sinngemäß für die Textform fortgelten (unverifiziert, Literaturstand nicht geprüft). Nachträge brauchen ebenfalls Textform.
  - Vertraglich vereinbarte Schriftformklauseln bleiben möglich (§ 127 BGB).
  - Technisch: Paraph versendet das fertige PDF standardmäßig **nicht** als Anhang (`src/server/domain/orgs.ts:35`, `attachCompletedPdf: false`), sondern einen Downloadlink. Ob ein Link auf einen Server des Verwenders ein dauerhafter Datenträger i. S. v. § 126b S. 2 BGB ist, ist zweifelhaft (vgl. EuGH C-49/11 „Content Services“, [nicht abgerufen]). Siehe Freigabepunkt F-08.
- **Bewertung:** **ungenau / leicht zu riskant**: „EES reicht“ ohne die Bedingung des dauerhaften Datenträgers.
- **Vorschlag:** „Für Gewerbemietverträge mit mehr als einem Jahr Laufzeit genügt seit 1.1.2025 die Textform (§ 578 Abs. 1 S. 2 BGB). Eine einfache elektronische Signatur reicht, wenn alle wesentlichen Vereinbarungen einschließlich Anlagen im Dokument stehen und jede Partei das unterschriebene PDF dauerhaft erhält. Nachträge ebenfalls in Textform.“

### A14 `schiedsvereinbarung_verbraucher` – § 1031 Abs. 5 ZPO (formrules.ts:154–163)

- **Kernaussage:** mit Verbrauchern Papier oder QES, separates Dokument.
- **Rechtsgrundlage:** § 1031 Abs. 5 S. 1–3 ZPO [Rech.]; Heilung durch rügelose Einlassung Abs. 6 [Rech.].
- **Mindestniveau:** QES (Verbraucher); zwischen Unternehmern Textform/Nachweis genügt (Abs. 1) [Rech.].
- **Grenzen:** Muster `/schiedsgericht/` trifft auch B2B-Verträge → Bestätigungspflicht auch dort, wo EES genügt. Das ist zu vorsichtig, nicht riskant.
- **Bewertung:** **zutreffend.**
- **Vorschlag:** „Ist eine Partei Verbraucher: nur eigenhändig auf Papier oder mit QES aller Parteien, in einer eigenen Urkunde ohne andere Vereinbarungen (§ 1031 Abs. 5 ZPO). Zwischen Unternehmern genügt ein Dokument, das die Vereinbarung nachweist.“

### A15 `verguetungsvereinbarung` – § 3a RVG (formrules.ts:164–179)

- **Kernaussage:** Textform; Bezeichnung, Absetzung, nicht in Vollmacht, Erstattungshinweis.
- **Rechtsgrundlage:** § 3a Abs. 1 S. 1–4 RVG [GII]. Rechtsfolge bei Formverstoß: § 4b RVG – keine höhere als die gesetzliche Vergütung [nicht abgerufen]. Erfolgshonorar: § 4a RVG, § 49b Abs. 2 BRAO [nicht abgerufen]. Unterschreitung im gerichtlichen Verfahren: § 49b Abs. 1 BRAO, § 4 RVG [nicht abgerufen].
- **Mindestniveau:** Textform. Beidseitig: Die Erklärung des Auftraggebers liegt der Kanzlei auf ihrem Server dauerhaft vor; der Mandant muss die Vereinbarung ebenfalls dauerhaft erhalten (siehe A13, F-08).
- **Grenzen:** Gebührenvereinbarung nach § 34 RVG ausgenommen [GII]. Im Checklistenpunkt 4 (formrules.ts:177) fehlt „ein Verfahrensbeteiligter“; der Gesetzeswortlaut ist „die gegnerische Partei, ein Verfahrensbeteiligter oder die Staatskasse im Falle der Kostenerstattung regelmäßig nicht mehr als die gesetzliche Vergütung erstatten muss“ [GII]. Beachtenswert ist § 49b Abs. 5 BRAO [GII]: Hinweis auf Gebühren nach Gegenstandswert „vor Übernahme des Auftrags“ – formfrei, aber beweisrelevant.
- **Bewertung:** **zutreffend**, Checkliste ungenau.
- **Vorschlag Checklistenpunkt 4:** „Hinweis enthalten: Die gegnerische Partei, ein Verfahrensbeteiligter oder die Staatskasse muss im Fall der Kostenerstattung regelmäßig nicht mehr als die gesetzliche Vergütung erstatten.“ Zusätzliche Punkte: „Bei Erfolgshonorar: Angaben nach § 4a Abs. 2, 3 RVG.“ · „Der Mandant erhält das unterschriebene PDF dauerhaft (Anhang oder Download bestätigt).“ · „Bei Gegenstandswertgebühren: Hinweis nach § 49b Abs. 5 BRAO vor Mandatsübernahme erteilt.“

### A16 `haftungsbeschraenkung` – § 52 BRAO (formrules.ts:180–189)

- **Kernaussage:** im Einzelfall in Textform.
- **Rechtsgrundlage:** § 52 Abs. 1 S. 1 Nr. 1 BRAO [GII]: „durch im Einzelfall in Textform getroffene Vereinbarung bis zur Höhe der Mindestversicherungssumme“; Nr. 2: „durch vorformulierte Vertragsbedingungen für Fälle einfacher Fahrlässigkeit auf den vierfachen Betrag der Mindestversicherungssumme, wenn insoweit Versicherungsschutz besteht“; S. 2 Berufsausübungsgesellschaften; Abs. 2 S. 3: Zustimmung zur Beschränkung auf einzelne Mitglieder „darf keine anderen Erklärungen enthalten und bedarf der Textform“ [GII].
- **Mindestniveau:** Textform (Nr. 1 und Abs. 2); Nr. 2 ohne besondere Form (AGB-Einbeziehung).
- **Bewertung:** **ungenau** – der Hinweis erweckt den Eindruck, jede Haftungsbeschränkung brauche eine Einzelfallvereinbarung; Nr. 2 und Abs. 2 fehlen.
- **Vorschlag:** „Haftungsbeschränkung (§ 52 BRAO): bis zur Mindestversicherungssumme durch Einzelfallvereinbarung in Textform; durch vorformulierte Bedingungen nur für einfache Fahrlässigkeit bis zum Vierfachen der Mindestversicherungssumme bei entsprechendem Versicherungsschutz. Die Zustimmung zur Beschränkung der persönlichen Haftung auf einzelne Mitglieder einer Berufsausübungsgesellschaft muss in einem eigenen Dokument ohne andere Erklärungen stehen (Textform).“

### A17 `prozessvollmacht` – § 80 ZPO, § 174 BGB (formrules.ts:190–199)

- **Kernaussage:** Für das Mandat genügt EES; gegenüber Gericht (bei Rüge) und bei einseitigen Erklärungen Originalvollmacht auf Papier; elektronisch ungeklärt.
- **Rechtsgrundlage:**
  - Erteilung formfrei: § 167 Abs. 2 BGB [Rech.].
  - § 80 S. 1 ZPO [GII]: „Die Vollmacht ist schriftlich zu den Gerichtsakten einzureichen.“ Prüfung von Amts wegen nur bei Nicht-Anwälten, sonst auf Rüge (§ 88 ZPO) [nicht abgerufen].
  - BGH, Beschl. v. 23.01.2024 – VI ZB 16/22 (Aktenzeichen in Sekundärquellen teils VI ZB 88/21): Nachweis nur durch Originalurkunde, ggf. beglaubigt; Kopien genügen nicht [Sekundärquellen: rewis.io, otto-schmidt.de; Primärentscheidung nicht abgerufen].
  - § 130a Abs. 3 S. 3 ZPO [GII]: „Soll ein schriftlich einzureichender Antrag oder eine schriftlich einzureichende Erklärung einer Partei oder eines Dritten als elektronisches Dokument eingereicht werden, so kann der unterschriebene Antrag oder die unterschriebene Erklärung in ein elektronisches Dokument übertragen und durch den Bevollmächtigten … übermittelt werden.“ Ob diese Norm die BGH-Linie zum Original bei § 80 ZPO überholt und ob ein **EES-Unterschriftsbild** als „unterschriebene Erklärung“ gilt, ist **unverifiziert**. Ich halte Letzteres für zweifelhaft, weil die Norm erkennbar an die handschriftlich unterschriebene Papiererklärung anknüpft.
  - § 174 S. 1 BGB: Zurückweisung, wenn keine Vollmachtsurkunde vorgelegt wird; Original erforderlich, Kopie/Fax genügt nach BGH nicht [nicht abgerufen].
- **Mindestniveau:** Erteilung: keine Form (EES für den Nachweis im Innenverhältnis ausreichend). Nachweis gegenüber Gericht bei Rüge und gegenüber Dritten nach § 174 BGB: Papieroriginal (empfohlen; QES ungeklärt).
- **Grenzen:** Spezialfälle mit Formzwang für die Vollmacht: § 492 Abs. 4 BGB (Schriftform), § 1945 Abs. 3 BGB (öffentlich beglaubigt), § 2 Abs. 2 GmbHG (notariell), § 1820 Abs. 2 BGB Vorsorgevollmacht für ärztliche Maßnahmen/Unterbringung: „schriftlich erteilt“ [GII] – ob QES genügt, ist unverifiziert; Grundbuch § 29 GBO, Handelsregister § 12 HGB (öffentliche Beglaubigung) [nicht abgerufen].
- **Bewertung:** **Hinweistext zutreffend, Einstufung `minLevel: 'PAPER'` widersprüchlich.** Der Text sagt selbst, EES genüge für das Mandat; `PAPER` löst aber die stärkste Warnstufe („Papier mit Originalunterschrift erforderlich bzw. empfohlen“) und die Bestätigungspflicht aus (`needsAck`, formrules.ts:264–269). Weil das Muster `/\bvollmacht\b/` praktisch jede Mandatsunterlage trifft, gewöhnt das die Nutzer an das Wegklicken der stärksten Warnung (Warnmüdigkeit). Das ist ein Risiko für die wirklich kritischen Fälle (§ 623 BGB).
- **Vorschlag:** Regel teilen: `vollmacht_mandat` (NONE): „Die Vollmacht ist formfrei; die elektronische Signatur dient dem Nachweis.“ und `vollmacht_nachweis` (eigene Stufe „Papier empfohlen“, siehe A21) mit Hinweis: „Muss die Vollmacht gegenüber Gericht (bei Rüge, § 80 ZPO) oder bei einseitigen Erklärungen wie Kündigungen (§ 174 BGB) vorgelegt werden, verlangt die Rechtsprechung die Originalurkunde. Lassen Sie diese Vollmacht zusätzlich auf Papier unterschreiben. Ob eine QES-Vollmacht genügt, ist nicht geklärt. Sonderfälle mit strengerer Form: Verbraucherdarlehen, Erbausschlagung, GmbH-Gründung, Grundbuch, Handelsregister, Vorsorgevollmacht für ärztliche Maßnahmen.“

### A18 `nachweis_arbeitsbedingungen` – § 2 NachwG (formrules.ts:200–209)

- **Kernaussage:** Textform genügt bei Speicher-/Druckbarkeit und Empfangsbestätigung des Arbeitnehmers; nicht in Branchen § 2a SchwarzArbG.
- **Rechtsgrundlage:** § 2 Abs. 1 S. 1–6 NachwG [GII]: Textform zulässig, „sofern das Dokument für den Arbeitnehmer zugänglich ist, gespeichert und ausgedruckt werden kann und der Arbeitgeber den Arbeitnehmer mit der Übermittlung auffordert, einen Empfangsnachweis zu erteilen“; S. 3: auf Verlangen Schriftform unverzüglich nachholen; S. 6: nicht für Branchen nach § 2a Abs. 1 SchwarzArbG. Weiterhin: „Der Nachweis der wesentlichen Vertragsbedingungen nach Satz 1 in elektronischer Form ist ausgeschlossen.“ [GII]. § 2 Abs. 5 S. 2 [GII]: Arbeitsvertrag in Textform ersetzt den Nachweis (nicht in Fällen von Abs. 1 S. 6). Praktikanten: § 2 Abs. 1a (Schriftform, ohne Textform-Option im Wortlaut) [GII].
- **Mindestniveau:** Textform mit Aufforderung zum Empfangsnachweis; in § 2a-Branchen und für Praktikanten Schriftform (Papier, da elektronische Form ausgeschlossen).
- **Grenzen:** Das NachwG ist eine **Nachweispflicht**, keine Wirksamkeitsvoraussetzung des Arbeitsvertrags; der Arbeitsvertrag selbst ist formfrei (außer Befristung, Wettbewerbsverbot u. a.). Verstoß ist Ordnungswidrigkeit (§ 4 NachwG) [nicht abgerufen].
- **Bewertung:** **ungenau** – die Bedingung ist die *Aufforderung* des Arbeitgebers, nicht die *Bestätigung* des Arbeitnehmers; Praktikanten und die Nachholpflicht auf Verlangen fehlen; der Unterschied Nachweis/Wirksamkeit fehlt.
- **Vorschlag:** „Der Arbeitsvertrag selbst ist formfrei. Für den Nachweis der Arbeitsbedingungen genügt Textform, wenn das Dokument speicher- und druckbar ist und der Arbeitgeber den Arbeitnehmer bei der Übermittlung auffordert, den Empfang zu bestätigen. Auf Verlangen ist ein unterschriebenes Papierexemplar nachzureichen. Nicht zulässig in Branchen nach § 2a SchwarzArbG (z. B. Bau, Gastronomie) und nicht für Praktikanten (§ 2 Abs. 1a NachwG) – dort Papier. Befristungen: § 14 Abs. 4 TzBfG.“

### A19 `einwilligung_dsgvo` – Art. 7 DSGVO (formrules.ts:210–218)

- **Kernaussage:** formfrei, nachweisbar, abgesetzt, widerrufbar.
- **Rechtsgrundlage:** Art. 7 Abs. 1–4 DSGVO; Art. 4 Nr. 11 DSGVO; Art. 9 Abs. 2 lit. a („ausdrücklich“) bei besonderen Kategorien [Wortlaut nicht abgerufen, EUR-Lex in der Vorrecherche nicht erreichbar]. Beschäftigte: § 26 Abs. 2 BDSG („schriftlich oder elektronisch“) [Rech.]; unionsrechtliche Tragfähigkeit von § 26 BDSG nach EuGH C-34/21 teilweise fraglich [Rech.]; ob § 26 BDSG zwischenzeitlich geändert wurde, ist unverifiziert.
- **Mindestniveau:** keine Form; Nachweis.
- **Grenzen:** Art. 7 Abs. 3 S. 3 DSGVO: vor Abgabe über das Widerrufsrecht informieren [nicht abgerufen].
- **Bewertung:** **zutreffend**, ergänzungsbedürftig.
- **Vorschlag:** „Formfrei, aber nachweisbar. Die Einwilligung gehört in einen klar abgesetzten Abschnitt, muss freiwillig sein, und die Person ist vorher auf ihr jederzeitiges Widerrufsrecht hinzuweisen. Gesundheits- und andere besondere Daten: ausdrückliche Einwilligung (Art. 9 DSGVO). Beschäftigte: § 26 Abs. 2 BDSG beachten.“

### A20 `mandatsvertrag` – keine Norm (formrules.ts:219–227)

- **Kernaussage:** gesetzlich formfrei; Signatur dient dem Nachweis.
- **Rechtsgrundlage:** §§ 611, 675 BGB, Formfreiheit [nicht abgerufen].
- **Mindestniveau:** keine Form.
- **Grenzen:** Mit Verbrauchern im Fernabsatz oder außerhalb von Geschäftsräumen: Widerrufsbelehrung, Verlangen des vorzeitigen Beginns und Bestätigung des Erlöschens (§§ 312g, 356 Abs. 4, 357a Abs. 2 BGB) [Rech.]; § 356a BGB (Widerrufsfunktion) – Anwendbarkeit ungeprüft [Rech.]. § 49b Abs. 5 BRAO [GII]. Vergütungs- und Haftungsvereinbarungen gesondert (A15, A16). Schweigepflichtentbindung: formfrei, aber bei Gesundheitsdaten ausdrücklich (Art. 9 DSGVO).
- **Bewertung:** **zutreffend.**
- **Vorschlag:** „Gesetzlich formfrei; die elektronische Signatur dient dem Nachweis. Bei Verbrauchern im Fernabsatz: Widerrufsbelehrung und ggf. ausdrückliches Verlangen des vorzeitigen Beginns als eigene, nicht vorausgefüllte Erklärung. Vergütungsvereinbarung und Haftungsbeschränkung als eigene Dokumente.“

### A21 Stufentexte `LEVEL_TEXT` (formrules.ts:230–236)

| Stufe | Ist-Text (de) | Bewertung | Vorschlag |
|---|---|---|---|
| NONE | Keine gesetzliche Form | zutreffend | unverändert |
| TEXT | „Textform genügt – einfache elektronische Signatur reicht“ | **ungenau/zu riskant**: Textform verlangt dauerhaften Datenträger beim Empfänger | „Textform genügt – einfache elektronische Signatur reicht, wenn alle Parteien das unterschriebene PDF dauerhaft erhalten“ |
| QES | „Schriftform – elektronisch nur mit QES“ | zutreffend | unverändert |
| PAPER | „Papier mit Originalunterschrift erforderlich bzw. empfohlen“ | **ungenau**: vermischt zwingend (§ 623) und empfohlen (§ 80 ZPO) | Stufe teilen: `PAPER`: „Elektronisch ausgeschlossen – nur eigenhändige Unterschrift auf Papier wirksam“; neue Stufe `PAPER_REC`: „Papieroriginal empfohlen (Nachweis gegenüber Dritten)“ |
| NOTARY | „Notarielle Beurkundung erforderlich“ | zutreffend | unverändert |

Der englische TEXT-Eintrag „Text form suffices“ sollte entsprechend lauten: „Text form suffices – a simple electronic signature is enough if all parties receive a durable copy of the signed PDF“.

### A22 Fehlende Regeln (Vorschläge zur Aufnahme, jeweils freizugeben)

| Vorschlag-ID | Norm | Gegenstand | Mindestniveau | Quelle |
|---|---|---|---|---|
| N1 | § 557a Abs. 1 BGB | Staffelmiete | QES | [GII] |
| N2 | § 41 S. 3 SGB VI | Beendigung mit Regelaltersgrenze | Textform | [Rech.] |
| N3 | § 1820 Abs. 2 BGB | Vorsorgevollmacht (ärztliche Maßnahmen, Unterbringung) | Schriftform; QES-Tauglichkeit unverifiziert → Papier empfehlen | [GII] |
| N4 | § 1827 BGB | Patientenverfügung | Schriftform; QES-Tauglichkeit unverifiziert → Papier empfehlen | [nicht abgerufen] |
| N5 | § 761 BGB | Leibrente (bei familienrechtlichem Unterhalt: Papier) | QES / Papier | [Rech.] |
| N6 | § 655b, § 484, § 650h BGB | Darlehensvermittlung, Timesharing, Kündigung Bauvertrag | QES | [Rech.] |
| N7 | § 1945 Abs. 3 BGB, § 29 GBO, § 12 HGB | öffentlich beglaubigte Erklärungen/Vollmachten | notariell (Beglaubigung) | [Rech.]/[nicht abgerufen] |
| N8 | § 4a RVG | Erfolgshonorar – Pflichtangaben | Textform + Inhalt | [nicht abgerufen] |
| N9 | §§ 356 Abs. 4, 357a Abs. 2 BGB | Verlangen vorzeitiger Leistungsbeginn (Verbraucher) | Textform, eigene Erklärung | [Rech.] |
| N10 | § 22 Abs. 3 BBiG | Kündigung Berufsausbildungsverhältnis | Schriftform; ob elektronische Form ausgeschlossen ist, unverifiziert | [nicht abgerufen] |
| N11 | § 12 GwG | Identifizierung von Mandanten (Kataloggeschäfte) | kein Formthema, aber: EES/OTP ist **keine** Identifizierung; zulässig u. a. Ausweis, eID, QES (§ 12 Abs. 1 S. 1 Nr. 1–3 GwG) | [GII] |

---

## Teil B – Plattformsiegel, Signaturstufen und „rechtsgültig“: Prüfung aller nutzer- und unterzeichnersichtbaren Texte

### B1 Gesamtbefund

- Nirgends wird das selbst signierte Plattformsiegel als **qualifiziertes Siegel**, als **FES/QES** oder als **persönliche Signatur der Unterzeichner** bezeichnet. Im Gegenteil: Abschlussbestätigung (certificate.ts:85, 129), Prüfanleitung (finalize.ts:270–271), Einstellungen (Settings.tsx:480, 508) und Handbuch grenzen das Siegel ausdrücklich ab.
- Die Begriffe **„rechtsgültig“** und **„rechtssicher“** kommen in `src/web`, `src/server` und `src/shared` nicht vor (grep, 22.10.2026). „Rechtsverbindlich“ erscheint nur verneinend im Testmodus (Sign.tsx:121, Verify.tsx:72, certificate.ts:92/135).
- Riskant sind vier Stellen, an denen ein **Identitätsnachweis** oder eine **unbedingte rechtliche Verbindlichkeit** nahegelegt wird, sowie Texte, die eine **Beweiswirkung stärker darstellen**, als sie mit einem selbst signierten Schlüssel ist.

### B2 Fundstellen mit Korrekturvorschlag

| # | Datei:Zeile | Ist-Text | Problem | Vorschlag (de) | Priorität |
|---|---|---|---|---|---|
| T1 | src/web/components/SignaturePad.tsx:255 (en.ts:52) | „Mit „Übernehmen“ wird das Bild Ihrer Unterschrift den Feldern zugeordnet. Rechtlich verbindlich wird es erst mit der abschließenden Bestätigung.“ | Legt nahe, dass die Erklärung nach Bestätigung **in jedem Fall** rechtlich verbindlich ist – auch bei § 623 BGB o. Ä. | „Mit „Übernehmen“ wird das Bild Ihrer Unterschrift den Feldern zugeordnet. Ihre Erklärung geben Sie erst mit der abschließenden Bestätigung ab.“ – en: „“Apply” assigns the image of your signature to the fields. You only make your declaration when you give your final confirmation.“ | hoch |
| T2 | src/server/pdf/certificate.ts:70 (en: 114) | Feldbezeichnung „Identitätsprüfung“ / „Identity check“ | Wird auch bei „Persönlicher Link“ und Einmalcodes angezeigt, die selbst „kein Identitätsnachweis“ sind (finalize.ts:26–28). Die Überschrift widerspricht dem Inhalt und kann vor Gericht als Behauptung einer Identitätsprüfung gelesen werden. | „Zugangsnachweis“ / „Authentication“ | hoch |
| T3 | src/server/domain/finalize.ts:29 | „Identität durch die gastgebende Person vor Ort geprüft“ / „Identity checked in person by the host“ | Behauptet eine Tatsache, die das System nicht kennt. Der Host wird nur aufgefordert (EnvelopePage.tsx:219), die Prüfung selbst und das Ausweisdokument werden nicht protokolliert. | „Vor Ort auf dem Gerät der gastgebenden Person unterschrieben; diese war zur persönlichen Identitätsprüfung angehalten (Art der Prüfung nicht protokolliert)“ / „Signed in person on the host's device; the host was instructed to check identity in person (method not recorded)“ | hoch |
| T4 | src/server/domain/finalize.ts:25 | „Besitz des per E-Mail zugestellten Links“ | Bei Zustellart ohne E-Mail (`notify:false`, Links gibt die Kanzlei selbst weiter) falsch. | „Besitz des persönlichen Links (Zustellweg: {E-Mail \| durch Absender})“ – technisch Zustellweg protokollieren; bis dahin: „Besitz des persönlichen Links“ | mittel |
| T5 | src/server/pdf/certificate.ts:85 (en: 129) | „Das Siegel weist nach, dass die Datei seit der Versiegelung nicht verändert wurde.“ | Mit selbst signiertem Schlüssel belegt das Siegel nur, dass die Datei seit dem Signieren mit **diesem Schlüssel** unverändert ist; wer den Schlüssel hat (Betreiber, Root), könnte neu siegeln. Kein Fehler, aber „weist nach“ ist stärker als nötig. | „Eine gültige Siegelprüfung zeigt, dass die Datei seit der Versiegelung mit diesem Schlüssel nicht verändert wurde.“ (Rest unverändert) | niedrig |
| T6 | src/server/domain/finalize.ts:270 | „Das Plattformsiegel weist die Unversehrtheit seit Abschluss nach.“ | wie T5 | „Das Plattformsiegel macht Änderungen seit Abschluss erkennbar (Prüfung gegen den Zertifikatsfingerabdruck).“ | niedrig |
| T7 | src/web/pages/settings/Settings.tsx:480 (en.ts:626) | „Sie weist nach, dass die Datei seit Abschluss unverändert ist – sie ist keine persönliche Signatur der Unterzeichner.“ | wie T5; zusätzlich fehlt „kein qualifiziertes Siegel“ | „Sie macht Änderungen seit Abschluss erkennbar. Sie ist keine persönliche Signatur der Unterzeichner und kein qualifiziertes elektronisches Siegel.“ | niedrig |
| T8 | src/web/pages/EnvelopePage.tsx:164 (en.ts:302) | „Das Dokument ist versiegelt; jede spätere Änderung wäre nachweisbar.“ | „nachweisbar“ leicht überzeichnet | „Das Dokument ist versiegelt; spätere Änderungen sind erkennbar.“ | niedrig |
| T9 | src/web/pages/settings/Settings.tsx:472 (en.ts:620) | „Ein E-Mail- oder SMS-Code erfüllt das nach überwiegender Ansicht nicht.“ | Behauptung einer „überwiegenden Ansicht“ ist nicht belegt (Vorrecherche: keine amtliche Leitlinie gefunden). | „Ein E-Mail- oder SMS-Code mit einem Plattformschlüssel erfüllt das nach unserer Einschätzung nicht.“ | mittel |
| T10 | src/web/pages/settings/Settings.tsx:476 (en.ts:624) | „Erfüllt die elektronische Form nach § 126a BGB.“ | QES ist notwendig, aber nicht hinreichend (Namenszusatz, bei Verträgen gleichlautende Dokumente, § 126a Abs. 1, 2 BGB [GII]; Ausschlüsse wie § 623 BGB). | „Ermöglicht die elektronische Form nach § 126a BGB, soweit das Gesetz sie nicht ausschließt.“ | mittel |
| T11 | src/web/pages/EnvelopeEditor.tsx:525 (en.ts:269) | „Mir ist bewusst, dass eine elektronische Unterschrift für dieses Dokument voraussichtlich nicht genügt. …“ | Bei § 623/§ 766/§ 2247 genügt sie **sicher** nicht; „voraussichtlich“ verharmlost. | „Mir ist bewusst, dass eine elektronische Unterschrift für dieses Dokument nach dem Katalog nicht genügt. Ich versende es trotzdem, z. B. als Entwurf oder Vorabfassung.“ | hoch |
| T12 | src/web/pages/EnvelopeEditor.tsx:525 (en.ts:270) | „Ich habe den Formhinweis gelesen und versende mit einfacher elektronischer Signatur.“ | Für QES-Regeln richtig wäre ein Hinweis, dass die Form damit **nicht** gewahrt ist. | „Ich habe den Formhinweis gelesen. Mir ist bewusst, dass die gesetzliche Form mit einer einfachen elektronischen Signatur nicht gewahrt wird.“ | hoch |
| T13 | src/web/pages/EnvelopeEditor.tsx:528 (en.ts:272) | „Für die gewählte Dokumentart genügt nach dem Katalog eine einfache elektronische Signatur.“ | Bei TEXT-Regeln nur mit dauerhafter Kopie (A13). | „Für die gewählte Dokumentart genügt nach dem Katalog eine einfache elektronische Signatur. Bei Textform müssen alle Beteiligten das unterschriebene PDF dauerhaft erhalten.“ | mittel |
| T14 | src/shared/consent.ts:10 | „… sollen dieselbe Wirkung haben, als hätte ich sie selbst abgegeben.“ | Siehe Teil C (sinnleer, missverständlich). | siehe C2 | hoch |
| T15 | src/web/pages/sign/Sign.tsx:716 | „Ich habe die Dokumente gelesen und stimme der Erklärung zu.“ | Tatsachenbestätigung in vorformuliertem Text; gegenüber Verbrauchern Risiko § 309 Nr. 12 lit. b BGB [nicht abgerufen]. Siehe C3. | „Ich stimme der obigen Erklärung zu.“ | mittel |
| T16 | src/web/pages/auth/AuthLayout.tsx:17 (en.ts:470) | „Jede Signatur mit nachvollziehbarem Protokoll, jedes Ergebnis versiegelt.“ | unbedenklich (keine Rechtsbehauptung) | unverändert | – |
| T17 | src/web/lib/en.ts:618 | „Advanced electronic signature (AdES)“ | „AdES“ bezeichnet bei ETSI die Formatfamilie (CAdES/PAdES); eIDAS-Englisch „advanced electronic signature“ ohne festes Kürzel. Verwechslung mit dem PAdES-Plattformsiegel möglich. | „Advanced electronic signature“ (ohne Kürzel) | niedrig |
| T18 | src/server/domain/finalize.ts:161 | PDF-Signaturfeld `Name: "Paraph (<Organisation>)"`, Reason „Plattformsiegel Paraph – Vorgang … abgeschlossen“ | PDF-Programme zeigen das Feld oft als „Unterschrieben von Paraph (Kanzlei …)“. Kann als Unterschrift der Kanzlei gelesen werden. | Reason: „Plattformsiegel Paraph (Integritätsschutz, keine Unterschrift der Beteiligten) – Vorgang … abgeschlossen“ | mittel |
| T19 | src/server/domain/signing.ts:148 | „Bitte bestätigen Sie zuerst Ihre Identität.“ | Einmalcode bestätigt keine Identität. | „Bitte bestätigen Sie zuerst Ihren Zugang mit dem Code.“ | mittel |
| T20 | src/server/domain/signing.ts:176 | SMS: „{code} ist Ihr Bestätigungscode für „{Titel, 60 Zeichen}“ …“ | Kein Siegelthema, aber berufsrechtlich relevant: Der Dokumenttitel (z. B. „Aufhebungsvertrag Müller“) geht an den SMS-Anbieter und erscheint auf Sperrbildschirmen (§ 43a Abs. 2, § 43e BRAO, § 203 StGB). | „{code} ist Ihr Bestätigungscode für {Organisation}. Gültig 10 Minuten.“ | hoch |

Nicht beanstandet (Auswahl): certificate.ts:89 (EES, ersetzt nicht § 126/§ 126a – zutreffend); certificate.ts:85 Satz 2 und 3 (keine persönliche Signatur, kein qualifiziertes Siegel); Settings.tsx:508 (qualifiziertes Siegel mit importiertem Schlüssel nicht möglich – zutreffend, weil qualifizierte Siegelschlüssel in einer QSCD liegen müssen); Settings.tsx:493 (Tipp Acrobat – „als gültig“ meint die technische Prüfanzeige; vertretbar); `src/shared/model.ts:93–100` (Stufenbezeichnungen); Mailtexte `src/server/domain/mail.ts:25–80` (keine Rechtsbehauptungen).

**Nicht im Code geprüft:** Texte in eventuell vorhandenen Marketingseiten, README, Handbuchkapiteln außer 08 und 10 sowie in von Organisationen selbst angepassten Mailtexten (`branding.mail`). Letztere kann jeder Organisationsadministrator frei formulieren; dort kann „rechtsgültig“ jederzeit eingefügt werden (Freigabepunkt F-21).

---

## Teil C – Einwilligungs- und Erklärungstexte (`src/shared/consent.ts`)

### C1 Funktion

Der Text wird vor dem Abschluss angezeigt (Sign.tsx:710–716), mit Version (`CONSENT_VERSION = '2026-10-1'`, model.ts:103) und SHA-256 protokolliert und in der Abschlussbestätigung genannt (certificate.ts:288). Das ist für die **Beweisfunktion** gut: Es lässt sich belegen, welcher Wortlaut gezeigt wurde.

### C2 `signer.statement` (consent.ts:10)

Ist: „Ich unterschreibe die oben angezeigten Dokumente in genau dieser Fassung. Meine Angaben und meine Unterschrift sollen dieselbe Wirkung haben, als hätte ich sie selbst abgegeben.“

- **Satz 1:** gut (Bezug auf die konkrete Fassung; Hash wird angezeigt, Sign.tsx:721).
- **Satz 2:** **missverständlich.** Die Person gibt die Erklärung selbst ab; „als hätte ich sie selbst abgegeben“ ist sinnleer. Gemeint ist vermutlich „als hätte ich handschriftlich unterschrieben“. So formuliert wäre es **zu riskant**: Eine Parteivereinbarung kann die gesetzliche Schriftform nicht ersetzen (§ 125 BGB); für vereinbarte Schriftform hilft § 127 Abs. 2, 3 BGB ohnehin. Ein solcher Satz erzeugt beim Unterzeichner einen falschen Eindruck über die Wirkung.
- **Transparenz:** Es fehlt der Hinweis, *was* die Erklärung ist (Abgabe der im Dokument enthaltenen Willenserklärungen) und dass die EES keine gesetzliche Schriftform wahrt.
- **Vorschlag:** „Ich unterschreibe die oben angezeigten Dokumente in genau dieser Fassung. Mit „Verbindlich unterschreiben“ gebe ich die darin enthaltenen Erklärungen als meine eigenen ab.“

### C3 `signer.electronic` (consent.ts:11)

Ist: „Ich bin einverstanden, diese Erklärung elektronisch abzugeben. Es handelt sich um eine einfache elektronische Signatur (EES); der Ablauf wird mit Zeitpunkt und technischen Merkmalen protokolliert.“

- **Gut:** Die Stufe EES wird offen genannt.
- **Lücken:**
  1. „technische Merkmale“ ist intransparent. Tatsächlich protokolliert: IP-Adresse, Browserkennung (User-Agent), Zeitpunkte, Zugangsweg, maskierte Code-Zieladresse, Unterschriftsbild (Handbuch 08-recht.md:96).
  2. Kein Hinweis, dass die EES keine Schriftform/elektronische Form ersetzt.
  3. Kein Hinweis auf Kopie für den Unterzeichner (dauerhafter Datenträger, Textform).
  4. Kein Datenschutzhinweis und kein Link auf Informationen nach Art. 13 DSGVO (siehe C6).
  5. Das „Einverständnis“ kann als datenschutzrechtliche Einwilligung missverstanden werden. Die Protokollierung sollte sich auf Art. 6 Abs. 1 lit. b, c oder f DSGVO stützen, nicht auf Einwilligung (widerruflich, Art. 7 Abs. 3) – das muss der Text nicht sagen, darf aber auch nicht den Eindruck einer Einwilligung erwecken. Klarstellung in der Datenschutzinformation.
- **Vorschlag:** „Ich bin einverstanden, diese Erklärung elektronisch abzugeben. Es handelt sich um eine einfache elektronische Signatur (EES), nicht um eine qualifizierte elektronische Signatur; wo das Gesetz Schriftform oder notarielle Form verlangt, genügt sie nicht. Zum Nachweis werden Zeitpunkte, IP-Adresse, Browserkennung, der Zugangsweg und mein Unterschriftsbild protokolliert. Nach Abschluss erhalte ich eine Kopie der unterschriebenen Dokumente. Informationen zum Datenschutz: {Link}.“

### C4 `witness` (consent.ts:13–17)

- Inhaltlich unbedenklich. Hinweis fehlt: Gesetzliche Zeugenerfordernisse (z. B. Nottestament §§ 2249 ff. BGB, ausländische Formvorschriften wie „witnessed deeds“) lassen sich elektronisch in der Regel nicht erfüllen [nicht abgerufen]. Das gehört in die Absender-Oberfläche, nicht in den Zeugentext.
- `electronic` wie C3 ergänzen (protokollierte Daten, Datenschutzlink).

### C5 `approver` und `filler` (consent.ts:18–27)

- `approver`: „Freigabe“ ist keine Unterschrift; das ist sauber getrennt. Die Abschlussbestätigung führt Freigebende als „Freigabe“ (certificate.ts:68). Ergänzen: „Die Freigabe ist keine Unterschrift unter das Dokument.“
- `filler`: „Ich bestätige, dass meine Angaben … richtig sind.“ – Wahrheitsbestätigung; in vorformulierten Bedingungen gegenüber Verbrauchern Risiko nach § 309 Nr. 12 lit. b BGB (Tatsachenbestätigung zur Beweislastverschiebung) [nicht abgerufen]. Milder: „Ich übermittle die von mir ausgefüllten Angaben.“ – Entscheidung anwaltlich (F-13).
- Beide: Datenschutzlink wie C3.

### C6 Datenschutzhinweis nach Art. 13 DSGVO – fehlt

**Befund:** Die Unterzeichnerseite enthält keinen Link und keinen Text zu Datenschutzinformationen (grep nach „Datenschutz“, „privacy“, „DSGVO“ in `src/web`: einziger Treffer ist das Fußzeilenfeld für Impressum, Settings.tsx:238). Erhoben werden beim Unterzeichner selbst u. a. IP-Adresse, User-Agent, Unterschriftsbild, ggf. Mobilnummer und Feldeingaben. Für diese Direkterhebung gilt **Art. 13 DSGVO** „zum Zeitpunkt der Erhebung“ [nicht abgerufen]. Für Name, E-Mail und Telefonnummer, die der Absender eingibt, gilt Art. 14 DSGVO; für Berufsgeheimnisträger kann § 29 Abs. 1 S. 1 BDSG die Informationspflicht nach Art. 14 Abs. 1–4 einschränken [nicht abgerufen, Reichweite anwaltlich prüfen]. Für Art. 13 sieht § 29 Abs. 2 BDSG nur eine enge Ausnahme vor [nicht abgerufen].

**Mindestinhalt (Art. 13 Abs. 1, 2 DSGVO) [nicht abgerufen]:**
1. Name und Kontaktdaten des Verantwortlichen (Kanzlei), ggf. Datenschutzbeauftragter.
2. Zwecke und Rechtsgrundlagen: Durchführung des Vertrags/Mandats (Art. 6 Abs. 1 lit. b), gesetzliche Aufbewahrung (lit. c), Beweissicherung und Missbrauchsschutz (lit. f, berechtigtes Interesse benennen).
3. Empfänger oder Kategorien: E-Mail-Versanddienst, SMS-Anbieter, Speicheranbieter (S3), Zeitstempeldienst (nur Hash), Hoster, die Absender und weitere Beteiligte des Vorgangs (die Abschlussbestätigung zeigt allen Beteiligten IP-Adresse und Gerät der anderen – certificate.ts:286–287!).
4. Drittlandübermittlung, falls ein Anbieter außerhalb EU/EWR sitzt.
5. Speicherdauer: Inhalte nach Aufbewahrungsfrist; Audit-Trail mit IP und Namen derzeit **unbegrenzt** (Handbuch 08-recht.md:106, 10-einschraenkungen.md:40) – das ist mit Art. 5 Abs. 1 lit. e DSGVO nur vereinbar, wenn eine Frist festgelegt wird (F-06).
6. Betroffenenrechte (Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch nach Art. 21), Beschwerderecht bei der Aufsichtsbehörde.
7. Ob die Bereitstellung erforderlich ist und Folgen der Nichtbereitstellung (ohne Protokollierung keine Unterzeichnung).

**Besonderer Punkt – Offenlegung von IP-Adressen an andere Beteiligte:** Die Abschlussbestätigung geht an alle Unterzeichner und enthält IP-Adresse und User-Agent **jeder** Person. Das ist eine Übermittlung an Dritte (z. B. an die Gegenseite eines Vergleichs). Erforderlichkeit und Rechtsgrundlage sind anwaltlich zu bewerten; technische Alternative: IP in der an Beteiligte versandten Fassung kürzen und nur im Nachweispaket der Kanzlei vollständig führen (F-07).

---

## Teil D – Beweiswert (Einordnung)

- **QES:** § 371a Abs. 1 ZPO [GII]: Vorschriften über die Beweiskraft privater Urkunden gelten entsprechend; Anschein der Echtheit nach Prüfung gemäß Art. 32 eIDAS, erschütterbar nur durch Tatsachen, die „ernstliche Zweifel“ begründen.
- **EES (Paraph):** § 371a ZPO greift **nicht**. Das PDF ist Augenscheinsobjekt (§ 371 Abs. 1 S. 2 ZPO [nicht abgerufen]); der Beweiswert unterliegt der freien Beweiswürdigung (§ 286 ZPO [nicht abgerufen]). Art. 25 Abs. 1 eIDAS verbietet nur, der EES die Zulässigkeit als Beweismittel allein wegen ihrer elektronischen Form abzusprechen [Rech.]. Bestreitet die Gegenseite die Urheberschaft, trägt der Verwender die volle Beweislast; Audit-Trail, Hash-Kette, Zeitstempel und Zugangsweg sind Indizien, kein Anscheinsbeweis.
- **Plattformsiegel:** weder fortgeschrittenes noch qualifiziertes Siegel; keine Vermutung nach Art. 35 Abs. 2 eIDAS [Rech.]. Der neue externe Zeitstempel über die Ankerkette (anchor.ts) stärkt die Indizwirkung gegen nachträgliche Manipulation, aber nur mit einem echten Drittdienst (FreeTSA ist nicht qualifiziert; Art. 41 Abs. 2 eIDAS-Vermutung nur für qualifizierte Zeitstempel [Rech.]).
- **Folge für Texte:** Formulierungen wie „beweissicher“, „gerichtsfest“ oder „rechtssicher“ sollten auch künftig nicht verwendet werden.

## Quellen (abgerufen am 22.10.2026)

- gesetze-im-internet.de, Einzelnormen wie oben [GII] (z. B. https://www.gesetze-im-internet.de/gewo/__109.html, https://www.gesetze-im-internet.de/bgb/__578.html, https://www.gesetze-im-internet.de/nachwg/__2.html, https://www.gesetze-im-internet.de/brao/__52.html, https://www.gesetze-im-internet.de/zpo/__130a.html, https://www.gesetze-im-internet.de/zpo/__371a.html, https://www.gesetze-im-internet.de/brao/__43e.html, https://www.gesetze-im-internet.de/ao_1977/__147.html, https://www.gesetze-im-internet.de/hgb/__257.html, https://www.gesetze-im-internet.de/gwg_2017/__12.html)
- BGH, Beschl. v. 23.01.2024 – VI ZB 16/22, Sekundärquellen: https://rewis.io/urteile/urteil/ngm-23-01-2024-vi-zb-1622/, https://www.otto-schmidt.de/blog/zivil-und-zivilverfahrensrecht-blog/montagsblog-neues-vom-bgh-ZRBLOG0003147.html
- Umsetzung Verbraucherkreditrichtlinie, Sekundärquellen: https://www.iww.de/fmp/forderungsrecht/verbraucherkredit-neue-verbraucherkreditrichtline-innationales-recht-umgesetzt-f174594, https://www.inkasso.de/fileadmin/user_upload/Branchennews/2026_05_18_bgbl_139_umsetzung_ccd.pdf
- Vorrecherche: `docs/recherche/formvorschriften-und-markt.md`
