# 8. Recht: Signaturstufen, Formvorschriften, Datenschutz

> Dieses Kapitel ist eine technische Einordnung, keine Rechtsberatung. Ob eine Erklärung im Einzelfall formwirksam ist, prüfen Sie selbst.

## Signaturstufen nach eIDAS

Die Verordnung (EU) Nr. 910/2014 (eIDAS-VO) unterscheidet drei Stufen:

| Stufe | Fundstelle | Kern |
|---|---|---|
| Einfache elektronische Signatur (EES) | Art. 3 Nr. 10 | Daten in elektronischer Form, die anderen elektronischen Daten beigefügt oder logisch mit ihnen verbunden sind und die der Unterzeichner zum Unterzeichnen verwendet. |
| Fortgeschrittene elektronische Signatur (FES) | Art. 3 Nr. 11, Anforderungen in Art. 26 | eindeutig dem Unterzeichner zugeordnet, ermöglicht seine Identifizierung, mit Daten erstellt, die er mit hohem Maß an Vertrauen unter seiner alleinigen Kontrolle verwenden kann, und so mit den Daten verbunden, dass nachträgliche Änderungen erkennbar sind. |
| Qualifizierte elektronische Signatur (QES) | Art. 3 Nr. 12 | FES, erstellt mit einer qualifizierten Signaturerstellungseinheit und beruhend auf einem qualifizierten Zertifikat eines qualifizierten Vertrauensdiensteanbieters. |

Art. 25 Abs. 1 eIDAS-VO: Einer elektronischen Signatur darf die Rechtswirkung und die Zulässigkeit als Beweismittel nicht allein deshalb abgesprochen werden, weil sie elektronisch ist oder die Anforderungen an die QES nicht erfüllt. Art. 25 Abs. 2: Eine QES hat die gleiche Rechtswirkung wie eine handschriftliche Unterschrift.

Im deutschen Recht ersetzt nur die QES die gesetzliche Schriftform (§ 126 Abs. 3, § 126a BGB), sofern das Gesetz die elektronische Form nicht ausschließt. Für Textform (§ 126b BGB) und formfreie Erklärungen genügt in der Regel auch eine EES. Den Beweiswert einer EES würdigt das Gericht frei.

## Was Paraph leistet

Paraph erzeugt **einfache elektronische Signaturen (EES)**. Die Unterzeichnung wird dokumentiert durch:

- persönlichen Link, optional Einmalcode per E-Mail oder SMS oder Zugangscode,
- ausdrückliche Erklärung vor dem Abschluss (versionierter Text, Version und Hash protokolliert),
- Bindung an die maßgebliche Fassung über SHA-256,
- Audit-Trail als Hash-Kette mit Zeitpunkten, IP-Adresse und Browserkennung,
- Plattformsiegel und Abschlussbestätigung.

## Was Paraph nicht beansprucht

- **Keine FES.** Paraph behauptet nicht, die Anforderungen des Art. 26 eIDAS-VO zu erfüllen. Insbesondere die Identifizierung des Unterzeichners und die alleinige Kontrolle über die Signaturerstellungsdaten sind bei Link und Einmalcode nicht gewährleistet.
- **Keine QES.** Paraph ist an keinen qualifizierten Vertrauensdiensteanbieter angebunden. Die Stufe „QES“ ist im Datenmodell vorgesehen; Vorgänge mit dieser Stufe lassen sich nicht versenden. Die Oberfläche zeigt „nicht eingerichtet“. Siehe [Kapitel 10](10-einschraenkungen.md).

## Plattformsiegel ist keine persönliche Signatur

Das finale PDF trägt eine digitale Signatur nach PAdES. Diese stammt von der **Paraph-Instanz** (bzw. vom importierten Zertifikat der Organisation), nicht von den Unterzeichnern. Sie belegt:

- das PDF stammt von dieser Instanz,
- es wurde seit dem Versiegeln nicht verändert,
- mit Zeitstempeldienst: es existierte spätestens zum Zeitpunkt des Zeitstempels.

Sie belegt **nicht** die Identität der Unterzeichner. Mit dem standardmäßig selbst signierten Zertifikat ist das Siegel weder ein fortgeschrittenes noch ein qualifiziertes elektronisches Siegel im Sinne der eIDAS-VO. PDF-Programme zeigen es als „Aussteller unbekannt“ an, bis das Zertifikat manuell als vertrauenswürdig markiert wird.

## Formhinweise

### Katalog

Paraph enthält einen regelbasierten Katalog deutscher Formvorschriften (`src/shared/formrules.ts`). Grundlage ist die Recherche `docs/recherche/formvorschriften-und-markt.md`, Stand 22.10.2026, mit Gesetzestexten von gesetze-im-internet.de. **Der Katalog ist vor dem Produktiveinsatz anwaltlich freizugeben.**

| Regel | Norm | Mindestform laut Katalog |
|---|---|---|
| Kündigung oder Aufhebungsvertrag im Arbeitsverhältnis | § 623 BGB | Papier (elektronische Form ausgeschlossen) |
| Bürgschaftserklärung | § 766 BGB | Papier |
| Schuldversprechen, Schuldanerkenntnis | §§ 780, 781 BGB | Papier |
| Testament | § 2247 BGB | Papier (eigenhändig) |
| Notariell zu beurkundendes Geschäft | §§ 311b, 518, 1410, 2276, 2348 BGB; §§ 2, 15 GmbHG | notarielle Beurkundung |
| Vollmacht (Prozess- oder Kündigungsvollmacht) | § 80 ZPO, § 174 BGB | Papier |
| Befristung eines Arbeitsvertrags | § 14 Abs. 4 TzBfG | QES |
| Arbeitszeugnis | § 109 GewO | QES |
| Nachvertragliches Wettbewerbsverbot | § 74 HGB | QES |
| Betriebsvereinbarung | § 77 Abs. 2 BetrVG | QES |
| Verbraucherdarlehensvertrag | § 492 BGB | QES |
| Kündigung eines Wohnraummietverhältnisses | § 568 BGB | QES |
| Wohnraummietvertrag über mehr als ein Jahr | § 550 BGB | QES |
| Schiedsvereinbarung mit Verbraucher | § 1031 Abs. 5 ZPO | QES |
| Gewerbemietvertrag | § 578 BGB | Textform |
| Anwaltliche Vergütungsvereinbarung | § 3a RVG | Textform |
| Haftungsbeschränkung im Mandat | § 52 BRAO | Textform |
| Arbeitsvertrag / Nachweis der Arbeitsbedingungen | § 2 NachwG | Textform |
| Datenschutz-Einwilligung | Art. 7 DSGVO | keine |
| Mandatsvertrag, Auftrag, Schweigepflichtentbindung | – | keine |

Die Begründung, Fundstellen und Prüfpunkte je Regel stehen im Katalog und in der Recherche. Der Katalog ist über `GET /api/v1/form-rules` abrufbar.

### Funktionsweise

- Beim Hochladen durchsucht Paraph Titel und Dokumenttext nach Schlüsselwörtern und **schlägt** passende Regeln vor. Es gibt keine KI und keine Einzelfallprüfung; Treffer können fehlen oder falsch sein.
- Die absendende Person ordnet den Vorgang Formklassen zu (`form_classes`).
- Verlangt eine zugeordnete Regel Papier, notarielle Beurkundung oder QES (bei Stufe EES), **blockiert Paraph den Versand**, bis die Person den Hinweis ausdrücklich bestätigt. Regeln mit Mindestform Textform oder ohne Form zeigt Paraph nur als Hinweis an.
- Die Bestätigung wird mit Person (E-Mail-Adresse bzw. API-Schlüssel), Zeitpunkt, betroffenen Regeln und Signaturstufe im Vorgang gespeichert und als Ereignis `form.risk_acknowledged` in den Audit-Trail geschrieben.
- Ändert sich die Zuordnung danach, verfällt die Bestätigung.

Die Bestätigung bedeutet nicht, dass die Form gewahrt ist. Sie dokumentiert nur, dass die absendende Person den Hinweis gesehen hat.

## Mustervorlagen

Mitgelieferte oder in der Oberfläche vorgeschlagene Vorlagen und Texte (z. B. Mandatsvereinbarung) sind **Beispiele**. Sie sind nicht auf Ihren Fall geprüft und vor Verwendung anzupassen.

## Datenschutz (DSGVO)

### Welche personenbezogenen Daten Paraph speichert

| Bereich | Daten |
|---|---|
| Beteiligte | Name, E-Mail-Adresse, optional Mobilnummer, Rolle, Status und Zeitpunkte (versendet, geöffnet, abgeschlossen, abgelehnt), Ablehnungs- oder Vertretungsgrund |
| Audit-Trail je Vorgang | Ereignisse mit Zeitpunkt und Akteur (Name, E-Mail), beim Öffnen, Abschließen, Ablehnen und Vertreten **IP-Adresse und User-Agent**, Hashes der Erklärungstexte, maskierte Zieladresse für Einmalcodes |
| Inhalte | Dokumente, Feldwerte, Unterschriftsbilder, Anhänge (Dateien verschlüsselt) |
| Konten | Name, E-Mail, Passwort-Hash, Sitzungen mit IP und User-Agent, Aktivitätsprotokoll mit IP |
| Kontakte | Name, E-Mail, Mobilnummer der Beteiligten echter Vorgänge, für die Schnellauswahl |
| E-Mail-Ausgang | Empfänger, Betreff, Status; Inhalt nur bis zum Versand |
| Webhook-Zustellungen | Ereignisdaten (z. B. E-Mail-Adresse bei `recipient.notified`) |

### Aufbewahrung

- Inhalte (Dateien, Feldwerte): bis zur Löschung nach der Aufbewahrungsfrist der Organisation, sonst unbegrenzt. Siehe [Kapitel 4](04-administration.md#aufbewahrung-und-löschung).
- Audit-Trail, Beteiligte und Hashes: bleiben auch nach der Inhaltslöschung erhalten (Nachweisfunktion).
- E-Mail-Datensätze: 90 Tage. Webhook-Zustellungen: 30 Tage.
- Sicherungen enthalten den Stand zum Zeitpunkt der Sicherung, bis sie rotiert oder gelöscht werden.

Rechtsgrundlage, Informationspflichten (Art. 13, 14 DSGVO) und Löschkonzept legen Sie als Verantwortlicher fest.

### Auftragsverarbeitung

Paraph selbst ist Software auf Ihrem Server; es gibt keinen Anbieter, der Daten verarbeitet. Ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) ist nur nötig, soweit Sie externe Dienste einbinden, z. B.:

- **SMTP-Anbieter:** erhält Empfängeradresse, Betreff, Text mit Link; bei Abschluss optional das PDF als Anhang.
- **SMS-Gateway:** erhält Mobilnummer und Code.
- **Zeitstempeldienst (TSA):** erhält nur einen Hashwert, keine Inhalte. Ob hierfür ein Vertrag nötig ist, prüfen Sie im Einzelfall.
- **S3-Speicher:** erhält verschlüsselte Dateien.
- **Hoster** des Servers, falls nicht selbst betrieben.
