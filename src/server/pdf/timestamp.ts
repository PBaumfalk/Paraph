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
  /** true = Kette zu einem konfigurierten Vertrauensanker (TSA_CA_FILE) geprüft; null = nicht geprüft (kein Anker eingerichtet) */
  chainTrusted: boolean | null;
}

let trustAnchors: pkijs.Certificate[] | null = null;
/** Vertrauensanker für Zeitstempeldienste (PEM-Bündel, z. B. Wurzel- und Zwischenzertifikate des Anbieters). */
export function setTsaTrustAnchors(pem: string | null) {
  if (!pem) {
    trustAnchors = null;
    return;
  }
  trustAnchors = [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/g)].map((m) => pkijs.Certificate.fromBER(new Uint8Array(Buffer.from(m[1].replace(/\s+/g, ''), 'base64'))));
  if (!trustAnchors.length) throw new Error('TSA_CA_FILE enthält kein Zertifikat');
}

/** Zertifikat der Signatur anhand der Signer-ID (IssuerAndSerialNumber oder SubjectKeyIdentifier). */
export function findSignerCert(sd: pkijs.SignedData): pkijs.Certificate | undefined {
  const certs = (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  const sid = sd.signerInfos[0]?.sid;
  if (!sid) return undefined;
  if (sid instanceof pkijs.IssuerAndSerialNumber) return certs.find((c) => c.serialNumber.isEqual(sid.serialNumber) && c.issuer.isEqual(sid.issuer));
  const want = Buffer.from((sid as asn1js.OctetString).valueBlock.valueHexView);
  return certs.find((c) => {
    const ski = c.extensions?.find((e) => e.extnID === '2.5.29.14')?.parsedValue as asn1js.OctetString | undefined;
    return !!ski && Buffer.from(ski.valueBlock.valueHexView).equals(want);
  });
}

/** Prüft das signierte Attribut signingCertificate (v1, SHA-1) bzw. signingCertificateV2 (Standard SHA-256) gegen das Zertifikat. */
export function essCertBound(si: pkijs.SignerInfo, cert: pkijs.Certificate): boolean {
  const der = Buffer.from(cert.toSchema(true).toBER(false));
  for (const a of si.signedAttrs?.attributes ?? []) {
    const v2 = a.type === '1.2.840.113549.1.9.16.2.47';
    if (!v2 && a.type !== '1.2.840.113549.1.9.16.2.12') continue;
    try {
      const certsSeq = (a.values[0] as asn1js.Sequence).valueBlock.value[0] as asn1js.Sequence;
      const first = certsSeq.valueBlock.value[0] as asn1js.Sequence;
      const parts = first.valueBlock.value;
      let alg = v2 ? 'sha256' : 'sha1';
      let hashEl: any = parts[0];
      if (v2 && parts[0] instanceof asn1js.Sequence) {
        const oid = (parts[0].valueBlock.value[0] as asn1js.ObjectIdentifier).valueBlock.toString();
        alg = { '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512' }[oid] ?? '';
        hashEl = parts[1];
      }
      if (!alg || !(hashEl instanceof asn1js.OctetString)) return false;
      return Buffer.from(hashEl.valueBlock.valueHexView).equals(createHash(alg).update(der).digest());
    } catch {
      return false;
    }
  }
  return false;
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
  // Unterzeichnendes Zertifikat über die Signer-ID bestimmen (nie „das erste in der Liste“)
  const si = sd.signerInfos[0];
  const signer = findSignerCert(sd);
  if (!signer) throw new Error('Zeitstempel: unterzeichnendes Zertifikat nicht enthalten');
  // ESS-Bindung (RFC 3161/5816): Die Signatur nennt den Hash ihres Zertifikats – kein Austausch des Zertifikats möglich
  if (!essCertBound(si, signer)) throw new Error('Zeitstempel: Zertifikat nicht an die Signatur gebunden (ESS signingCertificate fehlt oder passt nicht)');
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
  // Vertrauenskette: Ohne Anker ist nur belegt, DASS ein Dienst gestempelt hat – nicht, WELCHER vertrauenswürdige
  let chainTrusted: boolean | null = null;
  if (trustAnchors) {
    const engine = new pkijs.CertificateChainValidationEngine({ trustedCerts: trustAnchors, certs: [signer, ...certs.filter((c) => c !== signer)], checkDate: tst.genTime });
    const r = await engine.verify().catch(() => ({ result: false }) as any);
    chainTrusted = !!r.result;
  }
  return {
    chainTrusted,
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
  if (info.chainTrusted === false) throw new Error(`Zeitstempeldienst nicht vertrauenswürdig (Kette passt nicht zu TSA_CA_FILE): ${info.tsaSubject}`);
  return { token: resp.timeStampToken, info };
}

export function sha256(data: Uint8Array | Buffer): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}
