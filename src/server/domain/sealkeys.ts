// Verwaltung des Plattformsiegels. Standard: einmalig erzeugter Instanzschlüssel (selbst signiert).
// Optional: eigenes Zertifikat einer Organisation (z. B. von einer CA) per Import.
import type { Ctx } from '../context.js';
import { id, openString, sealString } from '../lib/crypto.js';
import { generateSealKey, importSealKey, certInfo, type SealKey } from '../pdf/seal.js';
import * as pkijs from 'pkijs';

const cache = new Map<string, { key: SealKey; row: any }>();

export async function getSealKey(ctx: Ctx, orgId: string | null): Promise<{ key: SealKey; info: ReturnType<typeof certInfo>; source: string; keyId: string }> {
  let row = orgId ? (ctx.db.prepare('SELECT * FROM seal_keys WHERE org_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1').get(orgId) as any) : undefined;
  if (!row) row = ctx.db.prepare('SELECT * FROM seal_keys WHERE org_id IS NULL AND active = 1 ORDER BY created_at DESC LIMIT 1').get() as any;
  if (!row) {
    const material = await generateSealKey(new URL(ctx.cfg.appUrl).hostname || 'Paraph');
    const keyId = id('seal');
    ctx.db
      .prepare(`INSERT INTO seal_keys (id, org_id, label, key_enc, cert_chain, source, active, created_at) VALUES (?, NULL, ?, ?, ?, 'generated', 1, ?)`)
      .run(
        keyId,
        'Instanzsiegel (selbst signiert)',
        sealString(ctx.keys.secrets, material.pkcs8.toString('base64'), 'seal:' + keyId),
        JSON.stringify(material.certChainDer.map((b) => b.toString('base64'))),
        ctx.now().toISOString(),
      );
    row = ctx.db.prepare('SELECT * FROM seal_keys WHERE id = ?').get(keyId);
    ctx.log.info({ keyId }, 'Plattformsiegel erzeugt');
  }
  let c = cache.get(row.id);
  if (!c) {
    const pkcs8 = Buffer.from(openString(ctx.keys.secrets, row.key_enc, 'seal:' + row.id), 'base64');
    const chain = (JSON.parse(row.cert_chain) as string[]).map((b) => Buffer.from(b, 'base64'));
    c = { key: await importSealKey(pkcs8, chain), row };
    cache.set(row.id, c);
  }
  return { key: c.key, info: certInfo(c.key.certs[0]), source: row.source, keyId: row.id };
}

/** Import eines eigenen Siegelschlüssels (PKCS#8-DER/PEM + Zertifikatskette PEM). */
export async function importOrgSealKey(ctx: Ctx, orgId: string | null, keyPem: string, chainPem: string, label: string) {
  const der = (pem: string, tag: string) =>
    [...pem.matchAll(new RegExp(`-----BEGIN ${tag}-----([\\s\\S]+?)-----END ${tag}-----`, 'g'))].map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'base64'));
  const keyDer = der(keyPem, 'PRIVATE KEY')[0];
  const chain = der(chainPem, 'CERTIFICATE');
  if (!keyDer) throw new Error('Kein PKCS#8-Schlüssel („BEGIN PRIVATE KEY“) gefunden');
  if (!chain.length) throw new Error('Kein Zertifikat gefunden');
  const key = await importSealKey(keyDer, chain);
  // Prüfen, ob Schlüssel und Zertifikat zusammenpassen
  const probe = Buffer.from('paraph-probe');
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, probe);
  const pub = await key.certs[0].getPublicKey();
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub as CryptoKey, sig, probe);
  if (!ok) throw new Error('Schlüssel passt nicht zum Zertifikat');
  void pkijs;
  const keyId = id('seal');
  ctx.db.transaction(() => {
    ctx.db.prepare(`UPDATE seal_keys SET active = 0 WHERE ${orgId ? 'org_id = ?' : 'org_id IS NULL'}`).run(...(orgId ? [orgId] : []));
    ctx.db
      .prepare(`INSERT INTO seal_keys (id, org_id, label, key_enc, cert_chain, source, active, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', 1, ?)`)
      .run(keyId, orgId, label, sealString(ctx.keys.secrets, keyDer.toString('base64'), 'seal:' + keyId), JSON.stringify(chain.map((b) => b.toString('base64'))), ctx.now().toISOString());
  })();
  return certInfo(key.certs[0]);
}
