import type { Ctx } from '../context.js';
import { notFound } from '../lib/errors.js';

export interface MailTemplate {
  subject: string;
  body: string;
}

export interface Branding {
  accent: string;
  logoBlobId?: string;
  senderName?: string;
  replyTo?: string;
  fromAddress?: string;
  footer?: string;
  mail?: Partial<Record<'signing_request' | 'reminder' | 'completed', MailTemplate>>;
}

export interface OrgSettings {
  envelopeVisibility: 'own' | 'org';
  retentionDays: number | null;
  attachCompletedPdf: boolean;
  appendCertificate: boolean;
  defaultExpiryDays: number;
  defaultReminderDays: number;
  embedOrigins: string[];
  timezone: string;
  locale: 'de' | 'en';
  /** Datenschutzhinweise nach Art. 13 DSGVO für Unterzeichner (Link auf der Signaturseite) */
  privacyUrl: string | null;
}

export const DEFAULT_BRANDING: Branding = { accent: '#3D5AFE' };
export const DEFAULT_SETTINGS: OrgSettings = {
  envelopeVisibility: 'own',
  retentionDays: null,
  attachCompletedPdf: false,
  appendCertificate: true,
  defaultExpiryDays: 30,
  defaultReminderDays: 3,
  embedOrigins: [],
  timezone: 'Europe/Berlin',
  locale: 'de',
  privacyUrl: null,
};

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  branding: Branding;
  settings: OrgSettings;
}

export function getOrg(ctx: Ctx, orgId: string): OrgRow {
  const r = ctx.db.prepare('SELECT id, name, slug, custom_domain, branding, settings FROM orgs WHERE id = ?').get(orgId) as any;
  if (!r) throw notFound();
  return {
    ...r,
    branding: { ...DEFAULT_BRANDING, ...JSON.parse(r.branding) },
    settings: { ...DEFAULT_SETTINGS, ...JSON.parse(r.settings) },
  };
}

/** Basis-URL für Links einer Organisation: eigene Domain (falls gesetzt) oder APP_URL. */
export function orgBaseUrl(ctx: Ctx, org: Pick<OrgRow, 'custom_domain'>): string {
  if (org.custom_domain) {
    const proto = new URL(ctx.cfg.appUrl).protocol;
    return `${proto}//${org.custom_domain}`;
  }
  return ctx.cfg.appUrl;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}
