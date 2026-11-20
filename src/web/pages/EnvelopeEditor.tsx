import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { useNavigate, useParams, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Plus, Trash2, ChevronUp, ChevronDown, FilePlus2, Check, AlertTriangle, Scale, Copy, Wand2 } from 'lucide-react';
import { Studio, type FieldModel, type Party, type StudioDoc, type Suggestion, newField } from '../components/Studio';
import { Callout, Dialog, Spinner, errorText, useToast, useConfirm } from '../components/ui';
import { del, get, patch, post, put, upload } from '../lib/api';
import { t } from '../lib/i18n';
import { RECIPIENT_COLORS } from '../../shared/model';

export interface RecDraft {
  lid: string;
  name: string;
  email: string;
  kind: string;
  auth_method: string;
  access_code?: string;
  phone?: string;
  role?: string;
  has_code?: boolean;
}

const KIND_LABEL: Record<string, string> = { signer: 'Unterschreibt', approver: 'Gibt frei', filler: 'Füllt aus', viewer: 'Erhält Kopie', witness: 'Zeuge' };
const AUTH_LABEL: Record<string, string> = { none: 'Nur Link', email_otp: 'Code per E-Mail', sms_otp: 'Code per SMS', access_code: 'Zugangscode' };

export function ContactInput({ value, onChange, onPick, placeholder, type = 'text', autoFocus }: { value: string; onChange: (v: string) => void; onPick: (c: any) => void; placeholder: string; type?: string; autoFocus?: boolean }) {
  const [focus, setFocus] = useState(false);
  const q = useQuery({ queryKey: ['contacts', value], queryFn: () => get(`/api/v1/contacts?search=${encodeURIComponent(value)}`), enabled: focus && value.length >= 2, staleTime: 30_000 });
  const list = (q.data?.data ?? []).filter((c: any) => c.email !== value).slice(0, 5);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
      {focus && list.length > 0 && (
        <div className="contact-suggest">
          {list.map((c: any) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setFocus(false); }}>
              <strong>{c.name}</strong> <span className="muted">{c.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipientsPanel({ recs, setRecs, order, setOrder, features }: { recs: RecDraft[]; setRecs: (r: RecDraft[]) => void; order: string; setOrder: (o: string) => void; features: any }) {
  const upd = (i: number, p: Partial<RecDraft>) => setRecs(recs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: number) => {
    const n = [...recs];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setRecs(n);
  };
  return (
    <section className="insp-section">
      <div className="row row-wrap insp-head">
        <div className="eyebrow grow">{t('Beteiligte')}</div>
        <div className="segmented" role="group" aria-label={t('Reihenfolge')}>
          <button aria-pressed={order === 'parallel'} onClick={() => setOrder('parallel')} title={t('Alle gleichzeitig')}>{t('Gleichzeitig')}</button>
          <button aria-pressed={order === 'sequential'} onClick={() => setOrder('sequential')} title={t('Nacheinander in dieser Reihenfolge')}>{t('Nacheinander')}</button>
        </div>
      </div>
      <div className="rec-list">
        {recs.map((r, i) => (
          <div className="rec-item" key={r.lid} style={{ ['--pc' as any]: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>
            <div className="rec-head">
              {order === 'sequential' && <span className="rec-order">{i + 1}</span>}
              <div className="grow">
                <ContactInput value={r.name} placeholder={t('Name')} onChange={(v) => upd(i, { name: v })} onPick={(c) => upd(i, { name: c.name, email: c.email, phone: c.phone ?? undefined })} autoFocus={!r.name && i === recs.length - 1} />
              </div>
              {order === 'sequential' && (
                <div style={{ display: 'grid' }}>
                  <button className="icon-btn" style={{ height: 17 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Nach oben')}><ChevronUp /></button>
                  <button className="icon-btn" style={{ height: 17 }} disabled={i === recs.length - 1} onClick={() => move(i, 1)} aria-label={t('Nach unten')}><ChevronDown /></button>
                </div>
              )}
              <button className="icon-btn" onClick={() => setRecs(recs.filter((_, j) => j !== i))} aria-label={t('Entfernen')}><Trash2 /></button>
            </div>
            <ContactInput type="email" value={r.email} placeholder={t('E-Mail-Adresse')} onChange={(v) => upd(i, { email: v.trim() })} onPick={(c) => upd(i, { name: c.name, email: c.email })} />
            <div className="row">
              <select className="select" value={r.kind} onChange={(e) => upd(i, { kind: e.target.value })} aria-label={t('Rolle')}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
              <select className="select" value={r.auth_method} onChange={(e) => upd(i, { auth_method: e.target.value })} aria-label={t('Identitätsprüfung')}>
                {Object.entries(AUTH_LABEL).filter(([k]) => k !== 'sms_otp' || features?.sms).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </div>
            {r.auth_method === 'access_code' && (
              <input className="input" placeholder={r.has_code ? t('Zugangscode (gesetzt – zum Ändern neu eingeben)') : t('Zugangscode, den Sie separat mitteilen')} value={r.access_code ?? ''} onChange={(e) => upd(i, { access_code: e.target.value })} />
            )}
            {r.auth_method === 'sms_otp' && <input className="input" type="tel" placeholder={t('Mobilnummer, z. B. +49 170 …')} value={r.phone ?? ''} onChange={(e) => upd(i, { phone: e.target.value })} />}
          </div>
        ))}
      </div>
      <button className="btn btn-sm" onClick={() => setRecs([...recs, { lid: 'tmp' + Math.random().toString(36).slice(2, 8), name: '', email: '', kind: 'signer', auth_method: 'none' }])}>
        <Plus /> {t('Person hinzufügen')}
      </button>
      <p className="hint">
        {t('Identitätsprüfung: Ein Code per E-Mail oder SMS belegt nur den Zugriff auf Postfach bzw. Nummer – keinen amtlichen Identitätsnachweis.')}
      </p>
    </section>
  );
}

function fieldsFromServer(env: any): FieldModel[] {
  const docIdx = new Map(env.documents.map((d: any, i: number) => [d.id, i]));
  return (env.fields ?? []).map((f: any) => ({ id: f.id, key: f.key, type: f.type, doc: docIdx.get(f.document_id) ?? 0, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, party: f.recipient_id, required: f.required, label: f.label, config: f.config ?? {}, value: f.value }));
}

export default function EnvelopeEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['envelope', id], queryFn: () => get(`/api/v1/envelopes/${id}`), refetchOnWindowFocus: false });
  const me = useQuery({ queryKey: ['me-features'], queryFn: () => get('/api/v1/me') });
  const [title, setTitle] = useState('');
  const [recs, setRecsState] = useState<RecDraft[]>([]);
  const [fields, setFieldsState] = useState<FieldModel[]>([]);
  const [order, setOrderState] = useState('parallel');
  const [activeParty, setActiveParty] = useState('');
  const [dirty, setDirty] = useState({ rec: false, fields: false, title: false });
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const loaded = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const state = useRef({ recs, fields, title, dirty });
  state.current = { recs, fields, title, dirty };
  const { confirm, node: confirmNode } = useConfirm();

  useEffect(() => {
    if (!q.data || loaded.current) return;
    const env = q.data;
    if (env.status !== 'draft') {
      nav(`/envelopes/${id}`, { replace: true });
      return;
    }
    loaded.current = true;
    setTitle(env.title);
    setOrderState(env.signing_order);
    const r: RecDraft[] = env.recipients.map((x: any) => ({ lid: x.id, name: x.name, email: x.email, kind: x.kind, auth_method: x.auth_method, phone: x.phone ?? undefined, role: x.role, has_code: x.auth_method === 'access_code' }));
    setRecsState(r.length ? r : [{ lid: 'tmp' + Math.random().toString(36).slice(2, 8), name: '', email: '', kind: 'signer', auth_method: 'none' }]);
    setActiveParty(r[0]?.lid ?? '');
    setFieldsState(fieldsFromServer(env));
    // Feldvorschläge für Dokumente ohne Felder
    if (!env.fields?.length) {
      env.documents.forEach((d: any, i: number) =>
        get(`/api/v1/envelopes/${id}/documents/${d.id}/field-suggestions`)
          .then((s) => setSuggestions((x) => [...x.filter((y) => y.doc !== i), ...s.data.map((y: any) => ({ ...y, doc: i }))]))
          .catch(() => {}),
      );
    }
  }, [q.data]);

  useEffect(() => {
    if (!activeParty && recs[0]) setActiveParty(recs[0].lid);
  }, [recs]);

  const setRecs = (r: RecDraft[]) => {
    setRecsState(r);
    setDirty((d) => ({ ...d, rec: true }));
    // Felder gelöschter Personen entfernen
    const ids = new Set(r.map((x) => x.lid));
    if (fields.some((f) => !ids.has(f.party))) {
      setFieldsState((fs) => fs.filter((f) => ids.has(f.party)));
      setDirty((d) => ({ ...d, fields: true }));
    }
  };
  const setFields = (f: FieldModel[]) => {
    setFieldsState(f);
    setDirty((d) => ({ ...d, fields: true }));
  };
  const setOrder = async (o: string) => {
    setOrderState(o);
    await patch(`/api/v1/envelopes/${id}`, { signing_order: o }).catch((e) => toast(errorText(e), 'error'));
    setDirty((d) => ({ ...d, rec: true }));
  };

  // Speichern: erst Personen (liefert IDs), dann Felder
  const flush = async () => {
    if (running.current) await running.current;
    const s = state.current;
    if (!s.dirty.rec && !s.dirty.fields && !s.dirty.title) return;
    const env = q.data;
    const job = (async () => {
      setSaving('saving');
      try {
        if (s.dirty.title) {
          await patch(`/api/v1/envelopes/${id}`, { title: s.title.trim() || t('Ohne Titel') });
          setDirty((d) => ({ ...d, title: false }));
        }
        let map: Record<string, string> = {};
        const valid = s.recs.filter((r) => r.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email));
        if (s.dirty.rec) {
          const res = await put(`/api/v1/envelopes/${id}/recipients`, valid.map((r) => ({ id: r.lid.startsWith('rcp_') ? r.lid : undefined, ref: r.lid, name: r.name.trim(), email: r.email.trim(), kind: r.kind, auth_method: r.auth_method === 'access_code' && !r.access_code && !r.has_code ? 'none' : r.auth_method, access_code: r.access_code || undefined, phone: r.phone || undefined, role: r.role })));
          map = res.refs;
          setRecsState((cur) => cur.map((r) => (map[r.lid] ? { ...r, lid: map[r.lid], has_code: r.has_code || !!r.access_code, access_code: undefined } : r)));
          setFieldsState((cur) => cur.map((f) => (map[f.party] ? { ...f, party: map[f.party] } : f)));
          setActiveParty((a) => map[a] ?? a);
          // Unvollständige Personen bleiben lokal, bis Name und E-Mail gültig sind – kein erneutes Speichern in Schleife
          setDirty((d) => ({ ...d, rec: false }));
        }
        const fs = state.current.fields.map((f) => ({ ...f, party: map[f.party] ?? f.party }));
        if (s.dirty.fields || s.dirty.rec) {
          const saveable = fs.filter((f) => f.party.startsWith('rcp_'));
          await put(
            `/api/v1/envelopes/${id}/fields`,
            saveable.map((f) => ({ key: f.key, type: f.type, document: env.documents[f.doc].id, recipient: f.party, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required, label: f.label, config: f.config, value: f.config.prefill })),
          );
          setDirty((d) => ({ ...d, fields: false }));
        }
        setSaving('saved');
      } catch (e) {
        setSaving('error');
        toast(errorText(e), 'error');
      }
    })();
    running.current = job;
    await job;
    running.current = null;
  };

  useEffect(() => {
    if (!loaded.current) return;
    if (!dirty.rec && !dirty.fields && !dirty.title) return;
    const tm = setTimeout(flush, 700);
    return () => clearTimeout(tm);
  }, [recs, fields, title, dirty]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const d = state.current.dirty;
      if (d.rec || d.fields || d.title) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const env = q.data;
  const parties: Party[] = useMemo(() => recs.filter((r) => r.kind !== 'viewer').map((r) => ({ id: r.lid, name: r.name || r.email || t('Neue Person'), color: RECIPIENT_COLORS[recs.indexOf(r) % RECIPIENT_COLORS.length], kind: r.kind })), [recs]);
  const docs: StudioDoc[] = useMemo(() => (env?.documents ?? []).map((d: any) => ({ id: d.id, name: d.name, pages: d.pages, pdfUrl: `/api/v1/envelopes/${id}/documents/${d.id}/pdf` })), [env]);

  if (q.isLoading || !env) return <div style={{ padding: 60 }}><Spinner /></div>;

  const addDocs = async (files: File[]) => {
    setUploading(true);
    try {
      for (const f of files) {
        const r = await upload(`/api/v1/envelopes/${id}/documents`, f);
        const idx = env.documents.length;
        setSuggestions((x) => [...x, ...(r.field_suggestions ?? []).map((s: any) => ({ ...s, doc: idx }))]);
        if (r.warnings?.length) toast(r.warnings[0]);
      }
      await flush();
      loaded.current = false;
      await qc.invalidateQueries({ queryKey: ['envelope', id] });
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const acceptSuggestions = () => {
    const party = activeParty || parties[0]?.id;
    if (!party) return;
    const add: FieldModel[] = [];
    for (const s of suggestions) {
      const kind = parties.find((p) => p.id === party)?.kind;
      if ((s.type === 'signature' || s.type === 'initials') && kind !== 'signer' && kind !== 'witness') continue;
      const f = newField(s.type, s.doc, s.page, docs[s.doc].pages[s.page], null, party, [...fields, ...add], s.label);
      add.push({ ...f, x: s.x, y: s.y, w: s.w, h: s.h });
    }
    setFields([...fields, ...add]);
    setSuggestions([]);
    toast(t('{n} Felder übernommen – prüfen Sie Zuordnung und Position.', { n: add.length }));
  };

  const doneSteps = { doc: env.documents.length > 0, rec: recs.some((r) => r.name && r.email), fields: fields.some((f) => f.type === 'signature') };

  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <Link to="/" className="icon-btn" aria-label={t('Zur Übersicht')} onClick={() => flush()}><ArrowLeft /></Link>
        <input className="title-input" value={title} onChange={(e) => { setTitle(e.target.value); setDirty((d) => ({ ...d, title: true })); }} aria-label={t('Titel')} />
        <div className="steps" aria-hidden="true">
          <span data-done={doneSteps.doc}><Check size={13} /> {t('Dokument')}</span>
          <span data-done={doneSteps.rec}><Check size={13} /> {t('Beteiligte')}</span>
          <span data-done={doneSteps.fields}><Check size={13} /> {t('Felder')}</span>
        </div>
        <span className="save-state">{saving === 'saving' ? t('Speichert …') : saving === 'error' ? t('Nicht gespeichert') : saving === 'saved' ? t('Gespeichert') : ''}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            if (await confirm({ title: t('Entwurf löschen?'), text: t('Der Entwurf mit allen Dokumenten und Feldern wird gelöscht.'), action: t('Löschen'), danger: true })) {
              await del(`/api/v1/envelopes/${id}`);
              nav('/');
            }
          }}
        >
          {t('Verwerfen')}
        </button>
        <button className="btn btn-primary" onClick={async () => { await flush(); setSendOpen(true); }}>
          <Send /> {t('Weiter zum Versand')}
        </button>
      </header>
      {env.form_suggestions?.length > 0 && <FormBanner suggestions={env.form_suggestions} />}
      <Studio
        docs={docs}
        parties={parties}
        fields={fields}
        onChange={setFields}
        activeParty={activeParty}
        setActiveParty={setActiveParty}
        suggestions={suggestions}
        onAcceptSuggestions={acceptSuggestions}
        docTools={
          <div className="stack-sm">
            <label className="btn btn-sm btn-block" style={{ cursor: 'pointer' }}>
              <FilePlus2 /> {uploading ? t('Lädt …') : t('Dokument')}
              <input type="file" hidden multiple accept=".pdf,.docx,.doc,.odt,.rtf" onChange={(e) => addDocs([...(e.target.files ?? [])])} />
            </label>
            {env.documents.length > 1 &&
              env.documents.map((d: any, i: number) => (
                <button
                  key={d.id}
                  className="btn btn-ghost btn-sm btn-block"
                  title={t('Dokument entfernen')}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Dokument entfernen?'), text: d.name, action: t('Entfernen'), danger: true }))) return;
                    setFieldsState((fs) => fs.filter((f) => f.doc !== i).map((f) => (f.doc > i ? { ...f, doc: f.doc - 1 } : f)));
                    setDirty((x) => ({ ...x, fields: true }));
                    await flush();
                    await del(`/api/v1/envelopes/${id}/documents/${d.id}`);
                    loaded.current = false;
                    qc.invalidateQueries({ queryKey: ['envelope', id] });
                  }}
                >
                  <Trash2 /> {d.name.slice(0, 12)}
                </button>
              ))}
          </div>
        }
        inspectorExtra={<RecipientsPanel recs={recs} setRecs={setRecs} order={order} setOrder={setOrder} features={me.data?.features} />}
      />
      {env.documents.length === 0 && (
        <div className="drop-veil" style={{ pointerEvents: 'auto' }}>
          <label className="drop-card" style={{ cursor: 'pointer' }}>
            <h2 className="display">{t('Dokument hinzufügen')}</h2>
            <p className="muted">{t('PDF, Word oder ODT auswählen')}</p>
            <Link to="/" className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}>{t('Zurück')}</Link>
            <input type="file" hidden multiple accept=".pdf,.docx,.doc,.odt,.rtf" onChange={(e) => addDocs([...(e.target.files ?? [])])} />
          </label>
        </div>
      )}
      {sendOpen && <SendDialog env={env} recs={recs} onClose={() => setSendOpen(false)} onSent={() => nav(`/envelopes/${id}`)} />}
      {confirmNode}
    </div>
  );
}

function FormBanner({ suggestions }: { suggestions: { ruleId: string; matched: string }[] }) {
  const rules = useQuery({ queryKey: ['form-rules'], queryFn: () => get('/api/v1/form-rules'), staleTime: Infinity });
  const [hidden, setHidden] = useState(false);
  const relevant = suggestions.map((s) => ({ s, r: rules.data?.data.find((r: any) => r.id === s.ruleId) })).filter((x) => x.r && (x.r.min_level === 'PAPER' || x.r.min_level === 'NOTARY' || x.r.min_level === 'QES'));
  if (hidden || !relevant.length) return null;
  const top = relevant[0];
  return (
    <div className="form-banner" role="note">
      <Scale size={18} />
      <div className="grow">
        <strong>{t('Formhinweis')}: {top.r.label} ({top.r.norm}).</strong> {top.r.hint}
        <div className="hint">{t('Erkannt an „{text}“. Bitte im Einzelfall prüfen – Paraph entscheidet keine Rechtsfragen.', { text: top.s.matched })}</div>
      </div>
      <button className="icon-btn" onClick={() => setHidden(true)} aria-label={t('Ausblenden')}>×</button>
    </div>
  );
}

function SendDialog({ env, recs, onClose, onSent }: { env: any; recs: RecDraft[]; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const check = useQuery({ queryKey: ['send-check', env.id], queryFn: () => get(`/api/v1/envelopes/${env.id}/send-check`) });
  const rules = useQuery({ queryKey: ['form-rules'], queryFn: () => get('/api/v1/form-rules'), staleTime: Infinity });
  const [message, setMessage] = useState(env.message ?? '');
  const [expires, setExpires] = useState(30);
  const [reminder, setReminder] = useState(env.reminder_days ?? 3);
  const [delegation, setDelegation] = useState(!!env.allow_delegation);
  const [classes, setClasses] = useState<string[]>(env.form_classes?.length ? env.form_classes : (env.form_suggestions ?? []).map((s: any) => s.ruleId));
  const [ack, setAck] = useState(false);
  // Ohne SMTP (z. B. Probebetrieb) kämen E-Mail-Einladungen nie an – dann Linkübergabe vorwählen
  const smtp = useSession().me?.features.smtp ?? true;
  const [notify, setNotify] = useState(smtp);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<any[] | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    patch(`/api/v1/envelopes/${env.id}`, { form_classes: classes }).then(() => qc.invalidateQueries({ queryKey: ['send-check', env.id] })).catch(() => {});
  }, [classes.join(',')]);

  const warnings = check.data?.form_warnings ?? [];
  const problems = check.data?.problems ?? [];
  const blocking = warnings.filter((w: any) => w.min_level === 'PAPER' || w.min_level === 'NOTARY');

  const send = async () => {
    setBusy(true);
    try {
      await patch(`/api/v1/envelopes/${env.id}`, { message, expires_in_days: expires, reminder_days: reminder, allow_delegation: delegation, form_classes: classes });
      const r = await post(`/api/v1/envelopes/${env.id}/send`, { notify, acknowledge_form_risk: warnings.length ? ack : undefined }, { 'idempotency-key': `send-${env.id}-${env.revision}` });
      if (!notify && r.signing_links?.length) setLinks(r.signing_links);
      else {
        toast(t('Versendet. Sie sehen hier, sobald jemand öffnet oder unterschreibt.'));
        onSent();
      }
    } catch (e) {
      toast(errorText(e), 'error');
      qc.invalidateQueries({ queryKey: ['send-check', env.id] });
    } finally {
      setBusy(false);
    }
  };

  if (links)
    return (
      <Dialog title={t('Persönliche Links')} onClose={onSent} footer={<button className="btn btn-primary" onClick={onSent}>{t('Fertig')}</button>}>
        <div className="stack">
          <Callout kind="warn">{t('Diese Links werden nur jetzt angezeigt. Geben Sie jeden Link nur an die genannte Person weiter.')}</Callout>
          {links.map((l) => (
            <div key={l.recipient_id} className="stack-sm">
              <strong>{recs.find((r) => r.lid === l.recipient_id)?.name ?? l.email}</strong>
              <div className="secret-box">
                <span className="grow">{l.url}</span>
                <button className="icon-btn" style={{ color: '#fff' }} onClick={() => { navigator.clipboard.writeText(l.url); toast(t('Link kopiert')); }} aria-label={t('Kopieren')}><Copy /></button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    );

  return (
    <Dialog
      wide
      title={t('Versenden')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Zurück zum Dokument')}</button>
          <button className="btn btn-primary" disabled={busy || problems.length > 0 || (warnings.length > 0 && !ack)} onClick={send}>
            <Send /> {notify ? t('Jetzt versenden') : t('Starten und Links anzeigen')}
          </button>
        </>
      }
    >
      <div className="stack">
        {check.isLoading && <Spinner />}
        {problems.length > 0 && (
          <Callout kind="stop">
            <strong>{t('Noch nicht bereit:')}</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{problems.map((p: string) => <li key={p}>{p}</li>)}</ul>
          </Callout>
        )}
        <div className="send-summary">
          {recs.filter((r) => r.name).map((r, i) => (
            <div key={r.lid} className="row">
              {env.signing_order === 'sequential' && <span className="order-num">{i + 1}</span>}
              <span className="party-dot" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }} />
              <strong>{r.name}</strong>
              <span className="muted grow">{r.email}</span>
              <span className="pill pill-plain">{t(KIND_LABEL[r.kind])}</span>
            </div>
          ))}
        </div>
        <div className="field">
          <label className="label" htmlFor="msg">{t('Nachricht an die Beteiligten (optional)')}</label>
          <textarea id="msg" className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('z. B. Anbei die besprochene Vereinbarung. Bei Fragen rufen Sie gern an.')} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">{t('Gültig für')}</label>
            <select className="select" value={expires} onChange={(e) => setExpires(Number(e.target.value))}>
              {[3, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{t('{n} Tage', { n: d })}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">{t('Automatisch erinnern')}</label>
            <select className="select" value={reminder} onChange={(e) => setReminder(Number(e.target.value))}>
              <option value={0}>{t('Nie')}</option>
              {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{t('alle {n} Tage', { n: d })}</option>)}
            </select>
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={delegation} onChange={(e) => setDelegation(e.target.checked)} /> {t('Beteiligte dürfen an eine Vertretung weitergeben (wird protokolliert)')}</label>
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('Einladungen per E-Mail senden')}</label>
        {!smtp && <p className="hint">{t('Auf diesem Server ist kein E-Mail-Versand eingerichtet. Geben Sie die Links selbst weiter.')}</p>}
        {!notify && <p className="hint">{t('Sie erhalten die persönlichen Links einmalig und geben sie selbst weiter, etwa aus Ihrer Kanzleisoftware.')}</p>}

        <div className="form-check">
          <div className="row"><Scale size={16} /><strong className="grow">{t('Dokumentart und Formvorschriften')}</strong></div>
          <p className="hint">{t('Paraph erstellt einfache elektronische Signaturen. Für manche Dokumente schreibt das Gesetz eine strengere Form vor. Die Zuordnung prüft Schlüsselwörter und ersetzt keine rechtliche Prüfung.')}</p>
          <div className="class-list">
            {(rules.data?.data ?? []).filter((r: any) => classes.includes(r.id) || (env.form_suggestions ?? []).some((s: any) => s.ruleId === r.id)).map((r: any) => (
              <label key={r.id} className="check">
                <input type="checkbox" checked={classes.includes(r.id)} onChange={(e) => setClasses(e.target.checked ? [...classes, r.id] : classes.filter((c) => c !== r.id))} />
                <span>
                  <strong>{r.label}</strong> <span className="muted">({r.norm})</span>
                  {(env.form_suggestions ?? []).some((s: any) => s.ruleId === r.id) && <span className="pill pill-tinte pill-plain" style={{ marginLeft: 6, height: 20 }}>{t('erkannt')}</span>}
                </span>
              </label>
            ))}
            <select className="select" value="" onChange={(e) => e.target.value && setClasses([...classes, e.target.value])}>
              <option value="">{t('Dokumentart hinzufügen …')}</option>
              {(rules.data?.data ?? []).filter((r: any) => !classes.includes(r.id)).map((r: any) => <option key={r.id} value={r.id}>{r.label} ({r.norm})</option>)}
            </select>
          </div>
          {warnings.map((w: any) => (
            <Callout key={w.id} kind={blocking.includes(w) ? 'stop' : 'warn'}>
              <strong>{w.label} – {w.norm}</strong>
              <div>{w.hint}</div>
              {w.source && <a href={w.source} target="_blank" rel="noreferrer noopener">{t('Gesetzestext')}</a>}
            </Callout>
          ))}
          {warnings.length > 0 && (
            <label className="check ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>{blocking.length ? t('Mir ist bewusst, dass eine elektronische Unterschrift für dieses Dokument nach dem Katalog nicht genügt. Ich versende es trotzdem, z. B. als Entwurf oder Vorabfassung.') : t('Ich habe den Formhinweis gelesen. Mir ist bewusst, dass die gesetzliche Form mit einer einfachen elektronischen Signatur nicht gewahrt wird.')} {t('Die Bestätigung wird protokolliert.')}</span>
            </label>
          )}
          {warnings.length === 0 && classes.length > 0 && <Callout kind="done">{t('Für die gewählte Dokumentart genügt nach dem Katalog eine einfache elektronische Signatur.')}</Callout>}
        </div>
        {warnings.length > 0 && !ack && <p className="hint" style={{ textAlign: 'right' }}><AlertTriangle size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('Bitte bestätigen Sie den Formhinweis.')}</p>}
        <span hidden><Wand2 /></span>
      </div>
    </Dialog>
  );
}
