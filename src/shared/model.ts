// Gemeinsames Datenmodell für Server und Oberfläche.

export const FIELD_TYPES = [
  'signature',
  'initials',
  'name',
  'email',
  'text',
  'number',
  'date',
  'signed_date',
  'checkbox',
  'select',
  'formula',
  'attachment',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const RECIPIENT_KINDS = ['signer', 'approver', 'filler', 'viewer', 'witness'] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export const AUTH_METHODS = ['none', 'email_otp', 'sms_otp', 'access_code'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

export type EnvelopeStatus = 'draft' | 'sent' | 'completed' | 'declined' | 'voided' | 'expired';
export type RecipientStatus = 'created' | 'waiting' | 'sent' | 'opened' | 'completed' | 'declined' | 'delegated' | 'voided';

export type ValidationPreset = 'email' | 'iban' | 'plz' | 'phone' | 'number' | 'integer' | 'regex';

export interface FieldValidation {
  preset?: ValidationPreset;
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  message?: string;
}

export interface FieldCondition {
  field: string; // key des steuernden Felds
  op: 'checked' | 'unchecked' | 'equals' | 'not_equals' | 'filled' | 'empty';
  value?: string;
}

export interface FieldConfig {
  placeholder?: string;
  options?: string[];
  validation?: FieldValidation;
  condition?: FieldCondition;
  formula?: string;
  decimals?: number;
  prefill?: string;
  readonly?: boolean;
  fontSize?: number;
  dateFormat?: 'DD.MM.YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  accept?: string[];
}

/** Rechteck in normierten Koordinaten (0..1) der sichtbaren Seite: Ursprung oben links,
 *  nach Anwendung von /Rotate und bezogen auf die CropBox – exakt so, wie die Seite angezeigt wird. */
export interface NormRect {
  page: number; // 0-basiert
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageInfo {
  /** sichtbare Breite/Höhe in pt (nach Rotation) */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  /** CropBox im Benutzerkoordinatensystem (unrotiert): x, y, Breite, Höhe */
  crop: [number, number, number, number];
}

export interface FieldDef extends NormRect {
  id?: string;
  key: string;
  type: FieldType;
  documentIndex: number;
  recipient: string; // Rollenschlüssel bzw. Empfänger-Referenz
  required: boolean;
  label: string;
  config: FieldConfig;
}

// Unterscheidbar nebeneinander im Editor, abgestimmt auf Petrol; kein Indigo
export const RECIPIENT_COLORS = ['#0D5C63', '#B4541A', '#2F6FB0', '#6E7F12', '#A23B5C', '#8F6A00', '#5B4B8A', '#2E7D5B'];

export const SIGNATURE_LEVELS = {
  ses: {
    de: 'Einfache elektronische Signatur (EES) i. S. v. Art. 3 Nr. 10 eIDAS-VO',
    en: 'Simple electronic signature (SES) within the meaning of Art. 3(10) eIDAS',
  },
  qes: {
    de: 'Qualifizierte elektronische Signatur (QES) i. S. v. Art. 3 Nr. 12 eIDAS-VO – nur über einen qualifizierten Vertrauensdiensteanbieter',
    en: 'Qualified electronic signature (QES) within the meaning of Art. 3(12) eIDAS – only via a qualified trust service provider',
  },
} as const;

export const CONSENT_VERSION = '2026-10-2';
