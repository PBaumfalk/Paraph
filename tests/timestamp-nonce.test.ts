// Regression: Die Nonce einer Zeitstempelanfrage muss eine minimal kodierte, positive DER-Ganzzahl sein.
// Mit führendem 0x00 (vorher etwa jede 256. Anfrage) lehnt `openssl ts -reply` – und damit z. B. FreeTSA –
// die Anfrage mit Status 2 ab; Siegel und Anker blieben dann ohne Zeitstempel.
import { describe, it, expect } from 'vitest';
import { timestampNonce } from '../src/server/pdf/timestamp.js';

describe('timestampNonce', () => {
  it('ist immer 8 Byte, positiv und ohne führende Null', () => {
    for (let i = 0; i < 5000; i++) {
      const n = timestampNonce();
      expect(n.length).toBe(8);
      expect(n[0]).toBeGreaterThanOrEqual(0x40);
      expect(n[0]).toBeLessThanOrEqual(0x7f);
    }
  });
});
