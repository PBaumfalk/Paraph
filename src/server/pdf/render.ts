// Einbrennen der ausgefüllten Felder und Unterschriften in die maßgebliche Dokumentversion.
import {
  PDFDocument,
  PDFContentStream,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  rgb,
  degrees,
  type PDFPage,
} from 'pdf-lib';
import type { PageInfo } from '../../shared/model.js';
import { placeField } from './geometry.js';
import { FontChain } from './fonts.js';

export interface RenderItem {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  text?: string;
  image?: Buffer; // PNG
  caption?: string;
  checked?: boolean;
  fontSize?: number;
}

export const INK = rgb(0.12, 0.15, 0.36);
const SEAL = rgb(0.17, 0.24, 0.85);

/** Kapselt den vorhandenen Seiteninhalt in q … Q, damit ein nicht zurückgesetzter Grafikzustand
 *  des Originals keine nachträglich gezeichneten Inhalte verschiebt. */
export function isolatePageContent(doc: PDFDocument, page: PDFPage) {
  page.node.normalize();
  const start = doc.context.register(PDFContentStream.of(doc.context.obj({}), [pushGraphicsState()]));
  const end = doc.context.register(PDFContentStream.of(doc.context.obj({}), [popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

export async function renderFields(
  source: Uint8Array,
  pages: PageInfo[],
  items: RenderItem[],
  opts: { watermark?: string } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { updateMetadata: false });
  const fonts = await FontChain.create(doc, 'regular');
  const mono = await FontChain.create(doc, 'mono');
  const docPages = doc.getPages();
  const touched = new Set<number>();
  const ensure = (i: number) => {
    if (!touched.has(i)) {
      isolatePageContent(doc, docPages[i]);
      touched.add(i);
    }
    return docPages[i];
  };

  for (const it of items) {
    const info = pages[it.page];
    if (!info || !docPages[it.page]) throw new Error(`Seite ${it.page + 1} existiert nicht`);
    const page = ensure(it.page);
    const pl = placeField(info, it);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...pl.matrix));
    const W = pl.width;
    const H = pl.height;

    if (it.image) {
      const img = await doc.embedPng(it.image);
      const capH = it.caption ? Math.min(Math.max(H * 0.2, 4.5), 7) : 0;
      const availH = H - capH - 1;
      const scale = Math.min((W - 3) / img.width, availH / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      page.drawImage(img, { x: 3, y: capH + 1 + (availH - ih) / 2, width: iw, height: ih });
      // Signaturklammer: dünne Linie links, Beschriftung unten – kennzeichnet die elektronische Signatur.
      page.drawLine({ start: { x: 0.6, y: 0.5 }, end: { x: 0.6, y: H - 0.5 }, thickness: 0.8, color: SEAL });
      page.drawLine({ start: { x: 0.6, y: H - 0.5 }, end: { x: Math.min(8, W / 4), y: H - 0.5 }, thickness: 0.8, color: SEAL });
      if (it.caption) {
        const size = capH * 0.82;
        mono.draw(page, mono.fit(it.caption, size, W - 4), 3, capH * 0.18, size, SEAL);
      }
    } else if (it.type === 'checkbox') {
      if (it.checked) {
        const s = Math.min(W, H);
        const ox = (W - s) / 2;
        const oy = (H - s) / 2;
        page.drawLine({ start: { x: ox + s * 0.2, y: oy + s * 0.52 }, end: { x: ox + s * 0.42, y: oy + s * 0.25 }, thickness: Math.max(1, s * 0.11), color: INK });
        page.drawLine({ start: { x: ox + s * 0.42, y: oy + s * 0.25 }, end: { x: ox + s * 0.82, y: oy + s * 0.78 }, thickness: Math.max(1, s * 0.11), color: INK });
      }
    } else if (it.text !== undefined && it.text !== '') {
      let size = it.fontSize ?? Math.min(11, H * 0.62);
      const pad = Math.min(2, W * 0.03);
      const maxW = W - pad * 2;
      // Mehrzeilig, wenn das Feld hoch genug ist; sonst einzeilig mit Verkleinerung bis 6 pt.
      if (H > size * 2.6) {
        const lines = fonts.wrap(it.text, size, maxW);
        const lh = size * 1.25;
        const maxLines = Math.max(1, Math.floor((H - pad) / lh));
        lines.slice(0, maxLines).forEach((ln, i) => fonts.draw(page, ln, pad, H - pad - size - i * lh, size, INK));
      } else {
        while (size > 6 && fonts.width(it.text, size) > maxW) size -= 0.5;
        const t = fonts.fit(it.text, size, maxW);
        fonts.draw(page, t, pad, (H - size * 0.72) / 2, size, INK);
      }
    }
    page.pushOperators(popGraphicsState());
  }

  if (opts.watermark) {
    for (let i = 0; i < docPages.length; i++) {
      const page = ensure(i);
      const info = pages[i];
      const pl = placeField(info, { x: 0, y: 0, w: 1, h: 1 });
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...pl.matrix));
      const size = Math.min(info.width, info.height) / 9;
      const tw = fonts.width(opts.watermark, size);
      const ang = Math.atan2(info.height, info.width);
      const cx = info.width / 2 - (Math.cos(ang) * tw) / 2;
      const cy = info.height / 2 - (Math.sin(ang) * tw) / 2;
      for (const r of fonts.runs(opts.watermark)) {
        page.drawText(r.text, { x: cx, y: cy, size, font: r.font, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees((ang * 180) / Math.PI) });
      }
      page.pushOperators(popGraphicsState());
    }
  }

  return doc.save({ useObjectStreams: false });
}
