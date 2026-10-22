import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, hkdfSync, timingSafeEqual, randomInt } from 'node:crypto';

export function id(prefix: string): string {
  // 128 Bit Zufall, URL-sicher
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

/** Nicht erratbares Geheimnis (256 Bit). Gespeichert wird nur sein Hash. */
export function secretToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update('paraph-token:' + token).digest('hex');
}

export function hmacHex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function numericCode(digits = 6): string {
  let s = '';
  for (let i = 0; i < digits; i++) s += String(randomInt(0, 10));
  return s;
}

/** Leitet aus dem Hauptschlüssel zweckgebundene Teilschlüssel ab (HKDF-SHA256). */
export function deriveKey(master: Buffer, purpose: string, salt = ''): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.from(salt), Buffer.from('paraph:' + purpose), 32));
}

const MAGIC = Buffer.from('PRPH1');

/** AES-256-GCM. Format: MAGIC | IV(12) | TAG(16) | Ciphertext. aad bindet den Kontext (z. B. Blob-ID). */
export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

export function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
  if (sealed.length < MAGIC.length + 28 || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Unbekanntes Verschlüsselungsformat');
  }
  const iv = sealed.subarray(5, 17);
  const tag = sealed.subarray(17, 33);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(sealed.subarray(33)), d.final()]);
}

export function sealString(key: Buffer, s: string, aad: string): string {
  return seal(key, Buffer.from(s, 'utf8'), aad).toString('base64');
}
export function openString(key: Buffer, s: string, aad: string): string {
  return open(key, Buffer.from(s, 'base64'), aad).toString('utf8');
}

/** Kanonisches JSON (sortierte Schlüssel) für reproduzierbare Hashes. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}
