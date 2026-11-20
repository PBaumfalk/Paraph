// Regression: Der Signaturwert im /Contents-Platzhalter ist mit Nullen aufgefüllt. Endet die DER-Struktur selbst
// auf 0x00 (bei zufälligen Signaturbytes etwa jedes 256. Siegel), durfte die Prüfung dieses Byte nicht abschneiden –
// sonst meldete „Siegel prüfen“ ein unverändertes Dokument als ungültig.
import { describe, it, expect } from 'vitest';
import { derFromContents } from '../src/server/pdf/verify.js';

const pad = (der: Buffer, total = 64) => der.toString('hex') + '0'.repeat(total * 2 - der.length * 2);

describe('derFromContents', () => {
  it('behält ein abschließendes Null-Byte (kurze Länge)', () => {
    const der = Buffer.from([0x30, 0x04, 0x02, 0x02, 0x10, 0x00]);
    expect(derFromContents(pad(der))).toEqual(der);
  });
  it('behält abschließende Nullen bei langer Längenangabe (0x82)', () => {
    const body = Buffer.alloc(300, 0xab);
    body[298] = 0x00;
    body[299] = 0x00;
    const der = Buffer.concat([Buffer.from([0x30, 0x82, 0x01, 0x2c]), body]);
    expect(derFromContents(pad(der, 400))).toEqual(der);
  });
  it('liefert ohne Auffüllung genau die Eingabe', () => {
    const der = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x05]);
    expect(derFromContents(der.toString('hex'))).toEqual(der);
  });
});
