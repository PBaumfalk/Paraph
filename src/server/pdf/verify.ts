// Unabhängige Prüfung eingebetteter PDF-Signaturen (PAdES/CAdES detached).
// Prüft: ByteRange deckt die Datei bis auf den Signaturwert vollständig ab, Hash stimmt, CMS-Signatur gültig.
import { webcrypto, createHash } from 'node:crypto';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';
import { sha256, verifyTimestampToken, findSignerCert, essCertBound } from './timestamp.js';

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto as any }) as any);

export interface SigCheck {
  index: number;
  subfilter: string;
  coversWholeFile: boolean;
  digestOk: boolean;
  signatureOk: boolean;
  signerSubject: string;
  certSha256: string;
  signedAt: string | null;
  timestamp: string | null;
  timestampOk: boolean | null; // null = kein Zeitstempel vorhanden
  timestampAuthority?: string;
  timestampTrusted?: boolean | null;
  timestampError?: string;
  /** Der Bereich für den Signaturwert enthält ausschließlich Hex-Zeichen in spitzen Klammern */
  contentsOk: boolean;
  error?: string;
}

export async function verifyPdfSignatures(pdf: Buffer): Promise<SigCheck[]> {
  const out: SigCheck[] = [];
  const text = pdf.toString('latin1');
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(text))) {
    index++;
    const [a, b, c, d] = m.slice(1).map(Number);
    const check: SigCheck = { index, subfilter: '', coversWholeFile: false, digestOk: false, signatureOk: false, signerSubject: '', certSha256: '', signedAt: null, timestamp: null, timestampOk: null, contentsOk: false };
    try {
      if (a !== 0 || b <= 0 || c <= b || c + d > pdf.length) throw new Error('Ungültige ByteRange');
      check.coversWholeFile = c + d === pdf.length;
      // Nicht abgedeckter Bereich darf nur den Signaturwert enthalten (sonst ließen sich dort Daten verstecken)
      const gap = pdf.subarray(b, c).toString('latin1');
      check.contentsOk = /^<[0-9A-Fa-f]*>$/.test(gap);
      const hex = pdf.subarray(b + 1, c - 1).toString('latin1').replace(/0+$/, '');
      const der = Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex');
      const sf = /\/SubFilter\s*\/([A-Za-z.]+)/.exec(text.slice(Math.max(0, m.index - 2000), m.index + 2000));
      check.subfilter = sf?.[1] ?? '';
      const signedData = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
      const ci = pkijs.ContentInfo.fromBER(der);
      const sd = new pkijs.SignedData({ schema: ci.content });
      const si = sd.signerInfos[0];
      const md = si.signedAttrs?.attributes.find((x) => x.type === '1.2.840.113549.1.9.4');
      const digest = createHash('sha256').update(signedData).digest();
      check.digestOk = !!md && Buffer.from((md.values[0] as asn1js.OctetString).valueBlock.valueHexView).equals(digest);
      // Zertifikat über die Signer-ID bestimmen und per ESS an die Signatur gebunden prüfen – ein vorangestelltes
      // fremdes (z. B. das öffentliche Instanz-)Zertifikat darf das Ergebnis nicht beeinflussen
      const cert = findSignerCert(sd);
      check.signatureOk = !!cert && essCertBound(si, cert) && (await sd.verify({ signer: 0, data: new Uint8Array(signedData).buffer, checkChain: false }).catch(() => false));
      if (cert) {
        check.signerSubject = cert.subject.typesAndValues.map((t) => String(t.value.valueBlock.value)).join(', ');
        check.certSha256 = createHash('sha256').update(Buffer.from(cert.toSchema(true).toBER(false))).digest('hex');
      }
      const mm = /\/M\s*\(D:(\d{14})/.exec(text.slice(Math.max(0, m.index - 3000), m.index + 3000));
      if (mm) check.signedAt = `${mm[1].slice(0, 4)}-${mm[1].slice(4, 6)}-${mm[1].slice(6, 8)}T${mm[1].slice(8, 10)}:${mm[1].slice(10, 12)}:${mm[1].slice(12, 14)}Z`;
      const ts = si.unsignedAttrs?.attributes.find((x) => x.type === '1.2.840.113549.1.9.16.2.14');
      if (ts) {
        // Zeitstempel nur als gültig ausweisen, wenn TSA-Signatur und Imprint (Hash des Signaturwerts) stimmen
        check.timestampOk = false;
        try {
          const info = await verifyTimestampToken(new pkijs.ContentInfo({ schema: ts.values[0] }), sha256(si.signature.valueBlock.valueHexView));
          check.timestamp = info.genTime;
          check.timestampAuthority = info.tsaSubject;
          check.timestampTrusted = info.chainTrusted;
          check.timestampOk = true;
        } catch (e: any) {
          check.timestampError = String(e?.message ?? e);
        }
      }
    } catch (e: any) {
      check.error = String(e?.message ?? e);
    }
    out.push(check);
  }
  return out;
}
