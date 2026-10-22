import { getLang, t } from './i18n';

const loc = () => (getLang() === 'de' ? 'de-DE' : 'en-GB');

export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(loc(), withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));
}

export function fmtRelative(iso?: string | null) {
  if (!iso) return '';
  const d = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto' });
  const a = Math.abs(d);
  if (a < 60) return t('gerade eben');
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(d / 86400), 'day');
  return fmtDate(iso, false);
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function shortHash(h?: string | null) {
  return h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '';
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1).replace('.', getLang() === 'de' ? ',' : '.')} MB`;
}
