// FreeTSA als Voreinstellung von install.sh: mitgeliefertes Wurzelzertifikat und (optional) echte Gegenstelle.
// Der Live-Test kontaktiert freetsa.org und läuft nur mit PARAPH_LIVE_TSA=1.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { requestTimestamp, setTsaTrustAnchors, sha256 } from '../src/server/pdf/timestamp.js';
import { generateSealKey, importSealKey, sealPdf } from '../src/server/pdf/seal.js';
import { verifyPdfSignatures } from '../src/server/pdf/verify.js';
import { makePdf } from './helpers/pdfs.js';

const PEM = readFileSync(new URL('../docker/tsa/freetsa-root-ca.pem', import.meta.url), 'utf8');
// Derselbe Wert steht in scripts/install.sh
const FINGERPRINT = 'a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc';

afterAll(() => setTsaTrustAnchors(null));

describe('FreeTSA', () => {
  it('mitgeliefertes Wurzelzertifikat hat den hinterlegten Fingerabdruck und ist eine CA', () => {
    const cert = new X509Certificate(PEM);
    expect(cert.fingerprint256.replace(/:/g, '').toLowerCase()).toBe(FINGERPRINT);
    expect(cert.ca).toBe(true);
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.parse('2040-01-01'));
    expect(() => setTsaTrustAnchors(PEM)).not.toThrow();
  });

  it.runIf(process.env.PARAPH_LIVE_TSA === '1')('echter Zeitstempel von freetsa.org: Signatur, Nonce und Kette zum Wurzelzertifikat geprüft', async () => {
    setTsaTrustAnchors(PEM);
    const { info } = await requestTimestamp('https://freetsa.org/tsr', sha256(Buffer.from('paraph-live ' + Date.now())));
    expect(info.chainTrusted).toBe(true);
    expect(info.tsaSubject).toContain('Free TSA');
    expect(Math.abs(Date.parse(info.genTime) - Date.now())).toBeLessThan(120_000);
  });

  it.runIf(process.env.PARAPH_LIVE_TSA === '1')('Plattformsiegel mit FreeTSA-Zeitstempel (PAdES-B-T), Prüfstelle bestätigt den Zeitstempel', async () => {
    setTsaTrustAnchors(PEM);
    const m = await generateSealKey('Kanzlei Test');
    const key = await importSealKey(m.pkcs8, m.certChainDer);
    const r = await sealPdf(await makePdf(), key, { reason: 'Test', name: 'Paraph', tsaUrl: 'https://freetsa.org/tsr' });
    expect(r.timestampError).toBeUndefined();
    expect(r.timestamped).toBe(true);
    const sigs = await verifyPdfSignatures(r.pdf);
    expect(sigs[0]).toMatchObject({ signatureOk: true, digestOk: true, coversWholeFile: true, timestampOk: true });
    expect(sigs[0].timestampAuthority).toContain('Free TSA');
  });
});
