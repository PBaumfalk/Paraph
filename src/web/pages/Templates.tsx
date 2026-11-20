import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileStack, MoreHorizontal, Send, Users, Pencil, Copy, Archive, FolderPlus, Upload, Download, Lock } from 'lucide-react';
import { Callout, Dialog, Menu, Spinner, errorText, useToast } from '../components/ui';
import { ContactInput } from './EnvelopeEditor';
import { api, get, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { fmtRelative } from '../lib/format';

export default function Templates() {
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { me } = useSession();
  const [sp, setSp] = useSearchParams();
  const [folder, setFolder] = useState<string>('');
  const [archived, setArchived] = useState(false);
  const tpls = useQuery({ queryKey: ['templates', folder, archived], queryFn: () => get(`/api/v1/templates?${folder ? `folder=${folder}&` : ''}${archived ? 'archived=true' : ''}`) });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => get('/api/v1/folders') });
  const [use, setUse] = useState<string | null>(sp.get('use'));
  const [bulk, setBulk] = useState<any>(null);
  const [create, setCreate] = useState(false);
  const [folderDlg, setFolderDlg] = useState<string | null>(null);
  const canWrite = me?.permissions.includes('template.write');
  // Verwenden und Massenversand legen Vorgänge an – das braucht envelope.write (nicht „Nur lesen“)
  const canSend = me?.permissions.includes('envelope.write');
  useEffect(() => setUse(sp.get('use')), [sp]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['templates'] });
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{t('Vorlagen')}</h1>
          <p className="sub">{t('Einmal einrichten, danach mit Name und E-Mail versenden. Jede Veröffentlichung ist eine feste Version – laufende Vorgänge bleiben unberührt.')}</p>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={() => setCreate(true)}><Plus /> {t('Neue Vorlage')}</button>}
      </div>
      <div className="row row-wrap" style={{ marginBottom: 14 }}>
        <div className="tabs grow">
          <button className="tab" aria-selected={!folder && !archived} onClick={() => { setFolder(''); setArchived(false); }}>{t('Alle')}</button>
          {(folders.data?.data ?? []).map((f: any) => <button key={f.id} className="tab" aria-selected={folder === f.id} onClick={() => { setFolder(f.id); setArchived(false); }}>{f.name}</button>)}
          <button className="tab" aria-selected={archived} onClick={() => { setArchived(true); setFolder(''); }}>{t('Archiv')}</button>
        </div>
        {canWrite && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFolderDlg('')}>
            <FolderPlus /> {t('Ordner')}
          </button>
        )}
      </div>
      {tpls.isLoading ? <Spinner /> : (tpls.data?.data ?? []).length === 0 ? (
        <div className="sheet empty">
          <FileStack size={40} color="var(--tinte)" />
          <h3>{archived ? t('Archiv ist leer') : t('Noch keine Vorlagen')}</h3>
          <p>{t('Typisch für Kanzleien: Mandatsvereinbarung, Vergütungsvereinbarung, Vollmacht, Empfangsbestätigung.')}</p>
          {canWrite && !archived && <button className="btn btn-primary" onClick={() => setCreate(true)}>{t('Erste Vorlage anlegen')}</button>}
        </div>
      ) : (
        <div className="tpl-grid">
          {tpls.data.data.map((x: any) => (
            <article key={x.id} className="sheet tpl-card">
              <div className="tpl-paper"><FileStack /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <h3>{x.name} {x.visibility === 'private' && <Lock size={13} style={{ display: 'inline', verticalAlign: -1 }} aria-label={t('Privat')} />}</h3>
                <p className="hint">
                  {x.current_version ? `v${x.current_version}` : t('nicht veröffentlicht')}
                  {x.has_unpublished_changes && x.current_version ? ` · ${t('Änderungen offen')}` : ''}
                  {x.published && ` · ${x.published.roles.map((r: any) => r.name).join(', ')}`}
                </p>
                <p className="hint">{x.usage_count ? t('{n}× verwendet, zuletzt {when}', { n: x.usage_count, when: fmtRelative(x.last_used_at) }) : t('noch nicht verwendet')}</p>
              </div>
              <div className="tpl-actions">
                {canSend && <button className="btn btn-primary btn-sm" disabled={!x.current_version} onClick={() => setUse(x.id)}><Send /> {t('Verwenden')}</button>}
                <Menu trigger={(open) => <button className="icon-btn" onClick={open} aria-label={t('Aktionen')}><MoreHorizontal /></button>}>
                  {() => (
                    <>
                      {canWrite && <button onClick={() => nav(`/templates/${x.id}/edit`)}><Pencil /> {t('Bearbeiten')}</button>}
                      {canSend && x.current_version > 0 && <button onClick={() => setBulk(x)}><Users /> {t('Massenversand')}</button>}
                      {canWrite && <button onClick={async () => { const r = await post(`/api/v1/templates/${x.id}/duplicate`); nav(`/templates/${r.id}/edit`); }}><Copy /> {t('Duplizieren')}</button>}
                      {canWrite && (folders.data?.data ?? []).length > 0 && (folders.data.data as any[]).map((f) => (
                        <button key={f.id} onClick={async () => { await patch(`/api/v1/templates/${x.id}`, { folder_id: f.id }); refresh(); }}>→ {f.name}</button>
                      ))}
                      {canWrite && <button onClick={async () => { await patch(`/api/v1/templates/${x.id}`, { archived: !x.archived }); refresh(); toast(x.archived ? t('Wiederhergestellt') : t('Archiviert')); }}><Archive /> {x.archived ? t('Wiederherstellen') : t('Archivieren')}</button>}
                    </>
                  )}
                </Menu>
              </div>
            </article>
          ))}
        </div>
      )}
      {use && <UseTemplateDialog id={use} onClose={() => { setUse(null); sp.delete('use'); setSp(sp, { replace: true }); }} />}
      {bulk && <BulkDialog tpl={bulk} onClose={() => setBulk(null)} />}
      {folderDlg !== null && (
        <Dialog
          title={t('Neuer Ordner')}
          onClose={() => setFolderDlg(null)}
          footer={<><button className="btn" onClick={() => setFolderDlg(null)}>{t('Abbrechen')}</button><button className="btn btn-primary" disabled={!folderDlg.trim()} onClick={async () => { try { await post('/api/v1/folders', { name: folderDlg.trim() }); qc.invalidateQueries({ queryKey: ['folders'] }); setFolderDlg(null); } catch (e) { toast(errorText(e), 'error'); } }}>{t('Anlegen')}</button></>}
        >
          <div className="field"><label className="label" htmlFor="fname">{t('Name des Ordners')}</label><input id="fname" className="input" value={folderDlg} onChange={(e) => setFolderDlg(e.target.value)} autoFocus /></div>
        </Dialog>
      )}
      {create && (
        <CreateDialog
          folders={folders.data?.data ?? []}
          onClose={() => setCreate(false)}
          onCreated={(id) => nav(`/templates/${id}/edit`)}
        />
      )}
    </div>
  );
}

const STARTERS = [
  { name: 'Mandatsvereinbarung', roles: ['Mandant'] },
  { name: 'Vergütungsvereinbarung', roles: ['Mandant'] },
  { name: 'Vollmacht', roles: ['Vollmachtgeber'] },
  { name: 'Empfangsbestätigung', roles: ['Empfänger'] },
  { name: 'Schweigepflichtentbindung', roles: ['Mandant'] },
];

function CreateDialog({ folders, onClose, onCreated }: { folders: any[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [vis, setVis] = useState<'org' | 'private'>('org');
  const toast = useToast();
  return (
    <Dialog
      title={t('Neue Vorlage')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={async () => {
            try {
              const r = await post('/api/v1/templates', { name, folder_id: folder || null, visibility: vis });
              const starter = STARTERS.find((s) => s.name === name);
              if (starter) await api('PUT', `/api/v1/templates/${r.id}/draft`, { roles: starter.roles.map((n, i) => ({ key: n.toLowerCase().replace(/[^a-z]/g, '') || `rolle${i}`, name: n, kind: 'signer', routing_order: 1, auth_method: 'email_otp' })), settings: { title: `${name} – {{${starter.roles[0]}.name}}` } });
              onCreated(r.id);
            } catch (e) { toast(errorText(e), 'error'); }
          }}>{t('Anlegen und Dokument hochladen')}</button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label className="label" htmlFor="tn">{t('Name')}</label>
          <input id="tn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="row row-wrap" style={{ gap: 6 }}>{STARTERS.map((s) => <button key={s.name} className="btn btn-sm" onClick={() => setName(s.name)}>{t(s.name)}</button>)}</div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">{t('Ordner')}</label>
            <select className="select" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">—</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </div>
          <div className="field">
            <label className="label">{t('Sichtbar für')}</label>
            <select className="select" value={vis} onChange={(e) => setVis(e.target.value as any)}><option value="org">{t('Ganze Organisation')}</option><option value="private">{t('Nur mich')}</option></select>
          </div>
        </div>
        <Callout>{t('Die mitgelieferten Namen sind nur Startpunkte. Inhalt und Wirksamkeit Ihrer Vorlagen prüfen Sie bitte vor dem produktiven Einsatz selbst.')}</Callout>
      </div>
    </Dialog>
  );
}

export function UseTemplateDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['template', id], queryFn: () => get(`/api/v1/templates/${id}`) });
  const [rec, setRec] = useState<Record<string, { name: string; email: string }>>({});
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const smtp = useSession().me?.features.smtp ?? true;
  const [notify, setNotify] = useState(smtp);
  const [ack, setAck] = useState<any[] | null>(null);
  const [acked, setAcked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<any[] | null>(null);
  if (q.isLoading || !q.data) return <Dialog title={t('Vorlage')} onClose={onClose}><Spinner /></Dialog>;
  const p = q.data.published;
  if (!p) return <Dialog title={q.data.name} onClose={onClose}><Callout kind="warn">{t('Diese Vorlage ist noch nicht veröffentlicht.')}</Callout></Dialog>;
  const roles = p.roles.filter((r: any) => !r.default_email);
  const fixed = p.roles.filter((r: any) => r.default_email);
  const prefillable = p.fields.filter((f: any) => ['text', 'number', 'date', 'name', 'email', 'select'].includes(f.type) && (f.config?.readonly || f.config?.prefill !== undefined || /aktenzeichen|az|referenz|betrag|honorar|stundensatz/i.test(f.key + f.label)));
  const ok = roles.every((r: any) => rec[r.key]?.name?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rec[r.key]?.email ?? ''));
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post(`/api/v1/templates/${id}/envelopes`, { recipients: rec, prefill: Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== '')), notify, acknowledge_form_risk: acked || undefined });
      if (!notify && r.signing_links?.length) setLinks(r.signing_links);
      else {
        toast(t('Versendet'));
        nav(`/envelopes/${r.id}`);
      }
    } catch (e: any) {
      if (e.code === 'form_ack_required') setAck(e.details?.rules ?? []);
      else toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  if (links)
    return (
      <Dialog title={t('Persönliche Links')} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{t('Fertig')}</button>}>
        <div className="stack">
          <Callout kind="warn">{t('Diese Links werden nur jetzt angezeigt.')}</Callout>
          {links.map((l) => <div key={l.recipient_id} className="secret-box">{l.email}: {l.url}</div>)}
        </div>
      </Dialog>
    );
  return (
    <Dialog
      title={q.data.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary" disabled={!ok || busy || (!!ack && !acked)} onClick={submit}><Send /> {notify ? t('Versenden') : t('Starten und Links anzeigen')}</button>
        </>
      }
    >
      <div className="stack">
        {roles.map((r: any) => (
          <div key={r.key} className="stack-sm">
            <div className="eyebrow">{r.name}</div>
            <div className="grid-2">
              <ContactInput value={rec[r.key]?.name ?? ''} placeholder={t('Name')} autoFocus={r === roles[0]} onChange={(v) => setRec({ ...rec, [r.key]: { ...rec[r.key], name: v } })} onPick={(c) => setRec({ ...rec, [r.key]: { name: c.name, email: c.email } })} />
              <ContactInput type="email" value={rec[r.key]?.email ?? ''} placeholder={t('E-Mail-Adresse')} onChange={(v) => setRec({ ...rec, [r.key]: { ...rec[r.key], email: v.trim() } })} onPick={(c) => setRec({ ...rec, [r.key]: { name: c.name, email: c.email } })} />
            </div>
          </div>
        ))}
        {fixed.length > 0 && <p className="hint">{t('Außerdem: {list}', { list: fixed.map((r: any) => `${r.name} (${r.default_name})`).join(', ') })}</p>}
        {prefillable.length > 0 && (
          <div className="stack-sm">
            <div className="eyebrow">{t('Vorbelegen')}</div>
            {prefillable.map((f: any) => (
              <div key={f.key} className="field">
                <label className="label">{f.label}</label>
                <input className="input" value={prefill[f.key] ?? ''} placeholder={f.config?.prefill ?? ''} onChange={(e) => setPrefill({ ...prefill, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('Einladungen per E-Mail senden')}</label>
        {!smtp && <p className="hint">{t('Auf diesem Server ist kein E-Mail-Versand eingerichtet. Geben Sie die Links selbst weiter.')}</p>}
        {ack && (
          <>
            {ack.map((r: any) => <Callout key={r.id} kind={r.min_level === 'PAPER' || r.min_level === 'NOTARY' ? 'stop' : 'warn'}><strong>{r.label} – {r.norm}</strong><div>{r.hint}</div></Callout>)}
            <label className="check ack"><input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} /> {t('Ich habe den Formhinweis gelesen und versende trotzdem. Die Bestätigung wird protokolliert.')}</label>
          </>
        )}
      </div>
    </Dialog>
  );
}

function BulkDialog({ tpl, onClose }: { tpl: any; onClose: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const run = async (dry: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api('POST', `/api/v1/templates/${tpl.id}/bulk?dry_run=${dry}&acknowledge_form_risk=${ack}`, fd);
      setRes({ ...r, dry });
      if (!dry) toast(t('{n} Vorgänge versendet', { n: r.ok }));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      wide
      title={t('Massenversand: {name}', { name: tpl.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Schließen')}</button>
          {res?.dry && res.ok > 0 && <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}><Send /> {t('{n} Vorgänge jetzt versenden', { n: res.ok })}</button>}
          {!res?.dry && <button className="btn btn-primary" disabled={!file || busy} onClick={() => run(true)}>{t('Datei prüfen')}</button>}
        </>
      }
    >
      <div className="stack">
        <p className="muted">{t('Eine Zeile pro Vorgang. Spalten: Rolle.name und Rolle.email je Rolle, dazu optional Feldnamen zum Vorbelegen. CSV (Komma oder Semikolon) oder Excel (XLSX).')}</p>
        <div className="row row-wrap">
          <a className="btn btn-sm" href={`/api/v1/templates/${tpl.id}/bulk-template.csv`}><Download /> {t('Spaltenvorlage herunterladen')}</a>
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}><Upload /> {file ? file.name : t('Datei auswählen')}<input type="file" hidden accept=".csv,.xlsx,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {t('Formhinweise der Vorlage sind mir bekannt (falls vorhanden; wird protokolliert)')}</label>
        {res && (
          <>
            <Callout kind={res.failed ? 'warn' : 'done'}>{res.dry ? t('Probelauf: {ok} von {total} Zeilen sind in Ordnung.', { ok: res.ok, total: res.total }) : t('{ok} versendet, {f} fehlgeschlagen.', { ok: res.ok, f: res.failed })}</Callout>
            <div className="sheet table-scroll" style={{ maxHeight: 300, overflow: 'auto' }}>
              <table className="kv-table">
                <thead><tr><th>{t('Zeile')}</th><th>{t('E-Mail')}</th><th>{t('Ergebnis')}</th></tr></thead>
                <tbody>{res.results.map((r: any) => <tr key={r.row}><td className="mono">{r.row}</td><td>{r.email ?? '—'}</td><td>{r.ok ? <span className="pill pill-done">{res.dry ? t('bereit') : t('versendet')}</span> : <span className="error-text">{r.error}</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
