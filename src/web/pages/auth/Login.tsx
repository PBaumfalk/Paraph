import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router';
import { AuthLayout } from './AuthLayout';
import { post, setCsrf } from '../../lib/api';
import { useSession } from '../../lib/session';
import { t } from '../../lib/i18n';
import { Callout, errorText, Logo } from '../../components/ui';

// Fehlercodes aus /api/auth/oidc/callback (Details stehen nur im Server-Log)
const SSO_ERRORS: Record<string, string> = {
  sso_denied: 'Die Anmeldung wurde beim Anmeldedienst abgebrochen oder abgelehnt.',
  sso_expired: 'Der Anmeldevorgang ist abgelaufen. Bitte erneut versuchen.',
  sso_unavailable: 'Der Anmeldedienst ist gerade nicht erreichbar. Bitte später erneut versuchen.',
  sso_failed: 'Die Anmeldung über den Anmeldedienst ist fehlgeschlagen. Bitte erneut versuchen.',
  sso_disabled: 'Anmeldung per SSO ist nicht eingerichtet.',
  sso_no_account: 'Für dieses SSO-Konto gibt es noch keinen Zugang. Bitte lassen Sie sich einladen.',
  sso_email_unverified: 'Ihre E-Mail-Adresse ist beim Anmeldedienst nicht bestätigt. Das Konto kann deshalb nicht verknüpft werden.',
  sso_group: 'Ihr Konto ist für diese Anwendung nicht freigeschaltet. Bitte wenden Sie sich an die Verwaltung.',
  sso_disabled_user: 'Ihr Zugang ist gesperrt. Bitte wenden Sie sich an die Verwaltung.',
  sso_no_org: 'Ihr Konto gehört noch zu keiner Organisation. Bitte lassen Sie sich einladen.',
};

export default function Login() {
  const { auth, refresh } = useSession();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(!!auth.session?.mfa_pending);
  const [forgot, setForgot] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'stop' | 'done'; text: string } | null>(() => {
    const e = sp.get('error');
    return e ? { kind: 'stop', text: t(SSO_ERRORS[e] ?? SSO_ERRORS.sso_failed) } : null;
  });
  const [busy, setBusy] = useState(false);
  const next = sp.get('next') || '/';
  if (auth.setup_required) return <Navigate to="/setup" replace />;
  if (auth.session && !auth.session.mfa_pending && auth.session.org_id) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (forgot) {
        await post('/api/auth/forgot', { email });
        setMsg({ kind: 'done', text: t('Falls ein Konto existiert, ist eine E-Mail mit einem Link unterwegs.') });
        setForgot(false);
      } else if (mfa) {
        const r = await post('/api/auth/mfa', { code });
        setCsrf(r.session?.csrf ?? '');
        await refresh();
        setMfa(false);
        if (!r.session?.org_id && !next.startsWith('/invite/')) setMsg({ kind: 'stop', text: t(SSO_ERRORS.sso_no_org) });
        else nav(next, { replace: true });
      } else {
        const r = await post('/api/auth/login', { email, password });
        if (r.mfa_required) setMfa(true);
        else {
          setCsrf(r.session?.csrf ?? '');
          await refresh();
          if (!r.session?.org_id) setMsg({ kind: 'stop', text: t('Ihr Konto gehört noch zu keiner Organisation.') });
          else nav(next, { replace: true });
        }
      }
    } catch (err) {
      setMsg({ kind: 'stop', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <div className="mobile-only"><Logo small /></div>
        <h1>{mfa ? t('Bestätigungscode') : forgot ? t('Passwort vergessen') : t('Anmelden')}</h1>
        {msg && <Callout kind={msg.kind}>{msg.text}</Callout>}
        {mfa ? (
          <div className="field">
            <label htmlFor="code">{t('Code aus der Authenticator-App')}</label>
            <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus maxLength={8} />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">{t('E-Mail-Adresse')}</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            {!forgot && (
              <div className="field">
                <label htmlFor="pw">{t('Passwort')}</label>
                <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
          </>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {mfa ? t('Bestätigen') : forgot ? t('Link anfordern') : t('Anmelden')}
        </button>
        {!mfa && auth.oidc.enabled && !forgot && (
          <a className="btn btn-lg btn-block" href={`/api/auth/oidc/start${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
            {t('Mit {name} anmelden', { name: auth.oidc.name ?? 'SSO' })}
          </a>
        )}
        {!mfa && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => { setForgot(!forgot); setMsg(null); }}>
            {forgot ? t('Zurück zur Anmeldung') : t('Passwort vergessen?')}
          </button>
        )}
        <p className="hint">
          <Link to="/verify">{t('Ein unterschriebenes Dokument prüfen')}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
