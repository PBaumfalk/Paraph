import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, Plus, Copy, Trash2 } from 'lucide-react';
import { Callout, Dialog, Spinner, errorText, useToast } from '../components/ui';
import { del, get, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { fmtDate } from '../lib/format';

export default function Forms() {
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const forms = useQuery({ queryKey: ['public-forms'], queryFn: () => get('/api/v1/public-forms') });
  const tpls = useQuery({ queryKey: ['templates'], queryFn: () => get('/api/v1/templates') });
  const [create, setCreate] = useState<null | { template_id: string; title: string; require_otp: boolean; max_submissions: string }>(null);
  const canWrite = me?.permissions.includes('template.write');
  const refresh = () => qc.invalidateQueries({ queryKey: ['public-forms'] });
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="grow">
          <h1>{t('Öffentliche Formulare')}</h1>
          <p className="sub">{t('Ein Link für alle – etwa für eine Anmeldung auf Ihrer Website oder eine Empfangsbestätigung. Jede Person erhält einen eigenen Vorgang.')}</p>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={() => setCreate({ template_id: '', title: '', require_otp: true, max_submissions: '' })}><Plus /> {t('Neues Formular')}</button>}
      </div>
      {forms.isLoading ? <Spinner /> : forms.data.data.length === 0 ? (
        <div className="sheet empty">
          <Globe2 size={40} color="var(--tinte)" />
          <h3>{t('Noch keine öffentlichen Formulare')}</h3>
          <p>{t('Voraussetzung ist eine veröffentlichte Vorlage mit genau einer Rolle „im öffentlichen Formular ausfüllen“.')}</p>
        </div>
      ) : (
        <div className="sheet">
          {forms.data.data.map((f: any) => (
            <div key={f.id} className="recipient-card" style={{ gridTemplateColumns: '1fr auto auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className="recipient-name">{f.title}</div>
                <div className="recipient-sub">{f.template_name} · {t('{n} Einsendungen', { n: f.submissions })}{f.max_submissions ? ` / ${f.max_submissions}` : ''} · {f.require_otp ? t('mit E-Mail-Bestätigung') : t('ohne E-Mail-Bestätigung')} · {fmtDate(f.created_at, false)}</div>
                <div className="mono hint" style={{ overflowWrap: 'anywhere' }}>{f.url}</div>
              </div>
              <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(f.url); toast(t('Link kopiert')); }}><Copy /> {t('Link')}</button>
              {canWrite && (
                <div className="row">
                  <input type="checkbox" className="switch" checked={f.active} aria-label={t('Aktiv')} onChange={async (e) => { await patch(`/api/v1/public-forms/${f.id}`, { active: e.target.checked }); refresh(); }} />
                  <button className="icon-btn" aria-label={t('Löschen')} onClick={async () => { await del(`/api/v1/public-forms/${f.id}`); refresh(); }}><Trash2 /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {create && (
        <Dialog
          title={t('Neues öffentliches Formular')}
          onClose={() => setCreate(null)}
          footer={
            <>
              <button className="btn" onClick={() => setCreate(null)}>{t('Abbrechen')}</button>
              <button className="btn btn-primary" disabled={!create.template_id || !create.title} onClick={async () => {
                try {
                  await post('/api/v1/public-forms', { template_id: create.template_id, title: create.title, require_otp: create.require_otp, max_submissions: create.max_submissions ? Number(create.max_submissions) : null });
                  setCreate(null);
                  refresh();
                } catch (e) { toast(errorText(e), 'error'); }
              }}>{t('Anlegen')}</button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label className="label">{t('Vorlage')}</label>
              <select className="select" value={create.template_id} onChange={(e) => { const tp = tpls.data?.data.find((x: any) => x.id === e.target.value); setCreate({ ...create, template_id: e.target.value, title: create.title || tp?.name || '' }); }}>
                <option value="">—</option>
                {(tpls.data?.data ?? []).filter((x: any) => x.current_version > 0).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">{t('Titel auf der Seite')}</label><input className="input" value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} /></div>
            <label className="check"><input type="checkbox" checked={create.require_otp} onChange={(e) => setCreate({ ...create, require_otp: e.target.checked })} /> {t('E-Mail-Adresse per Code bestätigen lassen (empfohlen)')}</label>
            <div className="field"><label className="label">{t('Höchstens … Einsendungen (optional)')}</label><input className="input" type="number" min={1} value={create.max_submissions} onChange={(e) => setCreate({ ...create, max_submissions: e.target.value })} style={{ maxWidth: 160 }} /></div>
            <Callout>{t('Ohne E-Mail-Bestätigung kann jede Person unter beliebigem Namen unterschreiben. Das Protokoll weist dann nur IP-Adresse und Zeitpunkt aus.')}</Callout>
          </div>
        </Dialog>
      )}
    </div>
  );
}
