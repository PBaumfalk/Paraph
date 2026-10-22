// Prüfung und Normalisierung hochgeladener PDFs. Ergebnis ist die maßgebliche Dokumentversion,
// deren Hash an alle späteren Signaturhandlungen gebunden wird.
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream } from 'pdf-lib';
import type { PageInfo } from '../../shared/model.js';
import { normalizeRotation } from './geometry.js';
import { AppError } from '../lib/errors.js';

export interface InspectedPdf {
  bytes: Buffer;
  pages: PageInfo[];
  warnings: string[];
  text: string[]; // Text je Seite (für Formhinweise und Feldvorschläge)
  textItems: TextItem[][];
}

export interface TextItem {
  str: string;
  x: number; // sichtbar, normiert
  y: number;
  w: number;
  h: number;
}

const fail = (code: string, msg: string) => new AppError(422, code, msg);

export async function inspectAndNormalize(input: Buffer, maxPages: number): Promise<InspectedPdf> {
  const head = input.subarray(0, 1024).toString('latin1');
  if (!head.includes('%PDF-')) throw fail('pdf_invalid', 'Die Datei ist kein PDF.');
  const warnings: string[] = [];

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (e: any) {
    if (/encrypted/i.test(String(e?.message))) throw fail('pdf_encrypted', 'Das PDF ist verschlüsselt oder passwortgeschützt. Bitte eine ungeschützte Fassung hochladen.');
    throw fail('pdf_corrupt', 'Das PDF ist beschädigt und kann nicht gelesen werden.');
  }
  if (doc.isEncrypted) throw fail('pdf_encrypted', 'Das PDF ist verschlüsselt oder passwortgeschützt. Bitte eine ungeschützte Fassung hochladen.');

  const count = doc.getPageCount();
  if (count === 0) throw fail('pdf_empty', 'Das PDF enthält keine Seiten.');
  if (count > maxPages) throw fail('pdf_too_many_pages', `Das PDF hat ${count} Seiten (erlaubt: ${maxPages}).`);

  const catalog = doc.catalog;
  // Aktive Inhalte entfernen: JavaScript, automatische Aktionen, eingebettete Dateien, XFA.
  let removedActive = false;
  for (const key of ['OpenAction', 'AA']) {
    if (catalog.has(PDFName.of(key))) {
      catalog.delete(PDFName.of(key));
      removedActive = true;
    }
  }
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (names) {
    for (const key of ['JavaScript', 'EmbeddedFiles']) {
      if (names.has(PDFName.of(key))) {
        names.delete(PDFName.of(key));
        removedActive = true;
      }
    }
  }

  const acro = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  let hadSignatures = false;
  if (acro) {
    if (acro.has(PDFName.of('XFA'))) {
      acro.delete(PDFName.of('XFA'));
      removedActive = true;
    }
    const sigFlags = acro.lookup(PDFName.of('SigFlags'));
    if (sigFlags) hadSignatures = true;
  }
  try {
    const form = doc.getForm();
    const fields = form.getFields();
    if (fields.some((f) => f.constructor.name === 'PDFSignature')) hadSignatures = true;
    if (fields.length > 0) {
      form.flatten({ updateFieldAppearances: false });
      warnings.push('Vorhandene PDF-Formularfelder wurden in den Seiteninhalt übernommen (nicht mehr bearbeitbar).');
    }
  } catch {
    // Formular nicht flachzurechnen: AcroForm entfernen, Seiteninhalt bleibt erhalten.
    catalog.delete(PDFName.of('AcroForm'));
    warnings.push('Die PDF-Formularfelder konnten nicht übernommen werden und wurden entfernt.');
  }
  if (hadSignatures) warnings.push('Das PDF enthielt bereits digitale Signaturen. Diese werden durch die Verarbeitung ungültig.');

  const pages: PageInfo[] = [];
  for (const page of doc.getPages()) {
    // Seiten-Aktionen und gefährliche Annotationsaktionen entfernen
    if (page.node.has(PDFName.of('AA'))) {
      page.node.delete(PDFName.of('AA'));
      removedActive = true;
    }
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      for (let i = 0; i < annots.size(); i++) {
        const a = annots.lookupMaybe(i, PDFDict);
        if (!a) continue;
        if (a.has(PDFName.of('AA'))) { a.delete(PDFName.of('AA')); removedActive = true; }
        const action = a.lookupMaybe(PDFName.of('A'), PDFDict);
        const s = action?.lookup(PDFName.of('S'));
        if (s && ['/JavaScript', '/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/GoToE', '/RichMediaExecute'].includes(String(s))) {
          a.delete(PDFName.of('A'));
          removedActive = true;
        }
      }
    }
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    // Wie pdf.js: CropBox auf MediaBox begrenzen
    const x0 = Math.max(Math.min(crop.x, crop.x + crop.width), Math.min(media.x, media.x + media.width));
    const y0 = Math.max(Math.min(crop.y, crop.y + crop.height), Math.min(media.y, media.y + media.height));
    const x1 = Math.min(Math.max(crop.x, crop.x + crop.width), Math.max(media.x, media.x + media.width));
    const y1 = Math.min(Math.max(crop.y, crop.y + crop.height), Math.max(media.y, media.y + media.height));
    let box: [number, number, number, number] = [x0, y0, x1 - x0, y1 - y0];
    if (!(box[2] > 1 && box[3] > 1)) box = [media.x, media.y, Math.abs(media.width), Math.abs(media.height)];
    if (box[2] < 36 || box[3] < 36 || box[2] > 14400 || box[3] > 14400) throw fail('pdf_page_size', 'Das PDF enthält Seiten mit ungültiger Größe.');
    const rotation = normalizeRotation(page.getRotation().angle);
    const swap = rotation === 90 || rotation === 270;
    pages.push({ width: swap ? box[3] : box[2], height: swap ? box[2] : box[3], rotation, crop: box });
  }
  if (removedActive) warnings.push('Aktive Inhalte (JavaScript, automatische Aktionen oder eingebettete Dateien) wurden entfernt.');

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  } catch {
    throw fail('pdf_corrupt', 'Das PDF ist beschädigt und kann nicht verarbeitet werden.');
  }

  // Unabhängige Gegenprobe mit pdf.js – derselben Engine, die im Browser anzeigt.
  const { text, items } = await extractText(bytes, pages);
  return { bytes, pages, warnings, text, textItems: items };
}

let pdfjsPromise: Promise<any> | null = null;
export function pdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function extractText(bytes: Buffer | Uint8Array, pages: PageInfo[]): Promise<{ text: string[]; items: TextItem[][] }> {
  const lib = await pdfjs();
  let task: any;
  try {
    task = lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
    const pdf = await task.promise;
    const text: string[] = [];
    const items: TextItem[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const info = pages[i - 1];
      if (info && (Math.abs(vp.width - info.width) > 0.5 || Math.abs(vp.height - info.height) > 0.5)) {
        throw fail('pdf_geometry', 'Seitengeometrie des PDFs ist widersprüchlich.');
      }
      const tc = await page.getTextContent();
      const pageItems: TextItem[] = [];
      let s = '';
      for (const it of tc.items as any[]) {
        if (!it.str) continue;
        s += it.str + (it.hasEOL ? '\n' : ' ');
        const [a, b, , , e, f] = lib.Util.transform(vp.transform, it.transform);
        const fontH = Math.hypot(a, b) || 10;
        pageItems.push({ str: it.str, x: e / vp.width, y: (f - fontH) / vp.height, w: (it.width * (vp.scale ?? 1)) / vp.width, h: fontH / vp.height });
      }
      text.push(s.slice(0, 20000));
      items.push(pageItems);
      page.cleanup();
    }
    await pdf.cleanup?.();
    return { text, items };
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (process.env.PARAPH_DEBUG_PDF) console.error(e);
    throw fail('pdf_unreadable', 'Das PDF kann nicht dargestellt werden.');
  } finally {
    try { await task?.destroy(); } catch {}
  }
}

// Hilfsexporte für Tests
export { PDFRef, PDFStream, PDFRawStream };
