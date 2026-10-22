// Automatische Feldvorschläge – deterministisch, nachvollziehbar, ohne KI.
// Grundlage sind Textpositionen aus pdf.js: Unterstrichlinien, typische Beschriftungen, Kästchen.
import type { PageInfo, FieldType } from '../../shared/model.js';
import type { TextItem } from '../pdf/inspect.js';

export interface FieldSuggestion {
  page: number;
  type: FieldType;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  reason: string;
}

const RULES: { re: RegExp; type: FieldType; label: string }[] = [
  { re: /unterschrift|unterzeichn|signature|signed by|gez\.|\(mandant(in)?\)|\(auftraggeber/i, type: 'signature', label: 'Unterschrift' },
  { re: /paraphe|initialen|initials|kürzel/i, type: 'initials', label: 'Paraphe' },
  { re: /ort,?\s*datum|datum|date\b/i, type: 'date', label: 'Datum' },
  { re: /\biban\b/i, type: 'text', label: 'IBAN' },
  { re: /e-?mail/i, type: 'email', label: 'E-Mail' },
  { re: /telefon|phone|mobil/i, type: 'text', label: 'Telefon' },
  { re: /vor-?\s*und\s*nachname|name,\s*vorname|^name\b|full name/i, type: 'name', label: 'Name' },
  { re: /anschrift|adresse|address|straße/i, type: 'text', label: 'Anschrift' },
];

export function detectFields(items: TextItem[][], pages: PageInfo[]): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  items.forEach((pageItems, pi) => {
    const pg = pages[pi];
    if (!pg) return;
    const ptH = (pt: number) => pt / pg.height;
    const ptW = (pt: number) => pt / pg.width;
    // 1. Unterstrichlinien: Feld über der Linie, Typ aus Beschriftung in der Nähe
    for (const it of pageItems) {
      const m = /_{6,}|\.{10,}/.exec(it.str);
      if (!m) continue;
      const charW = it.w / Math.max(1, it.str.length);
      const x = it.x + charW * m.index;
      const w = Math.max(charW * m[0].length, ptW(40));
      const before = it.str.slice(0, m.index).trim();
      const nearby = [
        before,
        ...pageItems.filter((o) => o !== it && Math.abs(o.y - it.y) < ptH(4) && o.x < x && x - (o.x + o.w) < ptW(120)).map((o) => o.str),
        ...pageItems.filter((o) => o.y > it.y && o.y - it.y < ptH(26) && Math.abs(o.x - x) < ptW(80)).map((o) => o.str),
      ].join(' ');
      const rule = RULES.find((r) => r.re.test(nearby));
      const type = rule?.type ?? 'text';
      const h = type === 'signature' ? ptH(34) : ptH(16);
      out.push({ page: pi, type, x, y: Math.max(0, it.y + it.h - h + ptH(2)), w: Math.min(w, 1 - x), h, label: rule?.label ?? (before.replace(/[:\s]+$/, '') || 'Text'), reason: rule ? `Linie bei „${nearby.trim().slice(0, 40)}“` : 'Unterstrichlinie' });
    }
    // 2. Kästchen ☐ □ ▢ → Checkbox
    for (const it of pageItems) {
      const idx = it.str.search(/[☐□▢❏]/);
      if (idx < 0) continue;
      const charW = it.w / Math.max(1, it.str.length);
      const s = Math.max(it.h, ptH(10));
      out.push({ page: pi, type: 'checkbox', x: it.x + charW * idx, y: it.y, w: s * (pg.height / pg.width), h: s, label: it.str.slice(idx + 1).trim().slice(0, 60) || 'Bestätigung', reason: 'Kästchen im Text' });
    }
  });
  // Überlappende Vorschläge entfernen
  const res: FieldSuggestion[] = [];
  for (const s of out) {
    if (res.some((r) => r.page === s.page && Math.abs(r.x - s.x) < 0.01 && Math.abs(r.y - s.y) < 0.01)) continue;
    res.push(s);
  }
  return res.slice(0, 200);
}
