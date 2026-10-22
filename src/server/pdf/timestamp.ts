// RFC-3161-Zeitstempel: Anfordern und vollständig prüfen.
// Ein Zeitstempel zählt nur, wenn (1) die Signatur des Zeitstempeldienstes gültig ist, (2) der Imprint
// genau den erwarteten Hash enthält und (3) – bei eigener Anfrage – die Nonce übereinstimmt.
// Ohne diese Prüfung könnte ein beliebiger Server eine beliebige Zeit „bestätigen“.
import { webcrypto, randomBytes, createHash } from 'node:crypto';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

const crypto = webcrypto as unknown as Crypto;
pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto }) as any);

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const KP_TIMESTAMPING = '1.3.6.1.5.5.7.3.8';

export interface TimestampInfo {
  genTime: string;
  tsaSubject: string;
  tsaCertSha256: string;
  serial: string;
  policy: string;
}

function subjectOf(cert: pkijs.Certificate) {
  return cert.subject.typesAndValues.map((t) => String(t.value.valueBlock.value)).join(', ');
}

/** Prüft ein Zeitstempel-Token (ContentInfo/SignedData mit TSTInfo) gegen den erwarteten SHA-256-Wert. */
export async function verifyTimestampToken(token: pkijs.ContentInfo, expectedDigest: Uint8Array, expectedNonce?: Uint8Array): Promise<TimestampInfo> {
  if (token.contentType !== '1.2.840.113549.1.7.2') throw new Error('Zeitstempel: kein SignedData');
  const sd = new pkijs.SignedData({ schema: token.content });
  const eContent = sd.encapContentInfo.eContent;
  if (sd.encapContentInfo.eContentType !== '1.2.840.113549.1.9.16.1.4' || !eContent) throw new Error('Zeitstempel: kein TSTInfo');
  const tst = pkijs.TSTInfo.fromBER(eContent.getValue());
  if (tst.messageImprint.hashAlgorithm.algorithmId !== SHA256_OID) throw new Error('Zeitstempel: unerwarteter Hash-Algorithmus');
  const imprint = Buffer.from(tst.messageImprint.hashedMessage.valueBlock.valueHexView);
  if (!imprint.equals(Buffer.from(expectedDigest))) throw new Error('Zeitstempel: Imprint passt nicht zu den gestempelten Daten');
  if (expectedNonce) {
    const n = tst.nonce ? Buffer.from(tst.nonce.valueBlock.valueHexView) : null;
    if (!n || !stripZeros(n).equals(stripZeros(Buffer.from(expectedNonce)))) throw new Error('Zeitstempel: Nonce passt nicht (Antwort gehört nicht zu dieser Anfrage)');
  }
  const certs = (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  if (!certs.length) throw new Error('Zeitstempel: Zertifikat des Zeitstempeldienstes fehlt');
  // Unterzeichnendes Zertifikat bestimmen
  const si = sd.signerInfos[0];
  const sid = si.sid;
  const signer =
    sid instanceof pkijs.IssuerAndSerialNumber
      ? certs.find((c) => c.serialNumber.isEqual(sid.serialNumber) && c.issuer.isEqual(sid.issuer))
      : certs.find((c) => {
          const ski = c.extensions?.find((e) => e.extnID === '2.5.29.14')?.parsedValue as asn1js.OctetString | undefined;
          return ski && Buffer.from(ski.valueBlock.valueHexView).equals(Buffer.from((sid as asn1js.OctetString).valueBlock.valueHexView));
        });
  if (!signer) throw new Error('Zeitstempel: unterzeichnendes Zertifikat nicht enthalten');
  // Signatur selbst prüfen (pkijs verlangt bei TSTInfo die Originaldaten, die wir bewusst nur als Hash kennen):
  // 1. messageDigest-Attribut = Hash des TSTInfo, 2. Signatur über die signierten Attribute (als SET kodiert).
  if (!si.signedAttrs) throw new Error('Zeitstempel: signierte Attribute fehlen');
  const engine = pkijs.getEngine().crypto as any;
  const digestAlg = engine.getAlgorithmByOID(si.digestAlgorithm.algorithmId, true, 'digestAlgorithm');
  const md = si.signedAttrs.attributes.find((a) => a.type === '1.2.840.113549.1.9.4');
  const contentDigest = Buffer.from(await crypto.subtle.digest(digestAlg.name, new Uint8Array(eContent.getValue())));
  if (!md || !Buffer.from((md.values[0] as asn1js.OctetString).valueBlock.valueHexView).equals(contentDigest)) throw new Error('Zeitstempel: Inhalt passt nicht zur Signatur');
  const attrs = new Uint8Array(si.signedAttrs.encodedValue);
  attrs[0] = 0x31;
  const ok = await engine.verifyWithPublicKey(attrs.buffer, si.signature, signer.subjectPublicKeyInfo, si.signatureAlgorithm, digestAlg.name).catch(() => false);
  if (!ok) throw new Error('Zeitstempel: Signatur des Zeitstempeldienstes ungültig');
  const eku = signer.extensions?.find((e) => e.extnID === '2.5.29.37');
  if (eku && !(eku.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes?.includes(KP_TIMESTAMPING)) {
    throw new Error('Zeitstempel: Zertifikat ist nicht für Zeitstempel bestimmt');
  }
  return {
    genTime: tst.genTime.toISOString(),
    tsaSubject: subjectOf(signer),
    tsaCertSha256: createHash('sha256').update(Buffer.from(signer.toSchema(true).toBER(false))).digest('hex'),
    serial: Buffer.from(tst.serialNumber.valueBlock.valueHexView).toString('hex'),
    policy: tst.policy,
  };
}

function stripZeros(b: Buffer) {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.subarray(i);
}

/** Fordert einen Zeitstempel über einen bereits berechneten SHA-256-Wert an und prüft die Antwort vollständig. */
export async function requestTimestamp(tsaUrl: string, digest: Uint8Array): Promise<{ token: pkijs.ContentInfo; info: TimestampInfo }> {
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f;
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256_OID }),
      hashedMessage: new asn1js.OctetString({ valueHex: new Uint8Array(digest).buffer }),
    }),
    nonce: new asn1js.Integer({ valueHex: new Uint8Array(nonce).buffer }),
    certReq: true,
  });
  const res = await fetch(tsaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: Buffer.from(req.toSchema().toBER(false)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Zeitstempeldienst antwortet mit HTTP ${res.status}`);
  const resp = pkijs.TimeStampResp.fromBER(await res.arrayBuffer());
  if (resp.status.status !== 0 && resp.status.status !== 1) throw new Error(`Zeitstempel abgelehnt (Status ${resp.status.status})`);
  if (!resp.timeStampToken) throw new Error('Zeitstempel fehlt in der Antwort');
  const info = await verifyTimestampToken(resp.timeStampToken, digest, nonce);
  return { token: resp.timeStampToken, info };
}

export function sha256(data: Uint8Array | Buffer): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}
