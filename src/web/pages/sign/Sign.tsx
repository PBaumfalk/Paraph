// Signaturseite für externe Unterzeichner – ohne Konto, ohne Installation, mobil zuerst.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowRight, Check, ChevronDown, Download, FileText, Languages, MoreHorizontal, Paperclip, ShieldCheck, UserRoundPlus, X } from 'lucide-react';
import { Callout, Dialog, Menu, Paraph, PdfPage, Spinner } from '../../components/ui';
import { SignaturePad, type AdoptedSignature } from '../../components/SignaturePad';
import { ApiError, download } from '../../lib/api';
import { loadPdf, type PdfDoc } from '../../lib/pdf';
import { getLang, setLang, t, useLang } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';
import { activeKeys, computeFormulas, validateValue } from '../../../shared/fieldlogic';

const KEY = 'paraph.signer';

async function sreq(method: string, url: string, body?: unknown) {
  const s = sessionStorage.getItem(KEY) ?? '';
  const res = await fetch(url, {
    method,
    headers: { 'x-signer-session': s, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Fehler ${res.status}`, data?.error?.details);
  return data;
}

function useCoarse() {
  const [c, setC] = useState(() => matchMedia('(pointer: coarse), (max-width: 640px)').matches);
  useEffect(() => {
    const m = matchMedia('(pointer: coarse), (max-width: 640px)');
    const h = () => setC(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return c;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtD = (iso: string, f?: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return f === 'YYYY-MM-DD' ? iso : f === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : `${d}.${m}.${y}`;
};

type Phase = 'loading' | 'error' | 'auth' | 'waiting' | 'sign' | 'done' | 'declined' | 'completed_before';

export default function Sign({ embedded = false }: { embedded?: boolean }) {
  useLang();
  const { token } = useParams();
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const [view, setView] = useState<any>(null);
  const [origin, setOrigin] = useState<string | null>(null);

  const fail = (e: any) => {
    const code = e?.code;
    const map: Record<string, [string, string]> = {
      voided: [t('Zurückgezogen'), t('Der Absender hat diese Anfrage zurückgezogen. Sie müssen nichts weiter tun.')],
      expired: [t('Abgelaufen'), t('Diese Anfrage ist abgelaufen. Bitte wenden Sie sich an den Absender, wenn Sie noch unterschreiben möchten.')],
      declined: [t('Beendet'), t('Eine beteiligte Person hat abgelehnt. Der Vorgang ist beendet.')],
      not_active: [t('Link nicht mehr gültig'), t('Dieser Link wurde ersetzt oder ist nicht mehr aktiv.')],
      unauthorized: [t('Sitzung abgelaufen'), t('Bitte öffnen Sie den Link aus Ihrer E-Mail erneut.')],
      not_found: [t('Link ungültig'), t('Dieser Link ist ungültig oder wurde durch einen neueren ersetzt – etwa nach einer Erinnerung. Nutzen Sie bitte den Link aus der neuesten E-Mail.')],
    };
    const m = map[code] ?? (e?.status === 401 ? map.unauthorized : e?.status === 404 ? map.not_found : [t('Fehler'), e?.message ?? '']);
    setError({ title: m[0], text: m[1] });
    setPhase('error');
  };

  const apply = (v: any) => {
    setView(v);
    if (v.envelope?.locale && !localStorage.getItem('paraph.lang') && v.envelope.locale !== getLang()) setLang(v.envelope.locale);
    if (v.state === 'completed_self') setPhase('completed_before');
    else if (v.state === 'waiting') setPhase('waiting');
    else if (!v.me.authenticated) setPhase('auth');
    else setPhase('sign');
  };

  useEffect(() => {
    (async () => {
      try {
        if (token && token !== 'session') {
          const r = await fetch(embedded ? '/api/sign/embed' : '/api/sign/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
          const data = await r.json();
          if (!r.ok) throw new ApiError(r.status, data?.error?.code ?? 'error', data?.error?.message ?? '');
          sessionStorage.setItem(KEY, data.session);
          setOrigin(data.origin ?? null);
          // Token aus der Adresszeile und dem Verlauf entfernen
          history.replaceState(null, '', embedded ? '/embed/s/session' : '/s/session');
          apply(data.view);
        } else {
          apply(await sreq('GET', '/api/sign/view'));
        }
      } catch (e) {
        fail(e);
      }
    })();
  }, [token]);

  const notifyParent = (type: string) => {
    if (embedded && window.parent !== window && origin) window.parent.postMessage({ type, envelope_id: view?.envelope?.id }, origin);
  };

  const accent = view?.org?.accent ?? '#2338E0';
  return (
    <div className="signer" style={{ ['--tinte' as any]: accent }}>
      <header className="signer-bar">
        <div className="signer-org">
          {view?.org?.logo ? <img src={view.org.logo} alt={view.org.name} /> : view?.org ? <strong>{view.org.name}</strong> : <Paraph size={26} />}
        </div>
        {view?.envelope && phase === 'sign' && <div className="signer-title">{view.envelope.title}</div>}
        <button className="icon-btn" onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')} aria-label={t('Sprache')} title={getLang() === 'de' ? 'English' : 'Deutsch'}>
          <Languages />
        </button>
      </header>
      {view?.envelope?.test_mode && <div className="test-ribbon">{t('Testmodus – nicht rechtsverbindlich')}</div>}
      {phase === 'loading' && <div className="signer-center"><Spinner label={t('Dokument wird geöffnet …')} /></div>}
      {phase === 'error' && error && <Notice title={error.title} text={error.text} />}
      {phase === 'waiting' && <Notice title={t('Noch nicht an der Reihe')} text={t('Vor Ihnen unterschreiben andere Beteiligte. Sie erhalten eine E-Mail, sobald Sie an der Reihe sind.')} />}
      {phase === 'auth' && view && <AuthStep view={view} onDone={apply} onError={fail} />}
      {phase === 'completed_before' && view && <DoneStep view={view} again />}
      {phase === 'declined' && <Notice title={t('Abgelehnt')} text={t('Sie haben die Unterzeichnung abgelehnt. Der Absender wurde informiert.')} />}
      {phase === 'done' && view && (
        <DoneStep
          view={view}
          onReturn={
            sessionStorage.getItem('paraph.signer.return')
              ? () => {
                  const r = sessionStorage.getItem('paraph.signer.return')!;
                  sessionStorage.removeItem('paraph.signer.return');
                  sessionStorage.removeItem(KEY);
                  nav(r);
                }
              : undefined
          }
        />
      )}
      {phase === 'sign' && view && (
        <SignStep
          view={view}
          onDone={() => {
            notifyParent('paraph:completed');
            setPhase('done');
          }}
          onDeclined={() => {
            notifyParent('paraph:declined');
            setPhase('declined');
          }}
          onError={fail}
        />
      )}
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="signer-center">
      <div className="signer-card">
        <Paraph size={56} color="var(--ink-4)" />
        <h1 className="display">{title}</h1>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

function AuthStep({ view, onDone, onError }: { view: any; onDone: (v: any) => void; onError: (e: any) => void }) {
  const m = view.me.auth_method;
  const [sent, setSent] = useState<null | { to: string; testCode?: string }>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await sreq('POST', '/api/sign/otp');
      setSent({ to: r.to, testCode: r.testCode });
    } catch (e: any) {
      if (e.status === 401 || e.status === 410) onError(e);
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onDone(await sreq('POST', '/api/sign/verify', { code }));
    } catch (x: any) {
      if (x.status === 410) onError(x);
      else setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const isCode = m === 'access_code';
  return (
    <div className="signer-center">
      <form className="signer-card" onSubmit={verify}>
        <ShieldCheck size={40} color="var(--tinte)" />
        <h1 className="display">{t('Kurz bestätigen, dass Sie es sind')}</h1>
        <p className="muted">
          {t('{sender} hat Ihnen „{title}“ gesendet.', { sender: view.envelope.sender, title: view.envelope.title })}{' '}
          {isCode ? t('Bitte geben Sie den Zugangscode ein, den Sie separat erhalten haben.') : m === 'sms_otp' ? t('Wir senden Ihnen einen Code per SMS.') : t('Wir senden Ihnen einen Code per E-Mail.')}
        </p>
        {!isCode && !sent && (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={request} disabled={busy}>{t('Code senden')}</button>
        )}
        {(isCode || sent) && (
          <>
            {sent && <p className="hint">{t('Code gesendet an {to}. Er gilt 10 Minuten.', { to: sent.to })}</p>}
            {sent?.testCode && <Callout>{t('Testmodus: Der Code lautet {c}.', { c: sent.testCode })}</Callout>}
            <input
              className="input otp-input"
              value={code}
              onChange={(e) => setCode(isCode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode={isCode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoFocus
              aria-label={isCode ? t('Zugangscode') : t('Code')}
              placeholder={isCode ? '' : '••••••'}
            />
            <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length < (isCode ? 4 : 6)}>{t('Bestätigen')}</button>
            {!isCode && <button type="button" className="btn btn-ghost btn-sm" onClick={request} disabled={busy}>{t('Neuen Code senden')}</button>}
          </>
        )}
        {err && <p className="error-text">{err}</p>}
        <p className="hint">{t('Der Code belegt den Zugriff auf Ihr Postfach bzw. Ihre Nummer. Er ist kein amtlicher Identitätsnachweis.')}</p>
      </form>
    </div>
  );
}

function DoneStep({ view, again, onReturn }: { view: any; again?: boolean; onReturn?: () => void }) {
  const [v, setV] = useState(view);
  useEffect(() => {
    if (v.envelope.status === 'completed') return;
    const tm = setInterval(async () => {
      try {
        const nv = await sreq('GET', '/api/sign/view');
        setV(nv);
        if (nv.envelope.status === 'completed') clearInterval(tm);
      } catch {
        clearInterval(tm);
      }
    }, 4000);
    return () => clearInterval(tm);
  }, []);
  const completed = v.envelope.status === 'completed';
  const dl = (kind: string) => download(`/api/sign/final/${kind}`, { 'x-signer-session': sessionStorage.getItem(KEY) ?? '' });
  return (
    <div className="signer-center">
      <div className="signer-card done-card">
        <Paraph size={110} draw={!again} />
        <h1 className="display">{again ? t('Bereits unterschrieben') : v.me.kind === 'approver' ? t('Freigegeben') : v.me.kind === 'filler' ? t('Übermittelt') : t('Unterschrieben')}</h1>
        <p className="muted">
          {completed
            ? t('Alle Beteiligten haben unterschrieben. Sie können das Dokument jetzt herunterladen.')
            : t('Vielen Dank. Sobald alle Beteiligten fertig sind, erhalten Sie das unterschriebene Dokument per E-Mail.')}
        </p>
        {completed && (
          <div className="stack-sm" style={{ width: '100%' }}>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => dl('final')}><Download /> {t('Unterschriebenes Dokument')}</button>
            <button className="btn btn-block" onClick={() => dl('certificate')}><ShieldCheck /> {t('Abschlussbestätigung')}</button>
          </div>
        )}
        {onReturn && <button className="btn btn-ink btn-lg btn-block" onClick={onReturn}>{t('Gerät zurückgeben')}</button>}
        <p className="hint">{t('Sie können dieses Fenster schließen.')}</p>
      </div>
    </div>
  );
}

function SignStep({ view, onDone, onDeclined, onError }: { view: any; onDone: () => void; onDeclined: () => void; onError: (e: any) => void }) {
  const coarse = useCoarse();
  const [pdfs, setPdfs] = useState<Record<string, PdfDoc>>({});
  const [width, setWidth] = useState(Math.min(window.innerWidth - 16, 900));
  const all = view.fields as any[];
  const mine = all.filter((f) => f.mine);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of all) v[f.key] = f.value ?? (f.mine && f.config?.prefill ? f.config.prefill : '') ?? '';
    for (const f of mine) {
      if (!v[f.key] && f.type === 'name') v[f.key] = view.me.name;
      if (!v[f.key] && f.type === 'email') v[f.key] = view.me.email;
    }
    return v;
  });
  const [sigs, setSigs] = useState<Record<string, { id: string; preview: string }>>({});
  const [adopted, setAdopted] = useState<Record<string, { id: string; preview: string }>>({});
  const [pad, setPad] = useState<null | { purpose: 'signature' | 'initials'; key: string }>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState(false);
  const [intro, setIntro] = useState(true);
  const [decline, setDecline] = useState(false);
  const [delegate, setDelegate] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    for (const d of view.documents) {
      const url = `/api/sign/documents/${d.id}`;
      loadPdf(`sign:${d.id}:${d.sha256}`, async () => {
        const res = await fetch(url, { headers: { 'x-signer-session': sessionStorage.getItem(KEY) ?? '' } });
        if (!res.ok) throw new Error('pdf');
        return new Uint8Array(await res.arrayBuffer());
      })
        .then((p) => setPdfs((x) => ({ ...x, [d.id]: p })))
        .catch(() => onError(new ApiError(401, 'unauthorized', '')));
    }
    const ro = new ResizeObserver(() => wrap.current && setWidth(Math.min(wrap.current.clientWidth - (window.innerWidth < 640 ? 0 : 32), 900)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const logic = useMemo(() => all.map((f) => ({ key: f.key, type: f.type, required: f.required, config: f.config ?? {} })), [all]);
  const merged = useMemo(() => {
    const v = { ...values };
    for (const f of mine) {
      if (f.type === 'signature' || f.type === 'initials') v[f.key] = sigs[f.key] ? 'signed' : '';
      if (f.type === 'signed_date') v[f.key] = today();
      if (f.type === 'attachment') v[f.key] = attachments[f.key] ? 'att' : '';
    }
    return computeFormulas(logic, v, view.envelope.locale);
  }, [values, sigs, attachments, logic]);
  const active = useMemo(() => activeKeys(logic, merged), [logic, merged]);
  const todo = mine.filter((f) => active.has(f.key) && !['formula', 'signed_date'].includes(f.type) && !f.config?.readonly);
  const errorOf = (f: any) => {
    if (f.type === 'signature' || f.type === 'initials') return f.required && !sigs[f.key] ? t('Unterschrift fehlt') : null;
    if (f.type === 'attachment') return f.required && !attachments[f.key] ? t('Anhang fehlt') : null;
    return validateValue({ key: f.key, type: f.type, required: f.required, config: f.config ?? {} }, merged[f.key], getLang());
  };
  const pending = todo.filter((f) => errorOf(f));
  const requiredLeft = pending.length;
  const doneCount = todo.length - requiredLeft;

  const persist = (v: Record<string, string>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const body: Record<string, string> = {};
      for (const f of mine) if (!['signature', 'initials', 'formula', 'signed_date', 'attachment'].includes(f.type) && !f.config?.readonly) body[f.key] = v[f.key] ?? '';
      sreq('PUT', '/api/sign/draft', body).catch(() => {});
    }, 800);
  };
  const setVal = (k: string, v: string) => {
    setValues((x) => {
      const n = { ...x, [k]: v };
      persist(n);
      return n;
    });
  };

  const goTo = useCallback(
    (f: any) => {
      setCurrent(f.key);
      const el = document.getElementById(`sf-${f.key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => activate(f), 380);
    },
    [sigs, adopted],
  );

  const activate = (f: any) => {
    setCurrent(f.key);
    if (f.type === 'signature' || f.type === 'initials') {
      const purpose = f.type === 'initials' ? 'initials' : 'signature';
      if (adopted[purpose] && !sigs[f.key]) setSigs((s) => ({ ...s, [f.key]: adopted[purpose] }));
      else setPad({ purpose, key: f.key });
    } else if (f.type === 'checkbox') {
      setVal(f.key, merged[f.key] === 'true' ? '' : 'true');
    } else if (f.type === 'attachment') {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = 'application/pdf,image/png,image/jpeg';
      i.onchange = async () => {
        const file = i.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/sign/attachments/${encodeURIComponent(f.key)}`, { method: 'POST', headers: { 'x-signer-session': sessionStorage.getItem(KEY) ?? '' }, body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setAttachments((a) => ({ ...a, [f.key]: data.name }));
        else alert(data?.error?.message ?? t('Hochladen fehlgeschlagen'));
      };
      i.click();
    } else if (!coarse && ['text', 'name', 'email', 'number', 'date'].includes(f.type)) {
      // Desktop: direkt im Dokument tippen statt eines zusätzlichen Dialogs
      document.querySelector<HTMLInputElement>(`#sf-${CSS.escape(f.key)} input`)?.focus();
    } else setEdit(f.key);
  };

  const next = () => {
    const order = todo; // bereits nach Seite, y, x sortiert (Server)
    const idx = order.findIndex((f) => f.key === current);
    const after = [...order.slice(idx + 1), ...order.slice(0, idx + 1)].find((f) => errorOf(f));
    if (after) goTo(after);
    else {
      setShowErrors(true);
      setReview(true);
    }
  };

  const adopt = async (s: AdoptedSignature) => {
    const purpose = pad!.purpose;
    const r = await sreq('POST', '/api/sign/signatures', { purpose, method: s.method, png_base64: s.png_base64, typed_text: s.typed_text });
    const entry = { id: r.id, preview: s.preview };
    setAdopted((a) => ({ ...a, [purpose]: entry }));
    // Gleiche Unterschrift in alle eigenen Felder desselben Typs übernehmen
    setSigs((x) => {
      const n = { ...x, [pad!.key]: entry };
      for (const f of mine) if ((f.type === 'initials' ? 'initials' : f.type === 'signature' ? 'signature' : null) === purpose && !n[f.key]) n[f.key] = entry;
      return n;
    });
    setPad(null);
  };

  const pagesOf = (d: any) => d.pages.map((p: any, i: number) => ({ p, i }));
  const editing = mine.find((f) => f.key === edit);

  return (
    <div className="signer-main" ref={wrap}>
      {intro && (
        <div className="signer-intro">
          <div className="grow">
            <div className="eyebrow">{t('Von {sender}', { sender: view.envelope.sender })}</div>
            <h1 className="display">{view.envelope.title}</h1>
            {view.envelope.message && <p className="intro-msg">{view.envelope.message}</p>}
            <p className="muted" style={{ fontSize: 13.5 }}>
              {todo.length === 0
                ? view.me.kind === 'approver'
                  ? t('Bitte prüfen Sie das Dokument und geben Sie es frei.')
                  : t('Bitte prüfen Sie das Dokument und bestätigen Sie es.')
                : todo.length === 1 ? t('Ein Feld für Sie, farbig markiert.') : t('{n} Felder für Sie, markiert in Farbe. Wir führen Sie der Reihe nach hin.', { n: todo.length })}
              {view.envelope.expires_at && ` ${t('Gültig bis {d}.', { d: fmtDate(view.envelope.expires_at, false) })}`}
            </p>
          </div>
          <button className="icon-btn" onClick={() => setIntro(false)} aria-label={t('Ausblenden')}><X /></button>
        </div>
      )}

      {view.progress.length > 1 && (
        <div className="signer-route">
          {view.progress.sort((a: any, b: any) => a.routing_order - b.routing_order).map((p: any, i: number) => (
            <span key={i} className={`route-step ${p.status === 'completed' ? 'done' : ''} ${p.me ? 'me' : ''}`}>
              {p.status === 'completed' ? <Check size={12} /> : <span className="route-dot" />}
              {p.me ? t('Sie') : p.name}
            </span>
          ))}
        </div>
      )}

      <div className="signer-docs">
        {view.documents.map((d: any) => (
          <section key={d.id} aria-label={d.name}>
            {view.documents.length > 1 && <div className="signer-docname"><FileText size={14} /> {d.name}</div>}
            {pagesOf(d).map(({ p, i }: any) => (
              <div key={i} className="page signer-page" style={{ width, aspectRatio: `${p.width} / ${p.height}` }} aria-label={t('Seite {n} von {m}', { n: i + 1, m: d.pages.length })}>
                <PdfPage doc={pdfs[d.id] ?? null} index={i} width={width} />
                {!pdfs[d.id] && <div className="page-loading"><Spinner /></div>}
                {all
                  .filter((f) => f.document_id === d.id && f.page === i && active.has(f.key))
                  .map((f) => {
                    const pxH = f.h * width * (p.height / p.width);
                    const fontSize = Math.max(9, Math.min(16, pxH * 0.62));
                    const style = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, fontSize };
                    if (!f.mine) {
                      return (
                        <div key={f.key} className="sfield sfield-other" style={style}>
                          {f.signed_by_other ? <span className="other-signed">✓ {f.signed_by_other.name}</span> : f.value ? <span className="sval">{f.type === 'date' ? fmtD(f.value, f.config?.dateFormat) : f.type === 'checkbox' ? (f.value === 'true' ? '✓' : '') : f.value}</span> : null}
                        </div>
                      );
                    }
                    const err = errorOf(f);
                    const v = merged[f.key];
                    const isCur = current === f.key;
                    const inline = !coarse && ['text', 'name', 'email', 'number', 'date'].includes(f.type) && !f.config?.readonly;
                    return (
                      <div
                        key={f.key}
                        id={`sf-${f.key}`}
                        className={`sfield sfield-mine sfield-${f.type} ${err ? 'is-todo' : 'is-done'} ${isCur ? 'is-current' : ''} ${showErrors && err ? 'is-error' : ''}`}
                        style={style}
                        role={inline ? undefined : 'button'}
                        tabIndex={inline ? -1 : 0}
                        aria-label={inline ? undefined : `${f.label}${f.required ? ' (' + t('Pflichtfeld') + ')' : ''}`}
                        onClick={() => !inline && !f.config?.readonly && f.type !== 'formula' && f.type !== 'signed_date' && activate(f)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !inline && (e.preventDefault(), activate(f))}
                        title={err && showErrors ? err : f.label}
                      >
                        {f.type === 'signature' || f.type === 'initials' ? (
                          sigs[f.key] ? <img src={sigs[f.key].preview} alt={t('Ihre Unterschrift')} /> : <span className="sfield-cta">{f.type === 'initials' ? t('Paraphe') : t('Unterschreiben')}</span>
                        ) : f.type === 'checkbox' ? (
                          v === 'true' ? <Check strokeWidth={3} /> : null
                        ) : inline ? (
                          <input
                            className="sinput"
                            type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                            inputMode={f.type === 'number' ? 'decimal' : undefined}
                            value={values[f.key] ?? ''}
                            placeholder={f.config?.placeholder ?? f.label}
                            onFocus={() => setCurrent(f.key)}
                            onChange={(e) => setVal(f.key, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), next())}
                            aria-invalid={!!(showErrors && err)}
                            aria-label={f.label}
                            aria-required={f.required}
                            style={{ fontSize }}
                          />
                        ) : f.type === 'attachment' ? (
                          <span className="sval"><Paperclip size={12} /> {attachments[f.key] ?? f.label}</span>
                        ) : f.type === 'signed_date' ? (
                          <span className="sval">{fmtD(today(), f.config?.dateFormat)}</span>
                        ) : v ? (
                          <span className="sval">{f.type === 'date' ? fmtD(v, f.config?.dateFormat) : v}</span>
                        ) : (
                          <span className="sfield-ph">{f.label}</span>
                        )}
                        {f.required && err && !['checkbox'].includes(f.type) && !inline && <span className="req-dot" aria-hidden="true" />}
                      </div>
                    );
                  })}
              </div>
            ))}
          </section>
        ))}
        <p className="hint" style={{ textAlign: 'center', padding: '8px 16px 140px' }}>
          {t('Dokumentfassung')} <span className="mono">{view.documents.map((d: any) => d.sha256.slice(0, 12)).join(' · ')}</span> · {t('einfache elektronische Signatur')}
        </p>
      </div>

      <div className="signer-dock">
        <div className="dock-progress" aria-hidden="true"><span style={{ width: `${todo.length ? (doneCount / todo.length) * 100 : 100}%` }} /></div>
        <div className="dock-row">
          <Menu
            align="left"
            trigger={(open) => (
              <button className="icon-btn" onClick={open} aria-label={t('Weitere Optionen')}><MoreHorizontal /></button>
            )}
          >
            {() => (
              <>
                <button onClick={() => setDecline(true)}><X /> {t('Ablehnen')}</button>
                {view.envelope.allow_delegation && <button onClick={() => setDelegate(true)}><UserRoundPlus /> {t('An Vertretung weitergeben')}</button>}
                <button onClick={() => setIntro(true)}><ChevronDown /> {t('Nachricht anzeigen')}</button>
              </>
            )}
          </Menu>
          <div className="dock-status grow">
            {requiredLeft > 0 ? (
              <>
                <strong>{requiredLeft === 1 ? t('Noch 1 Feld') : t('Noch {n} Felder', { n: requiredLeft })}</strong>
                <span>{t('{d} von {n} erledigt', { d: doneCount, n: todo.length })}</span>
              </>
            ) : (
              <>
                <strong>{t('Alles ausgefüllt')}</strong>
                <span>{t('Bitte abschließend bestätigen')}</span>
              </>
            )}
          </div>
          {requiredLeft > 0 ? (
            <button className="btn btn-primary btn-lg" onClick={next}>
              {current ? t('Nächstes Feld') : t('Los geht’s')} <ArrowRight />
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => setReview(true)}>
              {t('Abschließen')} <ArrowRight />
            </button>
          )}
        </div>
      </div>

      {editing && <FieldSheet field={editing} value={values[editing.key] ?? ''} onChange={(v) => setVal(editing.key, v)} error={errorOf({ ...editing })} onClose={() => setEdit(null)} onNext={() => { setEdit(null); setTimeout(next, 50); }} />}
      {pad && <SignaturePad purpose={pad.purpose} name={view.me.name} onCancel={() => setPad(null)} onAdopt={adopt} />}
      {review && (
        <ReviewSheet
          view={view}
          pending={pending}
          onClose={() => setReview(false)}
          onFix={(f) => { setReview(false); goTo(f); }}
          submit={async (accepted) => {
            const ckKey = `paraph.ck.${view.me.id}`;
            let ck = sessionStorage.getItem(ckKey);
            if (!ck) {
              ck = 'ck_' + crypto.getRandomValues(new Uint32Array(4)).join('').slice(0, 30);
              sessionStorage.setItem(ckKey, ck);
            }
            const body = {
              values: Object.fromEntries(mine.filter((f) => !['signature', 'initials', 'formula', 'signed_date', 'attachment'].includes(f.type) && !f.config?.readonly).map((f) => [f.key, values[f.key] ?? ''])),
              signatures: Object.fromEntries(Object.entries(sigs).filter(([k]) => active.has(k)).map(([k, s]) => [k, s.id])),
              consent: { accepted, version: view.consent.version },
              document_hashes: view.documents.map((d: any) => d.sha256),
              completion_key: ck,
            };
            // Bei Netzwerkabbruch automatisch erneut senden (idempotent über completion_key)
            for (let attempt = 0; ; attempt++) {
              try {
                await sreq('POST', '/api/sign/complete', body);
                break;
              } catch (e: any) {
                if (e.status === 409 && e.code === 'already_completed') break;
                if ((e.status === 0 || e instanceof TypeError) && attempt < 3) {
                  await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
                  continue;
                }
                throw e;
              }
            }
            onDone();
          }}
        />
      )}
      {decline && <DeclineDialog onClose={() => setDecline(false)} onDone={onDeclined} />}
      {delegate && <DelegateDialog onClose={() => setDelegate(false)} onDone={() => { setDelegate(false); onDeclined(); }} />}
    </div>
  );
}

function FieldSheet({ field: f, value, onChange, error, onClose, onNext }: { field: any; value: string; onChange: (v: string) => void; error: string | null; onClose: () => void; onNext: () => void }) {
  const [touched, setTouched] = useState(false);
  return (
    <Dialog
      title={f.label}
      onClose={onClose}
      footer={<button className="btn btn-primary btn-lg btn-block" onClick={() => { setTouched(true); if (!error || !f.required) onNext(); }}>{t('Weiter')} <ArrowRight /></button>}
    >
      <div className="stack-sm">
        {f.type === 'select' ? (
          <div className="option-list">
            {(f.config?.options ?? []).map((o: string) => (
              <button key={o} className="option" aria-pressed={value === o} onClick={() => onChange(o)}>{value === o && <Check size={16} />}{o}</button>
            ))}
          </div>
        ) : (
          <input
            className="input input-lg"
            autoFocus
            type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
            inputMode={f.type === 'number' ? 'decimal' : f.config?.validation?.preset === 'phone' ? 'tel' : undefined}
            autoComplete={f.type === 'name' ? 'name' : f.type === 'email' ? 'email' : 'off'}
            value={value}
            placeholder={f.config?.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setTouched(true), (!error || !f.required) && onNext())}
            aria-invalid={touched && !!error}
          />
        )}
        {touched && error && <p className="error-text">{error}</p>}
        {!f.required && <p className="hint">{t('Optional')}</p>}
      </div>
    </Dialog>
  );
}

function ReviewSheet({ view, pending, onClose, onFix, submit }: { view: any; pending: any[]; onClose: () => void; onFix: (f: any) => void; submit: (accepted: boolean) => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const c = view.consent;
  return (
    <Dialog
      title={t('Abschließend bestätigen')}
      onClose={onClose}
      footer={
        pending.length ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => onFix(pending[0])}>{t('Zum nächsten offenen Feld')}</button>
        ) : (
          <button
            className="btn btn-primary btn-lg btn-block sign-final"
            disabled={!accepted || busy}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                await submit(true);
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t('Wird gespeichert …') : c.action}
          </button>
        )
      }
    >
      <div className="stack">
        {pending.length > 0 ? (
          <Callout kind="warn">
            {t('Es fehlen noch Angaben:')}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{pending.slice(0, 6).map((f) => <li key={f.key}>{f.label}</li>)}</ul>
          </Callout>
        ) : (
          <>
            <div className="consent-box">
              <p>{c.statement}</p>
              <p className="muted">{c.electronic}</p>
            </div>
            <label className="check consent-check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>{t('Ich habe die Dokumente gelesen und stimme der Erklärung zu.')}</span>
            </label>
            <p className="hint">
              {view.documents.map((d: any) => (
                <span key={d.id} style={{ display: 'block' }}>
                  {d.name} · {d.pages.length} {d.pages.length === 1 ? t('Seite') : t('Seiten')} · SHA-256 <span className="mono">{d.sha256.slice(0, 16)}…</span>
                </span>
              ))}
            </p>
            {err && <Callout kind="stop">{err}</Callout>}
          </>
        )}
      </div>
    </Dialog>
  );
}

function DeclineDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  return (
    <Dialog
      title={t('Unterzeichnung ablehnen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Zurück')}</button>
          <button className="btn btn-ink" onClick={async () => { try { await sreq('POST', '/api/sign/decline', { reason }); onDone(); } catch (e: any) { setErr(e.message); } }}>{t('Ablehnen')}</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">{t('Der Vorgang wird damit für alle Beteiligten beendet. Der Absender wird informiert.')}</p>
        <div className="field">
          <label className="label" htmlFor="dr">{t('Begründung (optional, wird übermittelt)')}</label>
          <textarea id="dr" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {err && <p className="error-text">{err}</p>}
      </div>
    </Dialog>
  );
}

function DelegateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', reason: '' });
  const [err, setErr] = useState('');
  return (
    <Dialog
      title={t('An Vertretung weitergeben')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Zurück')}</button>
          <button className="btn btn-primary" onClick={async () => { try { await sreq('POST', '/api/sign/delegate', f); onDone(); } catch (e: any) { setErr(e.message); } }}>{t('Weitergeben')}</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">{t('Die Vertretung erhält einen eigenen Link und unterschreibt an Ihrer Stelle. Das wird protokolliert; Ihr Link wird ungültig.')}</p>
        <div className="field"><label className="label">{t('Name')}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label className="label">{t('E-Mail-Adresse')}</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label className="label">{t('Grund (optional)')}</label><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
        {err && <p className="error-text">{err}</p>}
      </div>
    </Dialog>
  );
}
