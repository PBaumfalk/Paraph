// Schutz vor Server-Side Request Forgery für ausgehende Webhooks.
// Die Zieladresse wird aufgelöst, geprüft und die Verbindung auf genau diese IP festgelegt
// (kein zweites DNS-Lookup → kein DNS-Rebinding).
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { Agent } from 'undici';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, prefix, 'ipv6');

export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return blocked.check(ip, 'ipv4');
  if (fam === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

export interface SsrfPolicy {
  allowPrivate: boolean;
  allowHosts: string[];
}

export class SsrfError extends Error {}

export function checkUrlShape(raw: string, policy: SsrfPolicy): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError('Ungültige URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SsrfError('Nur http(s) ist erlaubt');
  if (u.username || u.password) throw new SsrfError('Zugangsdaten in der URL sind nicht erlaubt');
  if (u.protocol === 'http:' && !policy.allowPrivate && !policy.allowHosts.includes(u.hostname.toLowerCase())) {
    throw new SsrfError('Nur HTTPS ist erlaubt (Ausnahme: freigegebene interne Hosts)');
  }
  return u;
}

export async function resolveSafe(u: URL, policy: SsrfPolicy): Promise<{ address: string; family: number }> {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const allowed = policy.allowPrivate || policy.allowHosts.includes(host.toLowerCase());
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0) throw new SsrfError('Host nicht auflösbar');
  for (const a of addrs) {
    if (!allowed && isPrivateAddress(a.address)) throw new SsrfError(`Ziel ${host} zeigt auf eine interne Adresse (${a.address})`);
  }
  return addrs[0];
}

/** fetch mit festgelegter Ziel-IP, ohne Weiterleitungen, mit Zeitlimit. */
export async function safeFetch(raw: string, init: { method: string; headers: Record<string, string>; body: string }, policy: SsrfPolicy) {
  const u = checkUrlShape(raw, policy);
  const target = await resolveSafe(u, policy);
  const dispatcher = new Agent({
    connect: {
      lookup: (_h: string, _o: any, cb: any) => cb(null, [{ address: target.address, family: target.family }]),
      timeout: 10_000,
    },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  try {
    const { fetch } = await import('undici');
    const res = await fetch(u, { ...init, redirect: 'manual', dispatcher, signal: AbortSignal.timeout(15_000) });
    const text = (await res.text()).slice(0, 1024);
    return { status: res.status, body: text };
  } finally {
    await dispatcher.close().catch(() => {});
  }
}
