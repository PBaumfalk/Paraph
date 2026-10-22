// Deutsch ist die Primärsprache; der deutsche Text ist zugleich der Schlüssel.
// Englische Übersetzungen stehen in en.ts. Fehlende Einträge fallen auf Deutsch zurück.
import { useSyncExternalStore } from 'react';
import { EN } from './en';

export type Lang = 'de' | 'en';
let lang: Lang = (() => {
  try {
    const s = localStorage.getItem('paraph.lang');
    if (s === 'de' || s === 'en') return s;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : navigator.language ? 'en' : 'de';
})();
const subs = new Set<() => void>();

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem('paraph.lang', l);
  } catch {}
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
export function getLang() {
  return lang;
}
export function useLang() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
}

/** Übersetzt; {name}-Platzhalter werden ersetzt. */
export function t(de: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? EN[de] ?? de : de;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
