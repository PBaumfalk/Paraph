import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { AuthLayout } from './AuthLayout';
import { post } from '../../lib/api';
import { t } from '../../lib/i18n';
import { Callout, errorText } from '../../components/ui';

export default function Reset() {
  const { token } = useParams();
  const [pw, setPw] = useState('');
  const [state, setState] = useState<{ kind: 'stop' | 'done'; text: string } | null>(null);
  return (
    <AuthLayout>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post('/api/auth/reset', { token, password: pw });
            setState({ kind: 'done', text: t('Das Passwort wurde geändert. Alle bisherigen Sitzungen sind abgemeldet.') });
          } catch (x) {
            setState({ kind: 'stop', text: errorText(x) });
          }
        }}
      >
        <h1>{t('Neues Passwort')}</h1>
        {state && <Callout kind={state.kind}>{state.text}</Callout>}
        {state?.kind !== 'done' && (
          <>
            <div className="field">
              <label htmlFor="p">{t('Neues Passwort')}</label>
              <input id="p" className="input" type="password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus autoComplete="new-password" />
            </div>
            <button className="btn btn-primary btn-lg">{t('Passwort speichern')}</button>
          </>
        )}
        <Link to="/login">{t('Zur Anmeldung')}</Link>
      </form>
    </AuthLayout>
  );
}
