// pdf.js im Browser: Dokumente laden und Seiten scharf rendern (Retina), ohne Skriptausführung.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = pdfjs.PDFDocumentProxy;

const cache = new Map<string, Promise<PdfDoc>>();

export function loadPdf(key: string, getBytes: () => Promise<Uint8Array>): Promise<PdfDoc> {
  if (!cache.has(key)) {
    const p = getBytes().then((data) => pdfjs.getDocument({ data, enableXfa: false }).promise);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

export function forgetPdf(key: string) {
  const p = cache.get(key);
  cache.delete(key);
  p?.then((d) => d.loadingTask.destroy()).catch(() => {});
}

export async function renderPage(doc: PdfDoc, pageIndex: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const scale = (cssWidth / base.width) * dpr;
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * base.height) / base.width}px`;
  const ctx = canvas.getContext('2d')!;
  const task = page.render({ canvasContext: ctx, viewport: vp, canvas } as any);
  await task.promise;
  return task;
}

/** SHA-256 lokal im Browser (WebCrypto) – die Datei verlässt das Gerät nicht. */
export async function sha256File(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
