// Die Abschlussbestätigung bettet echte Schriften ein. Fehlt ein Schriftpaket zur Laufzeit (z. B. weil es nur
// als Entwicklungsabhängigkeit installiert ist), fiele das PDF still auf Helvetica zurück und setzte „?“ für Umlaute.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { FontChain, type FontRole } from '../src/server/pdf/fonts.js';

describe('PDF-Schriften', () => {
  for (const role of ['regular', 'semibold', 'mono', 'serif'] as FontRole[]) {
    it(`${role}: echte Schrift eingebettet, Umlaute und ß ohne Notbehelf`, async () => {
      const doc = await PDFDocument.create();
      const chain = await FontChain.create(doc, role);
      expect(chain.embedded).toBeGreaterThan(0);
      const runs = chain.runs('Größe – Übergabe, Äußerung „ß“ Ωμέγα Жизнь');
      expect(runs.map((r) => r.text).join('')).not.toContain('?');
      // Erst beim Speichern werden die Teilmengen gebildet – dort scheitern defekte Schriftdateien
      const page = doc.addPage();
      let x = 10;
      for (const r of runs) {
        page.drawText(r.text, { font: r.font, size: 10, x, y: 10 });
        x += r.font.widthOfTextAtSize(r.text, 10);
      }
      expect((await doc.save()).length).toBeGreaterThan(1000);
    });
  }
  it('alle verwendeten Schriftpakete sind Laufzeit-Abhängigkeiten (überleben npm prune --omit=dev im Image)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const src = readFileSync(new URL('../src/server/pdf/fonts.ts', import.meta.url), 'utf8');
    const used = [...new Set([...src.matchAll(/'(@fontsource[^']+)'/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(pkg.dependencies, u).toHaveProperty([u]);
  });
});
