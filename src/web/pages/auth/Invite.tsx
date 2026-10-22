import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AuthLayout } from './AuthLayout';
import { get, post } from '../../lib/api';
import { useSession } from '../../lib/session';
import { t } from '../../lib/i18n';
import { Callout, errorText, Spinner } from '../../components/ui';
import { roleLabel } from '../../components/Shell';

export default function Invite() {
  const { token } = useParams();
  const { auth, refresh } = useSession();
  const nav = useNavigate();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => get(`/api/auth/invite/${token}`), retry: false });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  if (info.isLoading) return <AuthLayout><Spinner /></AuthLayout>;
  if (info.isError) return <AuthLayout><div className="auth-card"><h1>{t('Einladung ungültig')}</h1><Callout kind="stop">{errorText(info.error)}</Callout></div></AuthLayout>;
  const d = info.data;
  const loggedInAs = auth.session?.user.email;
  const needLogin = d.user_exists && loggedInAs?.toLowerCase() !== d.email.toLowerCase();
  return (
    <AuthLayout>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr('');
          try {
            await post(`/api/auth/invite/${token}/accept`, d.user_exists ? {} : { name, password });
            await refresh();
            location.assign('/');
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        <h1>{t('Willkommen bei {org}', { org: d.org })}</h1>
        <p className="muted">{t('Sie wurden als {role} eingeladen ({email}).', { role: t(roleLabel(d.role)), email: d.email })}</p>
        {err && <Callout kind="stop">{err}</Callout>}
        {needLogin ? (
          <>
            <Callout>{t('Für diese E-Mail-Adresse gibt es bereits ein Konto. Melden Sie sich an und öffnen Sie den Link erneut.')}</Callout>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => nav(`/login?next=${encodeURIComponent(location.pathname)}`)}>{t('Anmelden')}</button>
          </>
        ) : d.user_exists ? (
          <button className="btn btn-primary btn-lg">{t('Einladung annehmen')}</button>
        ) : (
          <>
            <div className="field">
              <label htmlFor="n">{t('Ihr Name')}</label>
              <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="p">{t('Passwort festlegen')}</label>
              <input id="p" className="input" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              <span className="hint">{t('Mindestens 10 Zeichen.')}</span>
            </div>
            <button className="btn btn-primary btn-lg">{t('Konto anlegen und beitreten')}</button>
          </>
        )}
        <Link to="/login" className="hint">{t('Zur Anmeldung')}</Link>
      </form>
    </AuthLayout>
  );
}
