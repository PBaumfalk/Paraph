import type { ReactNode } from 'react';
import { Logo, Paraph, Seal } from '../../components/ui';
import { t } from '../../lib/i18n';

/** Ein Vertragsbogen auf dem Tisch: Randlinie, Paraphe am Rand, Unterschrift und Siegel – das Motiv der App. */
function Sheet() {
  const lines = [92, 100, 96, 58, 0, 100, 94, 98, 71, 0, 100, 88, 97, 40];
  return (
    <div className="art-sheet" aria-hidden="true">
      <span className="art-title" />
      {lines.map((w, i) => (w ? <span key={i} className="art-line" style={{ width: `${w}%` }} /> : <span key={i} className="art-gap" />))}
      <span className="art-margin-paraph"><Paraph size={30} color="var(--tinte)" stroke={2.6} /></span>
      <span className="art-sign">
        <Paraph size={120} draw color="#1e2a6e" stroke={1.8} />
      </span>
      <span className="art-seal"><Seal size={96} press /></span>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <span className="auth-logo"><Logo /></span>
        <p className="quote">{t('Unterschreiben lassen, ohne Papier zu bewegen.')}</p>
        <Sheet />
        <p className="auth-foot">{t('Selbst gehostet. Jede Signatur mit nachvollziehbarem Protokoll, jedes Ergebnis versiegelt.')}</p>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}
