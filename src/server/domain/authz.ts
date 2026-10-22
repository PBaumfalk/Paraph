// Zentrales Berechtigungsmodell. Jede Datenabfrage ist an org_id gebunden;
// fremde oder nicht sichtbare Objekte werden als „nicht gefunden“ behandelt.
import { forbidden, notFound } from '../lib/errors.js';
import type { Actor } from './audit.js';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const SCOPES = [
  'envelopes:read',
  'envelopes:write',
  'templates:read',
  'templates:write',
  'webhooks:manage',
  'contacts:read',
] as const;
export type Scope = (typeof SCOPES)[number];

export type Principal =
  | { kind: 'user'; userId: string; orgId: string; role: Role; name: string; email: string; sessionId: string; instanceAdmin: boolean }
  | { kind: 'apikey'; keyId: string; orgId: string; scopes: Scope[]; mode: 'live' | 'test'; name: string; createdBy: string | null };

export type Permission =
  | 'envelope.read'
  | 'envelope.write'
  | 'template.read'
  | 'template.write'
  | 'org.manage'
  | 'members.manage'
  | 'webhooks.manage'
  | 'apikeys.manage'
  | 'contacts.read'
  | 'activity.read';

const ROLE_PERMS: Record<Role, Permission[]> = {
  owner: ['envelope.read', 'envelope.write', 'template.read', 'template.write', 'org.manage', 'members.manage', 'webhooks.manage', 'apikeys.manage', 'contacts.read', 'activity.read'],
  admin: ['envelope.read', 'envelope.write', 'template.read', 'template.write', 'org.manage', 'members.manage', 'webhooks.manage', 'apikeys.manage', 'contacts.read', 'activity.read'],
  member: ['envelope.read', 'envelope.write', 'template.read', 'template.write', 'contacts.read'],
  viewer: ['envelope.read', 'template.read'],
};

const SCOPE_PERMS: Record<Scope, Permission[]> = {
  'envelopes:read': ['envelope.read'],
  'envelopes:write': ['envelope.read', 'envelope.write'],
  'templates:read': ['template.read'],
  'templates:write': ['template.read', 'template.write'],
  'webhooks:manage': ['webhooks.manage'],
  'contacts:read': ['contacts.read'],
};

export function can(p: Principal, perm: Permission): boolean {
  if (p.kind === 'user') return ROLE_PERMS[p.role].includes(perm);
  return p.scopes.some((s) => SCOPE_PERMS[s]?.includes(perm));
}

export function require(p: Principal, perm: Permission) {
  if (!can(p, perm)) throw forbidden();
}

/** Darf der Principal alle Vorgänge der Organisation sehen (statt nur eigene)? */
export function seesAllEnvelopes(p: Principal, visibility: 'own' | 'org'): boolean {
  if (p.kind === 'apikey') return true;
  if (p.role === 'owner' || p.role === 'admin' || p.role === 'viewer') return true;
  return visibility === 'org';
}

export interface EnvelopeAccessRow {
  org_id: string;
  owner_id: string | null;
  api_key_id: string | null;
  test_mode: number;
}

export function assertEnvelopeAccess(p: Principal, env: EnvelopeAccessRow | undefined, visibility: 'own' | 'org', write = false) {
  if (!env || env.org_id !== p.orgId) throw notFound('Vorgang nicht gefunden');
  if (p.kind === 'apikey') {
    // Test- und Live-Daten sind strikt getrennt
    if ((p.mode === 'test') !== (env.test_mode === 1)) throw notFound('Vorgang nicht gefunden');
  } else if (!seesAllEnvelopes(p, visibility) && env.owner_id !== p.userId) {
    throw notFound('Vorgang nicht gefunden');
  }
  require(p, write ? 'envelope.write' : 'envelope.read');
  if (write && p.kind === 'user' && p.role === 'member' && env.owner_id !== p.userId && visibility === 'org') {
    // Mitglieder dürfen fremde Vorgänge sehen (bei Sichtbarkeit „org“), aber nicht ändern
    throw forbidden('Nur die Person, die den Vorgang angelegt hat, oder Administratoren dürfen ihn ändern.');
  }
}

export function actorOf(p: Principal): Actor {
  return p.kind === 'user' ? { type: 'user', id: p.userId, name: p.name, email: p.email } : { type: 'api', id: p.keyId, name: p.name };
}
