import type { ReactNode } from 'react';
import { Logo, Paraph } from '../../components/ui';
import { t } from '../../lib/i18n';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <Logo />
        <p className="quote">
          {t('Unterschreiben lassen,')} <em>{t('ohne')}</em> {t('Papier zu bewegen.')}
        </p>
        <div className="bigparaph">
          <Paraph size={520} draw color="#7C8BFF" stroke={1.2} />
        </div>
        <p style={{ color: '#9aa0b4', fontSize: 13, maxWidth: 420 }}>
          {t('Selbst gehostet. Jede Signatur mit nachvollziehbarem Protokoll, jedes Ergebnis versiegelt.')}
        </p>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}
