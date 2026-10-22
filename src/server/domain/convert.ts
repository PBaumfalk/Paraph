// Umwandlung von Office-Dokumenten (DOCX, DOC, ODT, RTF) in PDF über Gotenberg/LibreOffice.
// Die Umwandlung läuft bewusst in einem getrennten Container ohne Zugriff auf Paraph-Daten:
// schädliche Office-Dateien treffen nur auf eine isolierte, zustandslose LibreOffice-Instanz.
import type { Ctx } from '../context.js';
import { AppError } from '../lib/errors.js';

const OFFICE_EXT = ['docx', 'doc', 'odt', 'rtf'];

export function isOfficeFile(name: string, bytes: Buffer): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return false;
  return OFFICE_EXT.includes(ext);
}

export async function convertOffice(ctx: Ctx, name: string, bytes: Buffer): Promise<Buffer> {
  if (!ctx.cfg.gotenbergUrl) {
    throw new AppError(422, 'conversion_unavailable', 'Word- und ODT-Dateien können auf dieser Instanz nicht umgewandelt werden (GOTENBERG_URL fehlt). Bitte als PDF hochladen.');
  }
  const ext = name.toLowerCase().split('.').pop()!;
  const magic = bytes.subarray(0, 4).toString('latin1');
  const okMagic = ext === 'rtf' ? bytes.subarray(0, 5).toString('latin1') === '{\\rtf' : ext === 'doc' ? bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) : magic === 'PK\u0003\u0004';
  if (!okMagic) throw new AppError(422, 'file_type_mismatch', 'Dateiinhalt passt nicht zur Dateiendung.');
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)]), `document.${ext}`);
  let res: Response;
  try {
    res = await fetch(`${ctx.cfg.gotenbergUrl.replace(/\/$/, '')}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e: any) {
    throw new AppError(502, 'conversion_failed', 'Der Umwandlungsdienst ist nicht erreichbar.');
  }
  if (!res.ok) {
    throw new AppError(422, 'conversion_failed', 'Das Dokument konnte nicht in PDF umgewandelt werden. Ist es beschädigt oder passwortgeschützt?');
  }
  const out = Buffer.from(await res.arrayBuffer());
  if (out.subarray(0, 5).toString('latin1') !== '%PDF-') throw new AppError(422, 'conversion_failed', 'Die Umwandlung lieferte kein PDF.');
  return out;
}
