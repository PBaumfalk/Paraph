import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, FileStack, Globe2, Activity as ActivityIcon, Settings, Plus, Search, LogOut, Menu as MenuIcon, ChevronsUpDown, Languages, ShieldCheck, BookOpen, Check, FileText } from 'lucide-react';
import { Logo, Menu, Paraph, useToast, errorText } from './ui';
import { useSession } from '../lib/session';
import { get, post, upload } from '../lib/api';
import { setLang, getLang, t } from '../lib/i18n';

const ACCEPT = '.pdf,.docx,.doc,.odt,.rtf,application/pdf';

/** Startet einen Vorgang aus Dateien und öffnet den Editor. */
export function useNewEnvelope() {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<null | { name: string; p: number }>(null);
  const start = async (files: File[]) => {
    if (!files.length) return;
    const title = files[0].name.replace(/\.(pdf|docx?|odt|rtf)$/i, '').replace(/[_-]+/g, ' ').trim() || t('Neues Dokument');
    try {
      setBusy({ name: files[0].name, p: 0 });
      const env = await post('/api/v1/envelopes', { title });
      for (const f of files) {
        setBusy({ name: f.name, p: 0 });
        await upload(`/api/v1/envelopes/${env.id}/documents`, f, (p) => setBusy({ name: f.name, p }));
      }
      nav(`/envelopes/${env.id}/edit`);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const pick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = ACCEPT;
    i.multiple = true;
    i.onchange = () => start([...(i.files ?? [])]);
    i.click();
  };
  return { start, pick, busy };
}

function OrgSwitcher() {
  const { auth, me, refresh } = useSession();
  const qc = useQueryClient();
  const orgs = auth.session?.orgs ?? [];
  return (
    <Menu
      align="left"
      trigger={(open) => (
        <button className="org-switch" onClick={open} aria-label={t('Organisation wechseln')}>
          <span className="org-mark">{me?.org.name.slice(0, 1)}</span>
          <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
            <span className="org-name">{me?.org.name}</span>
            <span className="org-role">{t(roleLabel(me?.principal.role ?? ''))}</span>
          </span>
          {orgs.length > 1 && <ChevronsUpDown size={15} />}
        </button>
      )}
    >
      {() =>
        orgs.map((o) => (
          <button
            key={o.id}
            onClick={async () => {
              await post('/api/auth/switch-org', { org_id: o.id });
              qc.clear();
              await refresh();
              location.assign('/');
            }}
          >
            {o.id === auth.session?.org_id ? <Check /> : <span style={{ width: 16 }} />}
            {o.name}
          </button>
        ))
      }
    </Menu>
  );
}

export function roleLabel(r: string) {
  return ({ owner: 'Inhaber', admin: 'Administration', member: 'Mitglied', viewer: 'Nur lesen' } as Record<string, string>)[r] ?? r;
}

function CommandPalette({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const envs = useQuery({ queryKey: ['palette-envs', q], queryFn: () => get(`/api/v1/envelopes?limit=8&search=${encodeURIComponent(q)}`), enabled: true });
  const tpls = useQuery({ queryKey: ['templates'], queryFn: () => get('/api/v1/templates') });
  const actions = [
    { label: t('Neues Dokument hochladen'), icon: <Plus />, run: onNew },
    { label: t('Vorlagen öffnen'), icon: <FileStack />, run: () => nav('/templates') },
    { label: t('Dokument prüfen'), icon: <ShieldCheck />, run: () => window.open('/verify', '_blank') },
    { label: t('Einstellungen'), icon: <Settings />, run: () => nav('/settings') },
    { label: t('API-Dokumentation'), icon: <BookOpen />, run: () => window.open('/docs/api', '_blank') },
  ].filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  const items = [
    ...actions.map((a) => ({ ...a, group: t('Aktionen') })),
    ...((tpls.data?.data ?? []) as any[])
      .filter((x) => x.current_version > 0 && x.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((x) => ({ label: x.name, icon: <FileStack />, group: t('Vorlage verwenden'), run: () => nav(`/templates?use=${x.id}`) })),
    ...((envs.data?.data ?? []) as any[]).map((e) => ({ label: e.title, icon: <FileText />, group: t('Vorgänge'), run: () => nav(e.status === 'draft' ? `/envelopes/${e.id}/edit` : `/envelopes/${e.id}`) })),
  ];
  useEffect(() => setSel(0), [q]);
  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={t('Befehle')}>
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Vorgänge, Vorlagen, Aktionen …')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter' && items[sel]) { items[sel].run(); onClose(); }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list">
          {items.map((it, i) => (
            <div key={i}>
              {(i === 0 || items[i - 1].group !== it.group) && <div className="palette-group">{it.group}</div>}
              <button className="palette-item" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => { it.run(); onClose(); }}>
                {it.icon}
                <span className="grow">{it.label}</span>
              </button>
            </div>
          ))}
          {!items.length && <div className="muted" style={{ padding: 20 }}>{t('Nichts gefunden.')}</div>}
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, auth } = useSession();
  const [palette, setPalette] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const ne = useNewEnvelope();
  const canWrite = !!me?.permissions.includes('envelope.write');
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => get('/api/v1/envelopes/stats'), refetchInterval: 60_000 });
  const qc = useQueryClient();

  // Live-Aktualisierung über Server-Sent Events
  useEffect(() => {
    const es = new EventSource('/api/v1/events');
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] });
      qc.invalidateQueries({ queryKey: ['envelope'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    };
    for (const ev of ['recipient.viewed', 'recipient.signed', 'recipient.declined', 'envelope.completed', 'envelope.sent', 'envelope.voided', 'envelope.expired', 'recipient.delegated']) es.addEventListener(ev, refresh);
    return () => es.close();
  }, [qc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  const nav = useMemo(
    () => [
      { to: '/', label: t('Übersicht'), icon: <Inbox />, badge: stats.data?.waiting_on_me },
      { to: '/templates', label: t('Vorlagen'), icon: <FileStack /> },
      { to: '/forms', label: t('Formulare'), icon: <Globe2 /> },
      ...(me?.permissions.includes('activity.read') ? [{ to: '/activity', label: t('Aktivität'), icon: <ActivityIcon /> }] : []),
      { to: '/settings', label: t('Einstellungen'), icon: <Settings /> },
    ],
    [me, stats.data, getLang()],
  );

  return (
    <div
      className="shell"
      onDragEnter={(e) => {
        if (!canWrite || !e.dataTransfer.types.includes('Files')) return;
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => canWrite && e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length || !canWrite) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        // Im Editor übernimmt der Editor selbst
        if ((e.target as HTMLElement).closest('[data-own-drop]')) return;
        ne.start([...e.dataTransfer.files]);
      }}
    >
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`} onClick={() => setMobileNav(false)}>
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-logo" aria-label="Paraph">
            <Logo small />
          </NavLink>
        </div>
        {canWrite && (
          <button className="btn btn-primary btn-block new-btn" onClick={ne.pick}>
            <Plus /> {t('Neues Dokument')}
          </button>
        )}
        <button className="search-btn" onClick={() => setPalette(true)}>
          <Search size={15} />
          <span className="grow">{t('Suchen')}</span>
          <span className="kbd">⌘K</span>
        </button>
        <nav className="sidenav" aria-label={t('Hauptnavigation')}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="sidenav-link">
              {n.icon}
              <span className="grow">{n.label}</span>
              {n.badge ? <span className="badge">{n.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <OrgSwitcher />
          <Menu
            align="left"
            trigger={(open) => (
              <button className="user-btn" onClick={open}>
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>{me?.principal.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <span className="grow" style={{ textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.principal.name}</span>
              </button>
            )}
          >
            {() => (
              <>
                <NavLink to="/settings/profile">
                  <Settings /> {t('Profil und Sicherheit')}
                </NavLink>
                <button onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}>
                  <Languages /> {getLang() === 'de' ? 'English' : 'Deutsch'}
                </button>
                <button
                  onClick={async () => {
                    await post('/api/auth/logout');
                    location.assign('/login');
                  }}
                >
                  <LogOut /> {t('Abmelden')}
                </button>
              </>
            )}
          </Menu>
          <div className="version mono">v{auth.version}</div>
        </div>
      </aside>
      <div className="mobilebar">
        <button className="icon-btn" onClick={() => setMobileNav(true)} aria-label={t('Menü')}>
          <MenuIcon />
        </button>
        <Logo small />
        <button className="icon-btn" onClick={() => setPalette(true)} aria-label={t('Suchen')}>
          <Search />
        </button>
      </div>
      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}
      <main className="main">{children}</main>
      {palette && <CommandPalette onClose={() => setPalette(false)} onNew={ne.pick} />}
      {dragging && (
        <div className="drop-veil">
          <div className="drop-card">
            <Paraph size={64} draw />
            <h2 className="display">{t('Loslassen, um einen Vorgang zu starten')}</h2>
            <p className="muted">{t('PDF, Word oder ODT – mehrere Dateien werden ein Vorgang.')}</p>
          </div>
        </div>
      )}
      {ne.busy && (
        <div className="drop-veil">
          <div className="drop-card">
            <Paraph size={64} className="spinner" />
            <h2 className="display">{t('Wird vorbereitet …')}</h2>
            <p className="muted">{ne.busy.name}</p>
            <div className="progress"><span style={{ width: `${Math.round(ne.busy.p * 100)}%` }} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
