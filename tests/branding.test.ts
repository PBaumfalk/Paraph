// Standardfarbe der Kanzlei: Petrol seit dem Redesign; der alte Indigo-Standard gilt als „nie geändert“.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, setupAdmin, type TestServer } from './helpers/server.js';
import { getOrg, DEFAULT_ACCENT } from '../src/server/domain/orgs.js';

let s: TestServer;
let orgId: string;
beforeAll(async () => {
  s = await startTestServer();
  await setupAdmin(s);
  orgId = (s.ctx.db.prepare('SELECT id FROM orgs LIMIT 1').get() as any).id;
});
afterAll(async () => s.close());

const setBranding = (b: object) => s.ctx.db.prepare('UPDATE orgs SET branding = ? WHERE id = ?').run(JSON.stringify(b), orgId);

describe('Kanzleifarbe', () => {
  it('ohne gespeicherte Farbe gilt Petrol', () => {
    setBranding({});
    expect(getOrg(s.ctx, orgId).branding.accent).toBe(DEFAULT_ACCENT);
    expect(DEFAULT_ACCENT).toBe('#0D5C63');
  });
  it('der alte Standard (Indigo) folgt dem neuen Standard, in jeder Schreibweise', () => {
    for (const a of ['#3D5AFE', '#3d5afe']) {
      setBranding({ accent: a, senderName: 'Kanzlei' });
      const b = getOrg(s.ctx, orgId).branding;
      expect(b.accent).toBe(DEFAULT_ACCENT);
      expect(b.senderName).toBe('Kanzlei');
    }
  });
  it('eine bewusst gewählte Farbe bleibt unverändert', () => {
    setBranding({ accent: '#7A1F3D' });
    expect(getOrg(s.ctx, orgId).branding.accent).toBe('#7A1F3D');
  });
});
