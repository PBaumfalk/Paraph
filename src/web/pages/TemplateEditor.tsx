import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, FilePlus2, UploadCloud, History, ChevronUp, ChevronDown, Globe2 } from 'lucide-react';
import { Studio, type FieldModel, type Party, type StudioDoc, type Suggestion, newField } from '../components/Studio';
import { Callout, Dialog, Menu, Spinner, errorText, useToast } from '../components/ui';
import { get, patch, post, put, upload } from '../lib/api';
import { t } from '../lib/i18n';
import { fmtDate } from '../lib/format';
import { RECIPIENT_COLORS } from '../../shared/model';

interface Role {
  key: string;
  name: string;
  kind: string;
  routing_order: number;
  auth_method: string;
  default_name?: string;
  default_email?: string;
  public?: boolean;
}

const keyOf = (name: string, existing: string[]) => {
  let base = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'rolle';
  let k = base;
  let n = 2;
  while (existing.includes(k)) k = `${base}_${n++}`;
  return k;
};

export default function TemplateEditor() {
  const { id } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['template', id, 'edit'], queryFn: () => get(`/api/v1/templates/${id}`), refetchOnWindowFocus: false });
  const rules = useQuery({ queryKey: ['form-rules'], queryFn: () => get('/api/v1/form-rules'), staleTime: Infinity });
  const [roles, setRolesState] = useState<Role[]>([]);
  const [fields, setFieldsState] = useState<FieldModel[]>([]);
  const [settings, setSettingsState] = useState<any>({});
  const [docs, setDocs] = useState<any[]>([]);
  const [active, setActive] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [publish, setPublish] = useState(false);
  const [tab, setTab] = useState<'roles' | 'settings'>('roles');
  const loaded = useRef(false);

  useEffect(() => {
    if (!q.data || loaded.current) return;
    loaded.current = true;
    const d = q.data.draft;
    setRolesState(d.roles);
    setSettingsState(d.settings);
    setDocs(d.documents);
    setActive(d.roles[0]?.key ?? '');
    setFieldsState(d.fields.map((f: any, i: number) => ({ id: 'f' + i + Math.random().toString(36).slice(2, 6), key: f.key, type: f.type, doc: f.document, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, party: f.recipient, required: f.required, label: f.label, config: f.config ?? {} })));
  }, [q.data]);

  const setRoles = (r: Role[]) => { setRolesState(r); setDirty(true); };
  const setFields = (f: FieldModel[]) => { setFieldsState(f); setDirty(true); };
  const setSettings = (s: any) => { setSettingsState(s); setDirty(true); };

  const save = async () => {
    setSaving(t('Speichert …'));
    try {
      await put(`/api/v1/templates/${id}/draft`, {
        documents: docs.map((d) => ({ id: d.id, name: d.name })),
        roles,
        settings,
        fields: fields.filter((f) => roles.some((r) => r.key === f.party)).map((f) => ({ key: f.key, type: f.type, document: f.doc, recipient: f.party, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required, label: f.label, config: f.config })),
      });
      setDirty(false);
      setSaving(t('Gespeichert'));
      qc.invalidateQueries({ queryKey: ['templates'] });
    } catch (e) {
      setSaving(t('Nicht gespeichert'));
      toast(errorText(e), 'error');
    }
  };
  useEffect(() => {
    if (!dirty) return;
    const tm = setTimeout(save, 800);
    return () => clearTimeout(tm);
  }, [roles, fields, settings, docs, dirty]);

  const parties: Party[] = useMemo(() => roles.filter((r) => r.kind !== 'viewer').map((r) => ({ id: r.key, name: r.name, color: RECIPIENT_COLORS[roles.indexOf(r) % RECIPIENT_COLORS.length], kind: r.kind })), [roles]);
  const sdocs: StudioDoc[] = useMemo(() => docs.map((d) => ({ id: d.id, name: d.name, pages: d.pages, pdfUrl: `/api/v1/templates/${id}/documents/${d.id}/pdf` })), [docs]);

  if (q.isLoading || !q.data) return <div style={{ padding: 60 }}><Spinner /></div>;
  const tpl = q.data;

  const addDoc = async (files: File[]) => {
    for (const f of files) {
      try {
        const r = await upload(`/api/v1/templates/${id}/documents`, f);
        const idx = docs.length;
        setDocs((d) => [...d, r.document]);
        setSuggestions((s) => [...s, ...(r.field_suggestions ?? []).map((x: any) => ({ ...x, doc: idx }))]);
        setDirty(true);
      } catch (e) {
        toast(errorText(e), 'error');
      }
    }
  };

  const updRole = (i: number, p: Partial<Role>) => setRoles(roles.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const sequential = settings.signing_order === 'sequential';

  const rolesPanel = (
    <section className="insp-section">
      <div className="segmented">
        <button aria-pressed={tab === 'roles'} onClick={() => setTab('roles')}>{t('Rollen')}</button>
        <button aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>{t('Einstellungen')}</button>
      </div>
      {tab === 'roles' ? (
        <>
          <div className="segmented">
            <button aria-pressed={!sequential} onClick={() => setSettings({ ...settings, signing_order: 'parallel' })}>{t('Gleichzeitig')}</button>
            <button aria-pressed={sequential} onClick={() => setSettings({ ...settings, signing_order: 'sequential' })}>{t('Nacheinander')}</button>
          </div>
          <div className="rec-list">
            {roles.map((r, i) => (
              <div className="rec-item" key={r.key} style={{ ['--pc' as any]: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>
                <div className="rec-head">
                  {sequential && <span className="rec-order">{i + 1}</span>}
                  <input className="input grow" value={r.name} onChange={(e) => updRole(i, { name: e.target.value })} aria-label={t('Rollenname')} />
                  {sequential && (
                    <div style={{ display: 'grid' }}>
                      <button className="icon-btn" style={{ height: 17 }} disabled={i === 0} onClick={() => { const n = [...roles]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRoles(n.map((x, j) => ({ ...x, routing_order: j + 1 }))); }} aria-label={t('Nach oben')}><ChevronUp /></button>
                      <button className="icon-btn" style={{ height: 17 }} disabled={i === roles.length - 1} onClick={() => { const n = [...roles]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setRoles(n.map((x, j) => ({ ...x, routing_order: j + 1 }))); }} aria-label={t('Nach unten')}><ChevronDown /></button>
                    </div>
                  )}
                  <button className="icon-btn" disabled={roles.length < 2} onClick={() => { setRoles(roles.filter((_, j) => j !== i)); setFieldsState((fs) => fs.filter((f) => f.party !== r.key)); }} aria-label={t('Entfernen')}><Trash2 /></button>
                </div>
                <div className="row">
                  <select className="select" value={r.kind} onChange={(e) => updRole(i, { kind: e.target.value })}>
                    <option value="signer">{t('Unterschreibt')}</option>
                    <option value="approver">{t('Gibt frei')}</option>
                    <option value="filler">{t('Füllt aus')}</option>
                    <option value="witness">{t('Zeuge')}</option>
                    <option value="viewer">{t('Erhält Kopie')}</option>
                  </select>
                  <select className="select" value={r.auth_method} onChange={(e) => updRole(i, { auth_method: e.target.value })}>
                    <option value="none">{t('Nur Link')}</option>
                    <option value="email_otp">{t('Code per E-Mail')}</option>
                    <option value="sms_otp">{t('Code per SMS')}</option>
                  </select>
                </div>
                <details>
                  <summary className="hint" style={{ cursor: 'pointer' }}>{t('Feste Person (z. B. Geschäftsführung, die immer gegenzeichnet)')}</summary>
                  <div className="stack-sm" style={{ marginTop: 8 }}>
                    <input className="input" placeholder={t('Name')} value={r.default_name ?? ''} onChange={(e) => updRole(i, { default_name: e.target.value || undefined })} />
                    <input className="input" type="email" placeholder={t('E-Mail-Adresse')} value={r.default_email ?? ''} onChange={(e) => updRole(i, { default_email: e.target.value || undefined })} />
                  </div>
                </details>
                <label className="check" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={!!r.public} onChange={(e) => setRoles(roles.map((x, j) => ({ ...x, public: j === i ? e.target.checked : e.target.checked ? false : x.public })))} />
                  {t('Wird im öffentlichen Formular von Besuchern ausgefüllt')}
                </label>
              </div>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => { const name = t('Rolle {n}', { n: roles.length + 1 }); setRoles([...roles, { key: keyOf(name, roles.map((r) => r.key)), name, kind: 'signer', routing_order: roles.length + 1, auth_method: 'none' }]); }}>
            <Plus /> {t('Rolle hinzufügen')}
          </button>
        </>
      ) : (
        <div className="stack">
          <div className="field">
            <label className="label">{t('Titel des Vorgangs')}</label>
            <input className="input" value={settings.title ?? ''} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
            <span className="hint">{t('Platzhalter: {{Rolle.name}}, {{Feldname}}')}</span>
          </div>
          <div className="field">
            <label className="label">{t('Nachricht')}</label>
            <textarea className="textarea" value={settings.message ?? ''} onChange={(e) => setSettings({ ...settings, message: e.target.value })} />
          </div>
          <div className="grid-2">
            <div className="field"><label className="label">{t('Gültig (Tage)')}</label><input className="input" type="number" min={1} max={365} value={settings.expires_in_days ?? 30} onChange={(e) => setSettings({ ...settings, expires_in_days: Number(e.target.value) })} /></div>
            <div className="field"><label className="label">{t('Erinnern alle … Tage')}</label><input className="input" type="number" min={0} max={30} value={settings.reminder_days ?? 3} onChange={(e) => setSettings({ ...settings, reminder_days: Number(e.target.value) })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={!!settings.allow_delegation} onChange={(e) => setSettings({ ...settings, allow_delegation: e.target.checked })} /> {t('Vertretung erlauben')}</label>
          <div className="field">
            <label className="label">{t('Dokumentart (Formhinweise)')}</label>
            {(settings.form_classes ?? []).map((c: string) => {
              const r = rules.data?.data.find((x: any) => x.id === c);
              return <div key={c} className="row"><span className="grow">{r?.label} <span className="muted">({r?.norm})</span></span><button className="icon-btn" onClick={() => setSettings({ ...settings, form_classes: settings.form_classes.filter((x: string) => x !== c) })}><Trash2 /></button></div>;
            })}
            <select className="select" value="" onChange={(e) => e.target.value && setSettings({ ...settings, form_classes: [...(settings.form_classes ?? []), e.target.value] })}>
              <option value="">{t('Hinzufügen …')}</option>
              {(rules.data?.data ?? []).filter((r: any) => !(settings.form_classes ?? []).includes(r.id)).map((r: any) => <option key={r.id} value={r.id}>{r.label} ({r.norm})</option>)}
            </select>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <Link to="/templates" className="icon-btn" aria-label={t('Zurück')}><ArrowLeft /></Link>
        <input className="title-input" defaultValue={tpl.name} onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== tpl.name) patch(`/api/v1/templates/${id}`, { name }).then(() => qc.invalidateQueries({ queryKey: ['templates'] })).catch((x) => toast(errorText(x), 'error'));
          }} aria-label={t('Name der Vorlage')} id="tpl-name" />
        <span className="save-state">{saving}</span>
        <span className="pill pill-plain">{tpl.current_version ? `v${tpl.current_version}` : t('Entwurf')}</span>
        {tpl.versions.length > 0 && (
          <Menu trigger={(open) => <button className="btn btn-ghost btn-sm" onClick={open}><History /> {t('Versionen')}</button>}>
            {() => tpl.versions.map((v: any) => <button key={v.id}><span className="mono">v{v.version}</span> {fmtDate(v.created_at)} {v.note && `– ${v.note}`}</button>)}
          </Menu>
        )}
        <Link to="/forms" className="btn btn-ghost btn-sm" title={t('Als öffentliches Formular teilen')}><Globe2 /></Link>
        <button className="btn btn-primary" onClick={async () => { await save(); setPublish(true); }}><UploadCloud /> {t('Veröffentlichen')}</button>
      </header>
      <Studio
        docs={sdocs}
        parties={parties}
        fields={fields}
        onChange={setFields}
        activeParty={active}
        setActiveParty={setActive}
        suggestions={suggestions}
        onAcceptSuggestions={() => {
          const add: FieldModel[] = [];
          for (const s of suggestions) add.push({ ...newField(s.type, s.doc, s.page, sdocs[s.doc].pages[s.page], null, active, [...fields, ...add], s.label), x: s.x, y: s.y, w: s.w, h: s.h });
          setFields([...fields, ...add]);
          setSuggestions([]);
        }}
        docTools={
          <label className="btn btn-sm btn-block" style={{ cursor: 'pointer' }}>
            <FilePlus2 /> {t('Dokument')}
            <input type="file" hidden multiple accept=".pdf,.docx,.doc,.odt,.rtf" onChange={(e) => addDoc([...(e.target.files ?? [])])} />
          </label>
        }
        inspectorExtra={rolesPanel}
      />
      {docs.length === 0 && (
        <div className="drop-veil" style={{ pointerEvents: 'auto' }}>
          <label className="drop-card" style={{ cursor: 'pointer' }}>
            <h2 className="display">{t('Dokument für die Vorlage')}</h2>
            <p className="muted">{t('PDF, Word oder ODT auswählen')}</p>
            <Link to="/templates" className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}>{t('Zurück')}</Link>
            <input type="file" hidden accept=".pdf,.docx,.doc,.odt,.rtf" onChange={(e) => addDoc([...(e.target.files ?? [])])} />
          </label>
        </div>
      )}
      {publish && <PublishDialog id={id!} onClose={() => setPublish(false)} onDone={() => { setPublish(false); loaded.current = true; qc.invalidateQueries({ queryKey: ['template', id, 'edit'] }); }} />}
    </div>
  );
}

function PublishDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  return (
    <Dialog
      title={t('Neue Version veröffentlichen')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary" onClick={async () => { try { const r = await post(`/api/v1/templates/${id}/publish`, { note }); toast(t('Version {v} veröffentlicht', { v: r.version })); onDone(); } catch (e) { setErr(errorText(e)); } }}>{t('Veröffentlichen')}</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">{t('Neue Vorgänge verwenden ab sofort diese Version. Bereits versendete Vorgänge behalten ihre Fassung unverändert.')}</p>
        <div className="field"><label className="label">{t('Was hat sich geändert? (optional)')}</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></div>
        {err && <Callout kind="stop">{err}</Callout>}
      </div>
    </Dialog>
  );
}
