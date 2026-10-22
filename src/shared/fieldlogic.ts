// Feldlogik, die Browser und Server identisch ausführen. Der Server ist maßgeblich.
import type { FieldCondition, FieldConfig, FieldType, FieldValidation } from './model.js';
import { evaluateFormula, formatNumber, type Values } from './formula.js';

export interface LogicField {
  key: string;
  type: FieldType;
  required: boolean;
  config: FieldConfig;
}

export function conditionMet(c: FieldCondition | undefined, values: Values): boolean {
  if (!c) return true;
  const v = values[c.field] ?? '';
  switch (c.op) {
    case 'checked': return v === 'true';
    case 'unchecked': return v !== 'true';
    case 'equals': return v === (c.value ?? '');
    case 'not_equals': return v !== (c.value ?? '');
    case 'filled': return v !== '';
    case 'empty': return v === '';
    default: return true;
  }
}

/** Sichtbarkeit inkl. Ketten: ein Feld ist nur aktiv, wenn auch sein steuerndes Feld aktiv ist. */
export function activeKeys(fields: LogicField[], values: Values): Set<string> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const memo = new Map<string, boolean>();
  const visit = (key: string, depth: number): boolean => {
    if (memo.has(key)) return memo.get(key)!;
    const f = byKey.get(key);
    if (!f || depth > 20) return false;
    const c = f.config.condition;
    let ok = true;
    if (c) {
      const parentActive = byKey.has(c.field) ? visit(c.field, depth + 1) : true;
      ok = parentActive && conditionMet(c, parentActive ? values : {});
    }
    memo.set(key, ok);
    return ok;
  };
  return new Set(fields.filter((f) => visit(f.key, 0)).map((f) => f.key));
}

export function computeFormulas(fields: LogicField[], values: Values, locale = 'de'): Values {
  const out: Values = { ...values };
  // Mehrere Durchläufe erlauben Formeln, die auf andere Formeln verweisen (max. 5 Ebenen).
  for (let pass = 0; pass < 5; pass++) {
    for (const f of fields) {
      if (f.type !== 'formula' || !f.config.formula) continue;
      try {
        out[f.key] = formatNumber(evaluateFormula(f.config.formula, rawNumbers(out)), f.config.decimals ?? 2, locale);
      } catch {
        out[f.key] = '';
      }
    }
  }
  return out;
}

function rawNumbers(values: Values): Values {
  const r: Values = {};
  for (const [k, v] of Object.entries(values)) r[k] = v == null ? v : normalizeNumber(String(v));
  return r;
}

export function normalizeNumber(s: string): string {
  const t = s.trim().replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return t.replace(/\./g, '').replace(',', '.');
  if (/^-?\d+(,\d+)$/.test(t)) return t.replace(',', '.');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return t.replace(/,/g, '');
  return t;
}

export function isValidIban(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith('DE') && s.length !== 22) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Lehnt Muster mit verschachtelten Wiederholungen ab (Schutz vor katastrophalem Backtracking). */
export function isSafePattern(pattern: string): boolean {
  if (pattern.length > 200) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  // (…+)+, (…*)*, (…+)*, (…{n,})+ usw.
  if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(pattern)) return false;
  if (/\\[1-9]/.test(pattern)) return false;
  return true;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export type ValidationError = { key: string; code: string; message: string };

export function validateValue(
  f: LogicField,
  value: string | undefined | null,
  lang: 'de' | 'en' = 'de',
): string | null {
  const t = (de: string, en: string) => (lang === 'de' ? de : en);
  const v = value ?? '';
  const empty = v === '' || (f.type === 'checkbox' && v !== 'true');
  if (empty) return f.required ? t('Pflichtfeld', 'Required') : null;
  if (v.length > 5000) return t('Eingabe zu lang', 'Input too long');
  const val: FieldValidation = f.config.validation ?? {};
  switch (f.type) {
    case 'checkbox':
      if (v !== 'true' && v !== 'false' && v !== '') return t('Ungültiger Wert', 'Invalid value');
      return null;
    case 'select':
      if (!(f.config.options ?? []).includes(v)) return t('Bitte eine Option wählen', 'Please choose an option');
      return null;
    case 'date':
    case 'signed_date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) return t('Ungültiges Datum', 'Invalid date');
      return null;
    case 'email':
      if (!EMAIL_RE.test(v)) return t('Ungültige E-Mail-Adresse', 'Invalid email address');
      return null;
    case 'number': {
      const n = Number(normalizeNumber(v));
      if (!Number.isFinite(n)) return t('Bitte eine Zahl eingeben', 'Please enter a number');
      if (val.min !== undefined && n < val.min) return val.message ?? t(`Mindestens ${val.min}`, `At least ${val.min}`);
      if (val.max !== undefined && n > val.max) return val.message ?? t(`Höchstens ${val.max}`, `At most ${val.max}`);
      return null;
    }
    case 'text':
    case 'name': {
      if (v.length > (val.maxLength ?? 1000)) return t('Eingabe zu lang', 'Input too long');
      if (val.minLength && v.length < val.minLength) return val.message ?? t(`Mindestens ${val.minLength} Zeichen`, `At least ${val.minLength} characters`);
      const msg = val.message;
      switch (val.preset) {
        case 'email': return EMAIL_RE.test(v) ? null : msg ?? t('Ungültige E-Mail-Adresse', 'Invalid email address');
        case 'iban': return isValidIban(v) ? null : msg ?? t('Ungültige IBAN', 'Invalid IBAN');
        case 'plz': return /^\d{5}$/.test(v) ? null : msg ?? t('Bitte fünfstellige Postleitzahl', 'Please enter a 5-digit postcode');
        case 'phone': return /^\+?[0-9 ()/-]{6,24}$/.test(v) ? null : msg ?? t('Ungültige Telefonnummer', 'Invalid phone number');
        case 'number': return Number.isFinite(Number(normalizeNumber(v))) ? null : msg ?? t('Bitte eine Zahl eingeben', 'Please enter a number');
        case 'integer': return /^-?\d+$/.test(v.trim()) ? null : msg ?? t('Bitte eine ganze Zahl eingeben', 'Please enter a whole number');
        case 'regex':
          if (val.pattern && isSafePattern(val.pattern) && !new RegExp(`^(?:${val.pattern})$`).test(v)) return msg ?? t('Format ungültig', 'Invalid format');
          return null;
        default: return null;
      }
    }
    default:
      return null;
  }
}

export { computeFormulas as applyFormulas };
