// Regelbasierter, erweiterbarer Katalog für Formhinweise (deutsches Recht, Stand 22.10.2026).
// Grundlage: docs/recherche/formvorschriften-und-markt.md (Primärquellen gesetze-im-internet.de).
// Der Katalog gibt Hinweise und Anlass zur Prüfung – er entscheidet keine Einzelfälle.
// Keine KI: Vorschläge entstehen ausschließlich aus nachvollziehbaren Schlüsselwortregeln.

export type MinLevel = 'NONE' | 'TEXT' | 'QES' | 'PAPER' | 'NOTARY';

export interface FormRule {
  id: string;
  norm: string;
  label: string;
  minLevel: MinLevel;
  hint: string;
  source?: string;
  confidence: 'hoch' | 'mittel' | 'niedrig';
  /** Muster auf Dokumenttext und Titel (Kleinschreibung, ohne Umlaut-Normalisierung) */
  patterns: RegExp[];
  checklist?: string[];
}

const g = (p: string) => `https://www.gesetze-im-internet.de/${p}`;

export const FORM_RULES: FormRule[] = [
  {
    id: 'arbeit_kuendigung',
    norm: '§ 623 BGB',
    label: 'Kündigung oder Aufhebungsvertrag eines Arbeitsverhältnisses',
    minLevel: 'PAPER',
    hint: 'Kündigungen und Aufhebungsverträge im Arbeitsverhältnis sind nur mit Originalunterschrift auf Papier wirksam. Jede elektronische Signatur – auch die QES – führt zur Unwirksamkeit.',
    source: g('bgb/__623.html'),
    confidence: 'hoch',
    patterns: [/aufhebungsvertrag/, /auflösungsvertrag/, /kündig\w* (des|das) arbeitsverhältnis/, /kündigung des arbeitsvertrag/, /beendigung des arbeitsverhältnisses durch kündigung/],
  },
  {
    id: 'buergschaft',
    norm: '§ 766 BGB',
    label: 'Bürgschaftserklärung',
    minLevel: 'PAPER',
    hint: 'Die Bürgschaftserklärung muss auf Papier eigenhändig unterschrieben werden; die elektronische Form ist gesetzlich ausgeschlossen (Ausnahme: Kaufleute, § 350 HGB – bitte prüfen).',
    source: g('bgb/__766.html'),
    confidence: 'hoch',
    patterns: [/bürgschaft/, /\bbürge\b/, /selbstschuldnerisch/],
  },
  {
    id: 'schuldversprechen',
    norm: '§§ 780, 781 BGB',
    label: 'Schuldversprechen oder Schuldanerkenntnis',
    minLevel: 'PAPER',
    hint: 'Selbständiges Schuldversprechen und abstraktes Schuldanerkenntnis brauchen eigenhändige Unterschrift auf Papier; die elektronische Form ist ausgeschlossen. Ausnahmen (§ 782 BGB, § 350 HGB) bitte prüfen.',
    source: g('bgb/__781.html'),
    confidence: 'hoch',
    patterns: [/schuldanerkenntnis/, /schuldversprechen/],
  },
  {
    id: 'testament',
    norm: '§ 2247 BGB',
    label: 'Testament',
    minLevel: 'PAPER',
    hint: 'Ein Testament muss vollständig handschriftlich geschrieben und unterschrieben oder notariell errichtet werden. Elektronisch ist es unwirksam.',
    source: g('bgb/__2247.html'),
    confidence: 'hoch',
    patterns: [/\btestament\b/, /letztwillige verfügung/, /\berbeinsetzung\b/],
  },
  {
    id: 'notariell',
    norm: '§§ 311b, 518, 1410, 2276, 2348 BGB; §§ 2, 15 GmbHG',
    label: 'Notariell zu beurkundendes Geschäft',
    minLevel: 'NOTARY',
    hint: 'Grundstücksgeschäfte, Schenkungsversprechen, Eheverträge, Erbverträge, Erbverzichte, GmbH-Gründungen und Anteilsabtretungen müssen notariell beurkundet werden. Eine elektronische Signatur genügt nicht.',
    source: g('bgb/__311b.html'),
    confidence: 'hoch',
    patterns: [/grundstückskaufvertrag/, /\bauflassung\b/, /schenkungsversprechen/, /\behevertrag\b/, /\berbvertrag\b/, /erbverzicht/, /pflichtteilsverzicht/, /geschäftsanteilsabtretung/, /abtretung (von|der) geschäftsanteil/],
  },
  {
    id: 'befristung',
    norm: '§ 14 Abs. 4 TzBfG',
    label: 'Befristung eines Arbeitsvertrags',
    minLevel: 'QES',
    hint: 'Die Befristungsabrede braucht Schriftform. Elektronisch wirksam nur mit QES beider Seiten vor Arbeitsantritt – sonst gilt der Vertrag als unbefristet.',
    source: g('tzbfg/__14.html'),
    confidence: 'hoch',
    patterns: [/befristet\w* arbeitsvertrag/, /befristung des arbeitsverhältnisses/, /arbeitsverhältnis ist befristet/, /sachgrundlos befristet/],
  },
  {
    id: 'zeugnis',
    norm: '§ 109 GewO',
    label: 'Arbeitszeugnis',
    minLevel: 'QES',
    hint: 'Ein elektronisches Zeugnis ist nur mit QES und Einwilligung des Arbeitnehmers zulässig; sonst auf Papier unterschreiben.',
    source: g('gewo/__109.html'),
    confidence: 'hoch',
    patterns: [/arbeitszeugnis/, /qualifiziertes zeugnis/, /zwischenzeugnis/],
  },
  {
    id: 'wettbewerbsverbot',
    norm: '§ 74 HGB',
    label: 'Nachvertragliches Wettbewerbsverbot',
    minLevel: 'QES',
    hint: 'Wettbewerbsverbote brauchen Schriftform und Aushändigung einer unterzeichneten Urkunde. Sicher sind QES oder Papier; ob eine elektronische Aushändigung genügt, ist nicht abschließend geklärt.',
    source: g('hgb/__74.html'),
    confidence: 'mittel',
    patterns: [/nachvertraglich\w* wettbewerbsverbot/, /karenzentschädigung/],
  },
  {
    id: 'betriebsvereinbarung',
    norm: '§ 77 Abs. 2 BetrVG',
    label: 'Betriebsvereinbarung',
    minLevel: 'QES',
    hint: 'Elektronisch nur mit QES von Arbeitgeber und Betriebsrat auf demselben Dokument.',
    source: g('betrvg/__77.html'),
    confidence: 'hoch',
    patterns: [/betriebsvereinbarung/],
  },
  {
    id: 'verbraucherdarlehen',
    norm: '§ 492 BGB',
    label: 'Verbraucherdarlehensvertrag',
    minLevel: 'QES',
    hint: 'Verbraucherdarlehen und Vollmachten dazu brauchen Schriftform; elektronisch nur mit QES des Darlehensnehmers.',
    source: g('bgb/__492.html'),
    confidence: 'hoch',
    patterns: [/verbraucherdarlehen/, /darlehensvertrag/],
  },
  {
    id: 'wohnraummiete_kuendigung',
    norm: '§ 568 BGB',
    label: 'Kündigung eines Wohnraummietverhältnisses',
    minLevel: 'QES',
    hint: 'Die Kündigung von Wohnraum braucht Schriftform: Papier oder QES. Eine einfache elektronische Signatur ist unwirksam.',
    source: g('bgb/__568.html'),
    confidence: 'hoch',
    patterns: [/kündigung (des|der) (wohnraum)?mietverhältnis/, /kündigung (der|des) wohnung/, /kündige ich das mietverhältnis/],
  },
  {
    id: 'wohnraummiete',
    norm: '§ 550 BGB',
    label: 'Wohnraummietvertrag über mehr als ein Jahr',
    minLevel: 'QES',
    hint: 'Ohne Schriftform (QES oder Papier) gilt der Mietvertrag als auf unbestimmte Zeit geschlossen und ist vorzeitig kündbar; er bleibt aber wirksam.',
    source: g('bgb/__550.html'),
    confidence: 'hoch',
    patterns: [/wohnraummietvertrag/, /mietvertrag über wohnraum/, /staffelmiete/],
  },
  {
    id: 'gewerbemiete',
    norm: '§ 578 BGB',
    label: 'Gewerbemietvertrag',
    minLevel: 'TEXT',
    hint: 'Für Gewerbemietverträge genügt seit dem BEG IV die Textform; eine einfache elektronische Signatur reicht für die feste Laufzeit.',
    source: g('bgb/__578.html'),
    confidence: 'hoch',
    patterns: [/gewerbemietvertrag/, /mietvertrag über gewerberäume/, /gewerberaummiet/],
  },
  {
    id: 'schiedsvereinbarung_verbraucher',
    norm: '§ 1031 Abs. 5 ZPO',
    label: 'Schiedsvereinbarung mit Verbraucher',
    minLevel: 'QES',
    hint: 'Mit Verbrauchern nur eigenhändig auf Papier oder mit QES – in einem separaten Dokument ohne weitere Vereinbarungen.',
    source: g('zpo/__1031.html'),
    confidence: 'hoch',
    patterns: [/schiedsvereinbarung/, /schiedsgericht/],
  },
  {
    id: 'verguetungsvereinbarung',
    norm: '§ 3a RVG',
    label: 'Anwaltliche Vergütungsvereinbarung',
    minLevel: 'TEXT',
    hint: 'Textform genügt. Inhaltliche Pflichten beachten: als Vergütungsvereinbarung bezeichnet, von anderen Vereinbarungen deutlich abgesetzt, nicht in der Vollmacht, Hinweis auf begrenzte Kostenerstattung.',
    source: g('rvg/__3a.html'),
    confidence: 'hoch',
    patterns: [/vergütungsvereinbarung/, /honorarvereinbarung/, /stundensatz/, /erfolgshonorar/],
    checklist: [
      'Das Dokument ist als „Vergütungsvereinbarung“ bezeichnet.',
      'Die Vereinbarung ist von anderen Vereinbarungen (außer der Auftragserteilung) deutlich abgesetzt.',
      'Sie ist nicht in der Vollmacht enthalten.',
      'Hinweis: Die gegnerische Partei / Staatskasse erstattet regelmäßig nicht mehr als die gesetzliche Vergütung.',
    ],
  },
  {
    id: 'haftungsbeschraenkung',
    norm: '§ 52 BRAO',
    label: 'Haftungsbeschränkung im Mandat',
    minLevel: 'TEXT',
    hint: 'Die Haftungsbeschränkung muss im Einzelfall in Textform vereinbart werden.',
    source: g('brao/__52.html'),
    confidence: 'hoch',
    patterns: [/haftungsbeschränkung/, /haftungsbegrenzung/],
  },
  {
    id: 'prozessvollmacht',
    norm: '§ 80 ZPO, § 174 BGB',
    label: 'Vollmacht (Prozess- oder Kündigungsvollmacht)',
    minLevel: 'PAPER',
    hint: 'Für das Mandat genügt eine einfache Signatur. Gegenüber Gericht (bei Rüge) und bei einseitigen Erklärungen wie Kündigungen sollte eine Originalvollmacht auf Papier vorliegen – ob eine elektronische Vollmacht genügt, ist nicht abschließend geklärt.',
    source: g('zpo/__80.html'),
    confidence: 'niedrig',
    patterns: [/prozessvollmacht/, /\bvollmacht\b/],
  },
  {
    id: 'nachweis_arbeitsbedingungen',
    norm: '§ 2 NachwG',
    label: 'Arbeitsvertrag / Nachweis der Arbeitsbedingungen',
    minLevel: 'TEXT',
    hint: 'Textform genügt, wenn das Dokument speicher- und druckbar ist und der Arbeitnehmer den Empfang bestätigt – nicht in Branchen nach § 2a SchwarzArbG (z. B. Bau, Gastronomie). Befristungen beachten (§ 14 Abs. 4 TzBfG).',
    source: g('nachwg/__2.html'),
    confidence: 'hoch',
    patterns: [/\barbeitsvertrag\b/, /anstellungsvertrag/],
  },
  {
    id: 'einwilligung_dsgvo',
    norm: 'Art. 7 DSGVO',
    label: 'Datenschutz-Einwilligung',
    minLevel: 'NONE',
    hint: 'Formfrei, aber nachweisbar. Die Einwilligung gehört in einen klar abgesetzten Abschnitt und muss widerrufbar sein.',
    confidence: 'mittel',
    patterns: [/einwilligung\w* (in die|zur) (verarbeitung|datenverarbeitung)/, /datenschutzrechtliche einwilligung/],
  },
  {
    id: 'mandatsvertrag',
    norm: '–',
    label: 'Mandatsvertrag, Auftrag, Schweigepflichtentbindung',
    minLevel: 'NONE',
    hint: 'Gesetzlich formfrei; die elektronische Signatur dient dem Nachweis.',
    confidence: 'mittel',
    patterns: [/mandatsvereinbarung/, /mandatsvertrag/, /schweigepflichtentbindung/, /entbindung von der schweigepflicht/],
  },
];

export const LEVEL_TEXT: Record<MinLevel, { de: string; en: string; severity: 'info' | 'warn' | 'critical' }> = {
  NONE: { de: 'Keine gesetzliche Form', en: 'No statutory form', severity: 'info' },
  TEXT: { de: 'Textform genügt – einfache elektronische Signatur reicht, wenn alle Parteien das unterschriebene PDF dauerhaft erhalten', en: 'Text form suffices – a simple electronic signature is enough if all parties durably receive the signed PDF', severity: 'info' },
  QES: { de: 'Schriftform – elektronisch nur mit QES', en: 'Written form – electronically only with QES', severity: 'warn' },
  PAPER: { de: 'Papier mit Originalunterschrift erforderlich bzw. empfohlen', en: 'Wet-ink paper signature required or recommended', severity: 'critical' },
  NOTARY: { de: 'Notarielle Beurkundung erforderlich', en: 'Notarisation required', severity: 'critical' },
};

export interface FormMatch {
  ruleId: string;
  matched: string; // getroffene Textstelle (für Nachvollziehbarkeit)
}

export function suggestRules(text: string): FormMatch[] {
  const t = text.toLowerCase();
  const out: FormMatch[] = [];
  for (const r of FORM_RULES) {
    for (const p of r.patterns) {
      const m = p.exec(t);
      if (m) {
        const start = Math.max(0, m.index - 30);
        out.push({ ruleId: r.id, matched: t.slice(start, m.index + m[0].length + 30).replace(/\s+/g, ' ').trim() });
        break;
      }
    }
  }
  return out;
}

export function ruleById(id: string) {
  return FORM_RULES.find((r) => r.id === id);
}

/** Erfordert die Klassifizierung eine ausdrückliche Bestätigung vor dem Versand mit EES? */
export function needsAck(ruleIds: string[], level: 'ses' | 'qes'): FormRule[] {
  return ruleIds
    .map(ruleById)
    .filter((r): r is FormRule => !!r)
    .filter((r) => r.minLevel === 'PAPER' || r.minLevel === 'NOTARY' || (r.minLevel === 'QES' && level !== 'qes'));
}
