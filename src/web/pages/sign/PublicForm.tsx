import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Callout, Paraph, Spinner } from '../../components/ui';
import { t, useLang } from '../../lib/i18n';

async function j(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? `Fehler ${r.status}`);
  return d;
}

export default function PublicForm() {
  useLang();
  const { slug } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['pf', slug], queryFn: () => j(`/api/public/forms/${slug}`), retry: false });
  const [f, setF] = useState({ name: '', email: '' });
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const enter = (session: string) => {
    sessionStorage.setItem('paraph.signer', session);
    nav('/s/session');
  };
  if (q.isLoading) return <div className="signer"><div className="signer-center"><Spinner /></div></div>;
  if (q.isError) return <div className="signer"><div className="signer-center"><div className="signer-card"><Paraph size={56} color="var(--ink-4)" /><h1 className="display">{t('Nicht verfügbar')}</h1><p className="muted">{(q.error as Error).message}</p></div></div></div>;
  const d = q.data;
  return (
    <div className="signer" style={{ ['--tinte' as any]: d.org.accent }}>
      <header className="signer-bar"><div className="signer-org">{d.org.logo ? <img src={d.org.logo} alt={d.org.name} /> : <strong>{d.org.name}</strong>}</div></header>
      <div className="signer-center">
        <form
          className="signer-card"
          style={{ textAlign: 'left', justifyItems: 'stretch' }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr('');
            try {
              if (!challenge) {
                const r = await j(`/api/public/forms/${slug}/start`, f);
                if (r.session) enter(r.session);
                else setChallenge(r.challenge);
              } else {
                const r = await j(`/api/public/forms/${slug}/confirm`, { challenge, code });
                enter(r.session);
              }
            } catch (x: any) {
              setErr(x.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1 className="display">{d.title}</h1>
          <div className="stack-sm">{d.documents.map((x: any) => <div key={x.name} className="row hint"><FileText size={14} /> {x.name} · {x.pages} {x.pages === 1 ? t('Seite') : t('Seiten')}</div>)}</div>
          {!challenge ? (
            <>
              <div className="field"><label className="label" htmlFor="n">{t('Ihr vollständiger Name')}</label><input id="n" className="input input-lg" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></div>
              <div className="field"><label className="label" htmlFor="e">{t('E-Mail-Adresse')}</label><input id="e" className="input input-lg" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
              <button className="btn btn-primary btn-lg" disabled={busy}>{d.require_otp ? t('Code anfordern') : t('Weiter zum Dokument')}</button>
              {d.require_otp && <p className="hint">{t('Wir senden einen Code an Ihre E-Mail-Adresse, um sie zu bestätigen. Dorthin erhalten Sie auch das fertige Dokument.')}</p>}
            </>
          ) : (
            <>
              <p className="muted">{t('Code gesendet an {e}.', { e: f.email })}</p>
              <input className="input otp-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus aria-label={t('Code')} />
              <button className="btn btn-primary btn-lg" disabled={busy || code.length < 6}>{t('Bestätigen')}</button>
            </>
          )}
          {err && <Callout kind="stop">{err}</Callout>}
        </form>
      </div>
    </div>
  );
}
