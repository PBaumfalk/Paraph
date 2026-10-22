import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, FileStack, ArrowRight, Search, Upload } from 'lucide-react';
import { Avatar, Menu, Paraph, Spinner, StatusPill } from '../components/ui';
import { useNewEnvelope } from '../components/Shell';
import { get } from '../lib/api';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { fmtRelative } from '../lib/format';

type Tab = 'me' | 'out' | 'draft' | 'done' | 'closed';

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? t('Guten Morgen') : h < 18 ? t('Guten Tag') : t('Guten Abend');
}

export function RouteLine({ recipients }: { recipients: any[] }) {
  const rs = recipients.filter((r) => r.kind !== 'viewer' && r.status !== 'delegated').sort((a, b) => a.routing_order - b.routing_order);
  return (
    <div className="route" aria-label={rs.map((r) => `${r.name}: ${r.status}`).join(', ')}>
      {rs.map((r, i) => (
        <span key={r.id} className="row" style={{ gap: 0 }}>
          {i > 0 && <span className={`seg ${rs[i - 1].status === 'completed' ? 'done' : ''}`} style={{ width: rs[i].routing_order === rs[i - 1].routing_order ? 4 : 18 }} />}
          <Avatar name={r.name} status={r.status} title={`${r.name} · ${r.email}`} />
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { me } = useSession();
  const nav = useNavigate();
  const ne = useNewEnvelope();
  const [tab, setTab] = useState<Tab>('out');
  const [search, setSearch] = useState('');
  const canWrite = me?.permissions.includes('envelope.write');
  const all = useQuery({ queryKey: ['envelopes', search], queryFn: () => get(`/api/v1/envelopes?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  const tpls = useQuery({ queryKey: ['templates'], queryFn: () => get('/api/v1/templates') });
  const email = me?.principal.email?.toLowerCase();
  const groups = useMemo(() => {
    const d = (all.data?.data ?? []) as any[];
    return {
      me: d.filter((e) => e.status === 'sent' && e.recipients.some((r: any) => r.email.toLowerCase() === email && ['sent', 'opened'].includes(r.status))),
      out: d.filter((e) => e.status === 'sent'),
      draft: d.filter((e) => e.status === 'draft'),
      done: d.filter((e) => e.status === 'completed'),
      closed: d.filter((e) => ['declined', 'voided', 'expired'].includes(e.status)),
    } as Record<Tab, any[]>;
  }, [all.data, email]);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'me', label: t('Bei mir') },
    { id: 'out', label: t('Unterwegs') },
    { id: 'draft', label: t('Entwürfe') },
    { id: 'done', label: t('Erledigt') },
    { id: 'closed', label: t('Beendet') },
  ];
  const list = groups[tab];
  const usable = ((tpls.data?.data ?? []) as any[]).filter((x) => x.current_version > 0).slice(0, 4);
  const first = (all.data?.data ?? []).length === 0 && !search;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{greeting()}, {me?.principal.name.split(' ')[0]}.</h1>
          <p className="sub">
            {groups.out.length === 0
              ? t('Gerade ist nichts unterwegs.')
              : t('{n} Vorgänge warten auf Unterschriften.', { n: groups.out.length })}
          </p>
        </div>
      </div>

      {canWrite && (
        <div className="greeting-strip">
          <button className="dropzone" onClick={ne.pick}>
            <span className="paper-icon"><Upload size={20} color="var(--tinte)" /></span>
            <span className="grow">
              <h2>{t('Dokument unterschreiben lassen')}</h2>
              <span className="muted">{t('PDF, Word oder ODT hierher ziehen oder auswählen. Danach Beteiligte und Felder festlegen.')}</span>
            </span>
            <ArrowRight size={18} color="var(--ink-3)" />
          </button>
          <div className="sheet quick-templates">
            <div className="row"><div className="eyebrow grow">{t('Aus Vorlage')}</div><Link to="/templates" className="hint">{t('Alle')}</Link></div>
            {usable.length ? (
              <ul>
                {usable.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => nav(`/templates?use=${x.id}`)}>
                      <FileStack size={16} color="var(--tinte)" />
                      <span className="grow">{x.name}</span>
                      <span className="muted mono" style={{ fontSize: 11 }}>v{x.current_version}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>{t('Wiederkehrende Dokumente wie Vollmacht oder Mandatsvereinbarung einmal als Vorlage einrichten – dann reichen Name und E-Mail.')}</p>
            )}
          </div>
        </div>
      )}

      <div className="row row-wrap" style={{ marginBottom: 12 }}>
        <div className="tabs grow" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} role="tab" className="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
              {x.label}
              <span className="count">{groups[x.id].length}</span>
            </button>
          ))}
        </div>
        <label className="row" style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, color: 'var(--ink-3)' }} />
          <input className="input" style={{ paddingLeft: 32, width: 230, height: 36 }} placeholder={t('Titel, Name, E-Mail')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('Suchen')} />
        </label>
      </div>

      <div className="sheet">
        {all.isLoading ? (
          <div style={{ padding: 40 }}><Spinner /></div>
        ) : list.length === 0 ? (
          <div className="empty">
            {first ? (
              <>
                <Paraph size={72} draw />
                <h3>{t('Hier beginnt Ihre Unterschriftenmappe')}</h3>
                <p>{t('Ziehen Sie ein PDF irgendwo auf diese Seite. Paraph führt Sie in drei Schritten zum Versand.')}</p>
                {canWrite && <button className="btn btn-primary" onClick={ne.pick}>{t('Erstes Dokument hochladen')}</button>}
              </>
            ) : (
              <>
                <h3>{tab === 'me' ? t('Nichts wartet auf Sie') : tab === 'draft' ? t('Keine Entwürfe') : t('Keine Vorgänge')}</h3>
                <p>{search ? t('Keine Treffer für „{q}“.', { q: search }) : tab === 'out' ? t('Versendete Dokumente erscheinen hier, bis alle unterschrieben haben.') : ''}</p>
              </>
            )}
          </div>
        ) : (
          <div className="env-list">
            {list.map((e) => {
              const next = e.recipients.filter((r: any) => ['sent', 'opened'].includes(r.status));
              const done = e.recipients.filter((r: any) => r.kind !== 'viewer' && r.status === 'completed').length;
              const total = e.recipients.filter((r: any) => r.kind !== 'viewer' && r.status !== 'delegated').length;
              return (
                <Link key={e.id} to={e.status === 'draft' ? `/envelopes/${e.id}/edit` : `/envelopes/${e.id}`} className="env-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="env-title">{e.title}</div>
                    <div className="env-meta">
                      {e.status !== 'sent' && <StatusPill status={e.status} />}
                      {e.status === 'sent' && (
                        <span>
                          {next.length ? t('Wartet auf {names}', { names: next.map((r: any) => r.name).join(', ') }) : t('Wird abgeschlossen …')}
                        </span>
                      )}
                      {e.status !== 'draft' && <span className="mono">{done}/{total}</span>}
                      {e.external_ref && <span className="mono">· {e.external_ref}</span>}
                    </div>
                  </div>
                  <div className="route-col"><RouteLine recipients={e.recipients} /></div>
                  <div className="env-time" title={e.updated_at}>{fmtRelative(e.updated_at)}</div>
                  <div className="menu-col" onClick={(ev) => ev.preventDefault()}>
                    <Menu trigger={(open) => <button className="icon-btn" onClick={open} aria-label={t('Aktionen')}><MoreHorizontal /></button>}>
                      {() => (
                        <>
                          <button onClick={() => nav(`/envelopes/${e.id}`)}>{t('Öffnen')}</button>
                          {e.status === 'completed' && <a href={`/api/v1/envelopes/${e.id}/files/final`}>{t('PDF herunterladen')}</a>}
                        </>
                      )}
                    </Menu>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
