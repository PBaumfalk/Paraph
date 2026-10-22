// Testdokumente und unabhängige Rasterung mit Poppler (pdftoppm).
import { PDFDocument, PDFName, PDFNumber, StandardFonts, rgb, degrees, PDFArray } from 'pdf-lib';
import { PNG } from 'pngjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function makePdf(opts: { pages?: number; rotation?: number; crop?: [number, number, number, number]; unbalancedCm?: boolean; size?: [number, number]; title?: string } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [w, h] = opts.size ?? [595.28, 841.89];
  for (let i = 0; i < (opts.pages ?? 1); i++) {
    const p = doc.addPage([w, h]);
    p.drawText(`${opts.title ?? 'Testdokument'} – Seite ${i + 1}`, { x: 60, y: h - 80, size: 18, font });
    p.drawText('Unterschrift: ______________________', { x: 60, y: 120, size: 12, font });
    p.drawText('Datum: ____________', { x: 360, y: 120, size: 12, font });
    if (opts.rotation) p.setRotation(degrees(opts.rotation));
    if (opts.crop) p.setCropBox(...opts.crop);
  }
  let bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  if (opts.unbalancedCm) {
    // Inhalt, der die Transformationsmatrix verändert und nicht zurücksetzt (kommt in der Praxis vor)
    const d2 = await PDFDocument.load(bytes);
    for (const p of d2.getPages()) {
      const s = d2.context.register(d2.context.stream('0.5 0 0 0.5 30 40 cm\n'));
      const contents = p.node.get(PDFName.of('Contents'));
      const arr = contents instanceof PDFArray ? contents.asArray() : [contents];
      p.node.set(PDFName.of('Contents'), d2.context.obj([s, ...(arr as any[])]));
    }
    bytes = Buffer.from(await d2.save({ useObjectStreams: false }));
  }
  return bytes;
}

export function solidPng(w: number, h: number, rgba = [0, 0, 0, 255]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) png.data.set(rgba, i * 4);
  return PNG.sync.write(png);
}

/** Rastert eine Seite mit Poppler (unabhängig von pdf-lib/pdf.js) als Graustufen. */
export function rasterize(pdf: Uint8Array, page: number, dpi = 72): { width: number; height: number; px: Uint8Array } {
  const dir = mkdtempSync(join(tmpdir(), 'paraph-r-'));
  const f = join(dir, 'in.pdf');
  writeFileSync(f, pdf);
  execFileSync('pdftoppm', ['-cropbox', '-r', String(dpi), '-gray', '-f', String(page + 1), '-l', String(page + 1), f, join(dir, 'out')]);
  const file = readdirSync(dir).find((n) => n.endsWith('.pgm'))!;
  const buf = readFileSync(join(dir, file));
  // PGM P5 parsen
  const header = buf.subarray(0, 64).toString('latin1');
  const m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(header)!;
  const width = +m[1], height = +m[2];
  const offset = m[0].length;
  return { width, height, px: buf.subarray(offset, offset + width * height) };
}

export function darkBBox(r: { width: number; height: number; px: Uint8Array }, threshold = 60, region?: { x0: number; y0: number; x1: number; y1: number }) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
  const rx0 = region?.x0 ?? 0, ry0 = region?.y0 ?? 0, rx1 = region?.x1 ?? r.width, ry1 = region?.y1 ?? r.height;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    if (r.px[y * r.width + x] < threshold) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, n };
}

/** Begrenzungsrahmen aller Pixel, die in `after` dunkel und in `before` hell sind. */
export function diffBBox(before: { width: number; height: number; px: Uint8Array }, after: { width: number; height: number; px: Uint8Array }, threshold = 100) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
    const i = y * after.width + x;
    if (after.px[i] < threshold && before.px[i] >= threshold) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, n };
}

export function signaturePng(seed = 1): string {
  const w = 400, h = 120;
  const png = new PNG({ width: w, height: h });
  for (let x = 20; x < w - 20; x++) {
    const y = Math.round(h / 2 + Math.sin((x + seed * 13) / 18) * 30);
    for (let dy = -3; dy <= 3; dy++) {
      const i = ((y + dy) * w + x) * 4;
      png.data[i] = 20; png.data[i + 1] = 30; png.data[i + 2] = 90; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString('base64');
}

