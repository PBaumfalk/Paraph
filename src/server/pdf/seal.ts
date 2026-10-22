// Technisches Plattformsiegel nach PAdES (ETSI.CAdES.detached, Baseline B-B; mit Zeitstempeldienst B-T).
// WICHTIG: Dies ist ein Integritätssiegel der Plattform-Instanz, keine personenbezogene Signatur der
// Unterzeichner und – mit selbst erzeugtem Zertifikat – weder fortgeschrittenes noch qualifiziertes Siegel.
import { webcrypto, randomBytes, createHash } from 'node:crypto';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';
import { requestTimestamp, sha256, type TimestampInfo } from './timestamp.js';
import { PDFDocument, PDFName, PDFNumber, PDFHexString, PDFString, PDFArray, PDFDict } from 'pdf-lib';

const crypto = webcrypto as unknown as Crypto;
pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto }) as any);

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertV2: '1.2.840.113549.1.9.16.2.47',
  sigTimeStamp: '1.2.840.113549.1.9.16.2.14',
  cn: '2.5.4.3',
  o: '2.5.4.10',
  c: '2.5.4.6',
};

export interface SealKey {
  privateKey: CryptoKey;
  certs: pkijs.Certificate[]; // [0] = Siegelzertifikat
}

export interface GeneratedKeyMaterial {
  pkcs8: Buffer;
  certChainDer: Buffer[];
}

function name(cn: string, org: string) {
  const n = new pkijs.RelativeDistinguishedNames();
  n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: OID.cn, value: new asn1js.Utf8String({ value: cn }) }));
  n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: OID.o, value: new asn1js.Utf8String({ value: org }) }));
  return n;
}

/** Erzeugt Schlüssel und selbst signiertes Siegelzertifikat für eine Instanz. */
export async function generateSealKey(org: string, cn = 'Paraph Plattformsiegel'): Promise<GeneratedKeyMaterial> {
  const keys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const cert = new pkijs.Certificate();
  cert.version = 2;
  const serial = randomBytes(16);
  serial[0] &= 0x7f;
  cert.serialNumber = new asn1js.Integer({ valueHex: serial });
  cert.issuer = name(cn, org);
  cert.subject = name(cn, org);
  const now = new Date();
  cert.notBefore.value = new Date(now.getTime() - 60_000);
  cert.notAfter.value = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365 * 15);
  cert.extensions = [
    new pkijs.Extension({ extnID: '2.5.29.19', critical: true, extnValue: new pkijs.BasicConstraints({ cA: false }).toSchema().toBER(false) }),
    new pkijs.Extension({
      extnID: '2.5.29.15',
      critical: true,
      extnValue: new asn1js.BitString({ valueHex: new Uint8Array([0xc0]).buffer, unusedBits: 6 }).toBER(false),
    }),
  ];
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, 'SHA-256');
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  return { pkcs8, certChainDer: [Buffer.from(cert.toSchema(true).toBER(false))] };
}

export async function importSealKey(pkcs8: Buffer, chain: Buffer[]): Promise<SealKey> {
  const privateKey = await crypto.subtle.importKey('pkcs8', new Uint8Array(pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const certs = chain.map((der) => pkijs.Certificate.fromBER(der));
  return { privateKey, certs };
}

export function certInfo(cert: pkijs.Certificate) {
  const der = Buffer.from(cert.toSchema(true).toBER(false));
  const subject = cert.subject.typesAndValues.map((t) => `${t.type === OID.cn ? 'CN' : t.type === OID.o ? 'O' : t.type}=${t.value.valueBlock.value}`).join(', ');
  return {
    subject,
    serial: Buffer.from(cert.serialNumber.valueBlock.valueHexView).toString('hex'),
    notAfter: cert.notAfter.value.toISOString(),
    sha256: createHash('sha256').update(der).digest('hex'),
    pem: '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '') + '\n-----END CERTIFICATE-----\n',
  };
}

export interface CmsResult {
  der: Buffer;
  timestamped: boolean;
  timestampError?: string;
  timestamp?: TimestampInfo;
}

/** Erzeugt eine abgesetzte CMS-Signatur (CAdES-BES-Profil) über die übergebenen Daten. */
export async function cmsSignDetached(key: SealKey, data: Buffer, tsaUrl?: string): Promise<CmsResult> {
  const cert = key.certs[0];
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  const certHash = await crypto.subtle.digest('SHA-256', cert.toSchema(true).toBER(false));
  const signingCertV2 = new asn1js.Sequence({
    value: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [new asn1js.OctetString({ valueHex: certHash })] })] })],
  });
  const signedData = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID.data }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new pkijs.Attribute({ type: OID.contentType, values: [new asn1js.ObjectIdentifier({ value: OID.data })] }),
            new pkijs.Attribute({ type: OID.messageDigest, values: [new asn1js.OctetString({ valueHex: digest })] }),
            new pkijs.Attribute({ type: OID.signingCertV2, values: [signingCertV2] }),
          ],
        }),
      }),
    ],
    certificates: key.certs,
  });
  await signedData.sign(key.privateKey, 0, 'SHA-256');

  let timestamped = false;
  let timestampError: string | undefined;
  let timestamp: TimestampInfo | undefined;
  if (tsaUrl) {
    try {
      // Signaturzeitstempel (CAdES): gestempelt wird der Signaturwert; die Antwort wird vollständig geprüft
      const sigValue = signedData.signerInfos[0].signature.valueBlock.valueHexView;
      const ts = await requestTimestamp(tsaUrl, sha256(sigValue));
      signedData.signerInfos[0].unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({
        type: 1,
        attributes: [new pkijs.Attribute({ type: OID.sigTimeStamp, values: [ts.token.toSchema()] })],
      });
      timestamped = true;
      timestamp = ts.info;
    } catch (e: any) {
      timestampError = String(e?.message ?? e);
    }
  }
  const ci = new pkijs.ContentInfo({ contentType: OID.signedData, content: signedData.toSchema(true) });
  return { der: Buffer.from(ci.toSchema().toBER(false)), timestamped, timestampError, timestamp };
}

const SIG_BYTES = 24576;
const BR_PLACEHOLDER = 9999999999;

export interface SealResult {
  pdf: Buffer;
  timestamped: boolean;
  timestampError?: string;
  signedAt: string;
}

/** Versieht ein PDF mit einer unsichtbaren PAdES-Signatur der Plattform. */
export async function sealPdf(
  input: Uint8Array,
  key: SealKey,
  opts: { reason: string; location?: string; name: string; tsaUrl?: string; signedAt?: Date },
): Promise<SealResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const signedAt = opts.signedAt ?? new Date();
  const ctx = doc.context;
  const sigDict = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'ETSI.CAdES.detached',
    ByteRange: [0, BR_PLACEHOLDER, BR_PLACEHOLDER, BR_PLACEHOLDER],
    Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    Reason: PDFString.of(opts.reason),
    Name: PDFString.of(opts.name),
    M: PDFString.fromDate(signedAt),
    ...(opts.location ? { Location: PDFString.of(opts.location) } : {}),
  });
  const sigRef = ctx.register(sigDict);
  const page = doc.getPage(0);
  const widget = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: [0, 0, 0, 0],
    V: sigRef,
    T: PDFString.of(`Paraph-Siegel-${signedAt.getTime()}`),
    F: 132,
    P: page.ref,
  });
  const widgetRef = ctx.register(widget);
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of('Annots'), ctx.obj([widgetRef]));
  let acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acro) {
    acro = ctx.obj({ Fields: [] }) as PDFDict;
    doc.catalog.set(PDFName.of('AcroForm'), ctx.register(acro));
  }
  const fields = acro.lookupMaybe(PDFName.of('Fields'), PDFArray);
  if (fields) fields.push(widgetRef);
  else acro.set(PDFName.of('Fields'), ctx.obj([widgetRef]));
  acro.set(PDFName.of('SigFlags'), PDFNumber.of(3));

  const pdf = Buffer.from(await doc.save({ useObjectStreams: false, addDefaultPage: false }));

  // ByteRange und Contents-Platzhalter lokalisieren
  const brText = `/ByteRange [ 0 ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ]`;
  const brPos = pdf.indexOf(brText, 0, 'latin1');
  if (brPos < 0) throw new Error('ByteRange-Platzhalter nicht gefunden');
  const contentsMarker = '/Contents <';
  const cPos = pdf.indexOf(contentsMarker, brPos - SIG_BYTES * 2 - 4096 > 0 ? brPos - SIG_BYTES * 2 - 4096 : 0, 'latin1');
  let contentsStart = -1;
  // Den Contents-Eintrag im selben Signaturobjekt suchen (Platzhalter aus Nullen)
  for (let p = cPos; p >= 0; p = pdf.indexOf(contentsMarker, p + 1, 'latin1')) {
    const start = p + contentsMarker.length - 1; // Position von '<'
    if (pdf.subarray(start + 1, start + 1 + 64).toString('latin1') === '0'.repeat(64) && pdf[start + 1 + SIG_BYTES * 2] === 0x3e) {
      contentsStart = start;
      break;
    }
  }
  if (contentsStart < 0) throw new Error('Contents-Platzhalter nicht gefunden');
  const contentsEnd = contentsStart + SIG_BYTES * 2 + 2; // inkl. '<' und '>'
  const ranges = [0, contentsStart, contentsEnd, pdf.length - contentsEnd];
  let br = `/ByteRange [ ${ranges.join(' ')} ]`;
  if (br.length > brText.length) throw new Error('ByteRange zu lang');
  br = br.padEnd(brText.length, ' ');
  pdf.write(br, brPos, 'latin1');

  const signedBytes = Buffer.concat([pdf.subarray(0, contentsStart), pdf.subarray(contentsEnd)]);
  const cms = await cmsSignDetached(key, signedBytes, opts.tsaUrl);
  const hex = cms.der.toString('hex');
  if (hex.length > SIG_BYTES * 2) throw new Error('Signatur größer als der reservierte Platz');
  pdf.write(hex.padEnd(SIG_BYTES * 2, '0'), contentsStart + 1, 'latin1');
  return { pdf, timestamped: cms.timestamped, timestampError: cms.timestampError, signedAt: signedAt.toISOString() };
}
