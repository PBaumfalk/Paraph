import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AuthLayout } from './AuthLayout';
import { post, setCsrf } from '../../lib/api';
import { useSession } from '../../lib/session';
import { t } from '../../lib/i18n';
import { Callout, errorText } from '../../components/ui';

export default function Setup() {
  const { auth, refresh } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({ code: '', orgName: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!auth.setup_required) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AuthLayout>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            const r = await post('/api/auth/setup', f);
            setCsrf(r.session?.csrf ?? '');
            await refresh();
            nav('/', { replace: true });
          } catch (x) {
            setErr(errorText(x));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>{t('Paraph einrichten')}</h1>
        <p className="muted">{t('Sie legen die Organisation und das erste Inhaberkonto an. Den Einrichtungscode finden Sie im Server-Log (docker compose logs paraph) oder in SETUP_CODE.')}</p>
        {err && <Callout kind="stop">{err}</Callout>}
        <div className="field">
          <label htmlFor="code">{t('Einrichtungscode')}</label>
          <input id="code" className="input mono" value={f.code} onChange={set('code')} required autoFocus autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="org">{t('Name der Organisation')}</label>
          <input id="org" className="input" value={f.orgName} onChange={set('orgName')} required />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="name">{t('Ihr Name')}</label>
            <input id="name" className="input" value={f.name} onChange={set('name')} required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="email">{t('E-Mail-Adresse')}</label>
            <input id="email" className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="username" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pw">{t('Passwort')}</label>
          <input id="pw" className="input" type="password" minLength={10} value={f.password} onChange={set('password')} required autoComplete="new-password" />
          <span className="hint">{t('Mindestens 10 Zeichen.')}</span>
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{t('Einrichten und anmelden')}</button>
      </form>
    </AuthLayout>
  );
}
