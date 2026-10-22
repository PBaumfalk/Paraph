// Eingebettete Schriften mit zeichenweisem Fallback (Latin, Latin Extended, Kyrillisch, Griechisch).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont, PDFPage, Color } from 'pdf-lib';

const require = createRequire(import.meta.url);
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'greek'];

function fontFiles(pkg: string, family: string, weight: number): Buffer[] {
  let dir: string;
  try {
    dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  } catch {
    return [];
  }
  const out: Buffer[] = [];
  for (const s of SUBSETS) {
    try {
      out.push(readFileSync(join(dir, `${family}-${s}-${weight}-normal.woff`)));
    } catch {}
  }
  return out;
}

const cache = new Map<string, { bytes: Buffer; fk: any }[]>();
function load(pkg: string, family: string, weight: number) {
  const k = `${pkg}:${weight}`;
  if (!cache.has(k)) cache.set(k, fontFiles(pkg, family, weight).map((bytes) => ({ bytes, fk: fontkit.create(bytes) })));
  return cache.get(k)!;
}

export type FontRole = 'regular' | 'semibold' | 'mono' | 'serif';

export class FontChain {
  private constructor(private parts: { font: PDFFont; fk: any }[], private fallback: PDFFont) {}

  static async create(doc: PDFDocument, role: FontRole): Promise<FontChain> {
    doc.registerFontkit(fontkit as any);
    const spec: Record<FontRole, [string, string, number]> = {
      regular: ['@fontsource/geist', 'geist', 400],
      semibold: ['@fontsource/geist', 'geist', 600],
      mono: ['@fontsource/geist-mono', 'geist-mono', 400],
      serif: ['@fontsource/newsreader', 'newsreader', 400],
    };
    const [pkg, fam, w] = spec[role];
    const files = load(pkg, fam, w);
    const parts: { font: PDFFont; fk: any }[] = [];
    for (const f of files) parts.push({ font: await doc.embedFont(f.bytes, { subset: true }), fk: f.fk });
    // Ergänzend Geist für Zeichen, die z. B. Instrument Serif nicht enthält
    if (role !== 'regular') {
      for (const f of load('@fontsource/geist', 'geist', 400)) parts.push({ font: await doc.embedFont(f.bytes, { subset: true }), fk: f.fk });
    }
    const { StandardFonts } = await import('pdf-lib');
    const fallback = await doc.embedFont(StandardFonts.Helvetica);
    return new FontChain(parts, fallback);
  }

  runs(text: string): { font: PDFFont; text: string }[] {
    const out: { font: PDFFont; text: string }[] = [];
    for (const ch of text.replace(/[\u0000-\u001f]/g, ' ')) {
      const cp = ch.codePointAt(0)!;
      let font: PDFFont | null = null;
      let c = ch;
      for (const p of this.parts) {
        if (p.fk.hasGlyphForCodePoint(cp)) {
          font = p.font;
          break;
        }
      }
      if (!font) {
        font = this.fallback;
        c = cp < 0x7f ? ch : '?';
      }
      const last = out[out.length - 1];
      if (last && last.font === font) last.text += c;
      else out.push({ font, text: c });
    }
    return out;
  }

  width(text: string, size: number): number {
    return this.runs(text).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  }

  draw(page: PDFPage, text: string, x: number, y: number, size: number, color: Color) {
    let cx = x;
    for (const r of this.runs(text)) {
      page.drawText(r.text, { x: cx, y, size, font: r.font, color });
      cx += r.font.widthOfTextAtSize(r.text, size);
    }
  }

  /** Kürzt Text mit Auslassungszeichen auf eine maximale Breite. */
  fit(text: string, size: number, maxWidth: number): string {
    if (this.width(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && this.width(t + '…', size) > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  /** Bricht Text in Zeilen um. */
  wrap(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? line + ' ' + word : word;
        if (this.width(tryLine, size) <= maxWidth) line = tryLine;
        else {
          if (line) lines.push(line);
          line = this.width(word, size) <= maxWidth ? word : this.fit(word, size, maxWidth);
        }
      }
      lines.push(line);
    }
    return lines;
  }
}
