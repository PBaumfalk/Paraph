import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Plus, Trash2, RotateCw, Send, ShieldCheck, KeyRound, Download, Upload, Check } from 'lucide-react';
import { Callout, Dialog, Spinner, errorText, useConfirm, useToast } from '../../components/ui';
import { api, del, get, patch, post } from '../../lib/api';
import { useSession } from '../../lib/session';
import { getLang, setLang, t } from '../../lib/i18n';
import { fmtDate, fmtRelative, shortHash } from '../../lib/format';
import { roleLabel } from '../../components/Shell';

function Section({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="sheet" style={{ marginBottom: 18 }}>
      <div className="sheet-head">
        <div className="grow">
          <h2>{title}</h2>
          {sub && <p className="hint" style={{ marginTop: 2 }}>{sub}</p>}
        </div>
        {action}
      </div>
      <div className="sheet-pad">{children}</div>
    </section>
  );
}

function useSaver() {
  const toast = useToast();
  const { refresh } = useSession();
  const qc = useQueryClient();
  return async (fn: () => Promise<any>, ok = t('Gespeichert')) => {
    try {
      const r = await fn();
      toast(ok);
      await refresh();
      qc.invalidateQueries();
      return r;
    } catch (e) {
      toast(errorText(e), 'error');
      throw e;
    }
  };
}

export default function Settings() {
  const { me } = useSession();
  const can = (p: string) => !!me?.permissions.includes(p);
  const items = [
    { to: 'profile', label: t('Profil und Sicherheit') },
    ...(can('org.manage') ? [{ to: 'org', label: t('Organisation') }, { to: 'branding', label: t('Erscheinungsbild und E-Mails') }] : []),
    { to: 'team', label: t('Team') },
    ...(can('apikeys.manage') || can('webhooks.manage') ? [{ to: 'api', label: t('API und Webhooks') }] : []),
    ...(can('org.manage') ? [{ to: 'trust', label: t('Siegel und Signaturstufen') }] : []),
    ...(me?.principal.instance_admin ? [{ to: 'system', label: t('System') }] : []),
  ];
  return (
    <div className="page">
      <div className="page-head"><h1>{t('Einstellungen')}</h1></div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {items.map((i) => <NavLink key={i.to} to={`/settings/${i.to}`} className="sidenav-link">{i.label}</NavLink>)}
        </nav>
        <div>
          <Routes>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<Profile />} />
            <Route path="org" element={<Org />} />
            <Route path="branding" element={<Branding />} />
            <Route path="team" element={<Team />} />
            <Route path="api" element={<ApiSettings />} />
            <Route path="trust" element={<Trust />} />
            <Route path="system" element={<SystemPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { auth, me } = useSession();
  const save = useSaver();
  const [name, setName] = useState(me?.principal.name ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [totp, setTotp] = useState<null | { secret: string; uri: string; qr: string }>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const user = auth.session!.user;
  return (
    <>
      <Section title={t('Profil')}>
        <div className="stack">
          <div className="grid-2">
            <div className="field"><label className="label">{t('Name')}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label className="label">{t('E-Mail-Adresse')}</label><input className="input" value={user.email} disabled /></div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => save(() => patch('/api/v1/me', { name }))}>{t('Speichern')}</button>
            <div className="segmented">
              <button aria-pressed={getLang() === 'de'} onClick={() => { setLang('de'); patch('/api/v1/me', { locale: 'de' }); }}>Deutsch</button>
              <button aria-pressed={getLang() === 'en'} onClick={() => { setLang('en'); patch('/api/v1/me', { locale: 'en' }); }}>English</button>
            </div>
          </div>
        </div>
      </Section>
      <Section title={t('Passwort')} sub={user.has_password ? undefined : t('Sie melden sich per SSO an. Ein Passwort ist optional.')}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); save(() => post('/api/auth/password', pw), t('Passwort geändert; andere Sitzungen sind abgemeldet.')).then(() => setPw({ current: '', next: '' })).catch(() => {}); }}>
          <div className="grid-2">
            {user.has_password && <div className="field"><label className="label">{t('Aktuelles Passwort')}</label><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>}
            <div className="field"><label className="label">{t('Neues Passwort')}</label><input className="input" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
          </div>
          <div><button className="btn" disabled={pw.next.length < 10}>{t('Passwort ändern')}</button></div>
        </form>
      </Section>
      <Section title={t('Zwei-Faktor-Anmeldung')} sub={t('Zusätzlicher Code aus einer Authenticator-App (TOTP), z. B. Aegis, 1Password, Google Authenticator.')}>
        {user.totp_enabled ? (
          <div className="stack">
            <Callout kind="done">{t('Aktiv. Bei jeder Anmeldung wird ein Code abgefragt.')}</Callout>
            <div className="row">
              <input className="input" type="password" placeholder={t('Passwort zum Deaktivieren')} value={disablePw} onChange={(e) => setDisablePw(e.target.value)} style={{ maxWidth: 260 }} />
              <button className="btn btn-danger" onClick={() => save(() => post('/api/auth/totp/disable', { password: disablePw }), t('Zwei-Faktor deaktiviert'))}>{t('Deaktivieren')}</button>
            </div>
          </div>
        ) : totp ? (
          <div className="row row-wrap" style={{ alignItems: 'flex-start', gap: 24 }}>
            <img src={totp.qr} alt={t('QR-Code für die Authenticator-App')} width={180} height={180} style={{ borderRadius: 12, border: '1px solid var(--rule)' }} />
            <div className="stack grow">
              <p>{t('QR-Code scannen oder Schlüssel eingeben:')}</p>
              <code className="mono" style={{ wordBreak: 'break-all' }}>{totp.secret}</code>
              <div className="row">
                <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 160 }} />
                <button className="btn btn-primary" onClick={() => save(() => post('/api/auth/totp/enable', { code }), t('Zwei-Faktor aktiviert')).then(() => setTotp(null)).catch(() => {})}>{t('Aktivieren')}</button>
              </div>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={async () => { const r = await post('/api/auth/totp/start'); setTotp({ ...r, qr: await QRCode.toDataURL(r.uri, { margin: 1, width: 360 }) }); }}><KeyRound /> {t('Einrichten')}</button>
        )}
      </Section>
      <Section title={t('Sitzungen')}>
        <button className="btn" onClick={() => save(() => post('/api/auth/sessions/revoke-others'), t('Andere Sitzungen abgemeldet'))}>{t('Alle anderen Geräte abmelden')}</button>
      </Section>
    </>
  );
}

function Org() {
  const { me } = useSession();
  const save = useSaver();
  const [s, setS] = useState<any>({ ...me!.org.settings });
  const [name, setName] = useState(me!.org.name);
  const [domain, setDomain] = useState(me!.org.custom_domain ?? '');
  const [newOrg, setNewOrg] = useState('');
  return (
    <>
      <Section title={t('Organisation')}>
        <div className="stack">
          <div className="grid-2">
            <div className="field"><label className="label">{t('Name')}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label className="label">{t('Zeitzone')}</label><input className="input" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /></div>
            <div className="field"><label className="label">{t('Sprache für Beteiligte')}</label><select className="select" value={s.locale} onChange={(e) => setS({ ...s, locale: e.target.value })}><option value="de">Deutsch</option><option value="en">English</option></select></div>
            <div className="field">
              <label className="label">{t('Mitglieder sehen')}</label>
              <select className="select" value={s.envelopeVisibility} onChange={(e) => setS({ ...s, envelopeVisibility: e.target.value })}>
                <option value="own">{t('nur eigene Vorgänge')}</option>
                <option value="org">{t('alle Vorgänge der Organisation (nur lesen)')}</option>
              </select>
            </div>
            <div className="field"><label className="label">{t('Standard-Gültigkeit (Tage)')}</label><input className="input" type="number" min={1} max={365} value={s.defaultExpiryDays} onChange={(e) => setS({ ...s, defaultExpiryDays: Number(e.target.value) })} /></div>
            <div className="field"><label className="label">{t('Standard-Erinnerung (Tage, 0 = aus)')}</label><input className="input" type="number" min={0} max={30} value={s.defaultReminderDays} onChange={(e) => setS({ ...s, defaultReminderDays: Number(e.target.value) })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={s.appendCertificate} onChange={(e) => setS({ ...s, appendCertificate: e.target.checked })} /> {t('Abschlussbestätigung an das fertige PDF anhängen')}</label>
          <label className="check"><input type="checkbox" checked={s.attachCompletedPdf} onChange={(e) => setS({ ...s, attachCompletedPdf: e.target.checked })} /> {t('Fertiges PDF an die Abschluss-E-Mail anhängen (sonst nur persönlicher Link)')}</label>
          <p className="hint" style={{ marginTop: -4 }}>{t('Wo Textform genügt (z. B. § 3a RVG, Gewerbemiete), sollte jede Partei das unterschriebene PDF dauerhaft erhalten – ein Link allein ist dafür möglicherweise nicht ausreichend. Rechtliche Bewertung: docs/recht/FREIGABELISTE.md.')}</p>
          <div className="field">
            <label className="label" htmlFor="privacy-url">{t('Datenschutzhinweise für Unterzeichner (Art. 13 DSGVO)')}</label>
            <input id="privacy-url" className="input" type="url" placeholder="https://kanzlei.example/datenschutz" value={s.privacyUrl ?? ''} onChange={(e) => setS({ ...s, privacyUrl: e.target.value || null })} />
            <span className="hint">{t('Wird auf der Signaturseite neben der Erklärung verlinkt.')}</span>
          </div>
          <div className="field">
            <label className="label">{t('Aufbewahrung')}</label>
            <select className="select" value={s.retentionDays ?? ''} onChange={(e) => setS({ ...s, retentionDays: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: 420 }}>
              <option value="">{t('Unbegrenzt aufbewahren')}</option>
              {[90, 180, 365, 730, 2190, 3650].map((d) => <option key={d} value={d}>{t('Dokumente {n} Tage nach Abschluss löschen', { n: d })}</option>)}
            </select>
            <span className="hint">{t('Gelöscht werden Dokumentinhalte und Unterschriftsbilder. Audit-Trail und Hashwerte bleiben als Nachweis erhalten. Gesetzliche Aufbewahrungspflichten (z. B. § 50 BRAO: 6 Jahre Handakte) beachten.')}</span>
          </div>
          <div className="field">
            <label className="label">{t('Eigene Domain für Signaturlinks (optional)')}</label>
            <input className="input mono" placeholder="sign.kanzlei.de" value={domain} onChange={(e) => setDomain(e.target.value)} style={{ maxWidth: 420 }} />
            <span className="hint">{t('Die Domain muss per DNS und Reverse Proxy auf diese Instanz zeigen (HTTPS). Links in E-Mails verwenden dann diese Domain.')}</span>
          </div>
          <div><button className="btn btn-primary" onClick={() => save(() => patch('/api/v1/org', { name, settings: s, custom_domain: domain.trim() || null }))}>{t('Speichern')}</button></div>
        </div>
      </Section>
      {me?.principal.instance_admin && (
        <Section title={t('Weitere Organisation anlegen')} sub={t('Organisationen sind vollständig voneinander getrennt – Daten, Vorlagen, Schlüssel und Mitglieder.')}>
          <div className="row">
            <input className="input" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder={t('Name')} style={{ maxWidth: 320 }} />
            <button className="btn" disabled={!newOrg.trim()} onClick={() => save(() => post('/api/v1/orgs', { name: newOrg }), t('Organisation angelegt – Wechsel über das Menü unten links')).then(() => setNewOrg(''))}><Plus /> {t('Anlegen')}</button>
          </div>
        </Section>
      )}
    </>
  );
}

const MAIL_KINDS: [string, string, string, string][] = [
  ['signing_request', 'Einladung zur Unterschrift', '{{sender}} bittet Sie um Ihre Unterschrift: {{title}}', 'Guten Tag {{recipient}},\n\n{{sender}} hat Ihnen das Dokument „{{title}}“ zur elektronischen Unterschrift gesendet.\n\n{{message}}\n\nDer Link ist persönlich und gilt bis {{expires}}.'],
  ['reminder', 'Erinnerung', 'Erinnerung: {{title}} wartet auf Ihre Unterschrift', 'Guten Tag {{recipient}},\n\ndas Dokument „{{title}}“ von {{sender}} wartet noch auf Ihre Unterschrift.'],
  ['completed', 'Abschluss', 'Abgeschlossen: {{title}}', 'Guten Tag {{recipient}},\n\nalle Beteiligten haben „{{title}}“ unterschrieben.'],
];

function Branding() {
  const { me } = useSession();
  const save = useSaver();
  const b = me!.org.branding;
  const [f, setF] = useState({ accent: b.accent ?? '#3D5AFE', senderName: b.senderName ?? '', replyTo: b.replyTo ?? '', footer: b.footer ?? '' });
  const [mail, setMail] = useState<Record<string, { subject: string; body: string }>>(Object.fromEntries(MAIL_KINDS.map(([k, , s, body]) => [k, b.mail?.[k] ?? { subject: s, body }])));
  const [kind, setKind] = useState('signing_request');
  const [logoV, setLogoV] = useState(Date.now());
  const sample: Record<string, string> = { sender: `${me!.principal.name} (${me!.org.name})`, title: 'Mandatsvereinbarung', recipient: 'Erika Müller', message: 'Anbei die besprochene Vereinbarung.', expires: '30. November 2026' };
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => sample[k] ?? '');
  return (
    <>
      <Section title={t('Erscheinungsbild')} sub={t('Logo und Farbe erscheinen auf der Signaturseite und in E-Mails.')}>
        <div className="stack">
          <div className="row row-wrap" style={{ gap: 20 }}>
            <div className="logo-box">{b.logoBlobId ? <img src={`/api/public/orgs/${me!.org.id}/logo?v=${logoV}`} alt="Logo" /> : <span className="muted">{t('Kein Logo')}</span>}</div>
            <div className="stack-sm">
              <label className="btn btn-sm" style={{ cursor: 'pointer' }}><Upload /> {t('Logo hochladen (PNG, max. 1 MB)')}<input type="file" hidden accept="image/png" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); await save(() => api('POST', '/api/v1/org/logo', fd)); setLogoV(Date.now()); }} /></label>
              {b.logoBlobId && <button className="btn btn-sm btn-ghost" onClick={() => save(() => del('/api/v1/org/logo'))}>{t('Logo entfernen')}</button>}
            </div>
            <div className="field">
              <label className="label">{t('Akzentfarbe')}</label>
              <div className="row"><input type="color" value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} style={{ width: 44, height: 36, border: 0, background: 'none' }} /><input className="input mono" value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} style={{ width: 110 }} /></div>
            </div>
          </div>
          <div className="grid-2">
            <div className="field"><label className="label">{t('Absendername')}</label><input className="input" value={f.senderName} placeholder={me!.org.name} onChange={(e) => setF({ ...f, senderName: e.target.value })} /></div>
            <div className="field"><label className="label">{t('Antwortadresse')}</label><input className="input" type="email" value={f.replyTo} placeholder="kanzlei@example.de" onChange={(e) => setF({ ...f, replyTo: e.target.value })} /></div>
          </div>
          <div className="field"><label className="label">{t('Fußzeile (z. B. Impressum, Kontakt)')}</label><textarea className="textarea" value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} /></div>
          <div><button className="btn btn-primary" onClick={() => save(() => patch('/api/v1/org', { branding: { ...f, replyTo: f.replyTo } }))}>{t('Speichern')}</button></div>
        </div>
      </Section>
      <Section title={t('E-Mail-Texte')} sub={t('Platzhalter: {{sender}}, {{title}}, {{recipient}}, {{message}}, {{expires}}. Der Link-Button wird automatisch ergänzt.')}>
        <div className="stack">
          <div className="tabs">{MAIL_KINDS.map(([k, label]) => <button key={k} className="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{t(label)}</button>)}</div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="stack-sm">
              <input className="input" value={mail[kind].subject} onChange={(e) => setMail({ ...mail, [kind]: { ...mail[kind], subject: e.target.value } })} aria-label={t('Betreff')} />
              <textarea className="textarea" rows={10} value={mail[kind].body} onChange={(e) => setMail({ ...mail, [kind]: { ...mail[kind], body: e.target.value } })} aria-label={t('Text')} />
            </div>
            <div className="mail-preview" style={{ ['--acc' as any]: f.accent }}>
              <div className="hint">{t('Vorschau')}</div>
              <strong>{fill(mail[kind].subject)}</strong>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{fill(mail[kind].body)}</div>
              <span className="mail-btn">{kind === 'completed' ? t('Dokument herunterladen') : t('Dokument ansehen und unterschreiben')}</span>
              {f.footer && <div className="hint">{f.footer}</div>}
            </div>
          </div>
          <div><button className="btn btn-primary" onClick={() => save(() => patch('/api/v1/org', { branding: { mail } }))}>{t('Texte speichern')}</button></div>
        </div>
      </Section>
    </>
  );
}

function Team() {
  const { me } = useSession();
  const save = useSaver();
  const q = useQuery({ queryKey: ['members'], queryFn: () => get('/api/v1/members') });
  const [inv, setInv] = useState({ email: '', role: 'member' });
  const [link, setLink] = useState('');
  const { confirm, node } = useConfirm();
  const manage = me?.permissions.includes('members.manage');
  if (q.isLoading) return <Spinner />;
  return (
    <>
      {manage && (
        <Section title={t('Person einladen')}>
          <div className="row row-wrap">
            <input className="input" type="email" placeholder={t('E-Mail-Adresse')} value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} style={{ maxWidth: 300 }} />
            <select className="select" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} style={{ width: 200 }}>
              {['member', 'admin', 'viewer', 'owner'].map((r) => <option key={r} value={r}>{t(roleLabel(r))}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => save(() => post('/api/v1/members/invite', inv), t('Einladung versendet')).then((r: any) => { setInv({ email: '', role: 'member' }); if (r?.link) setLink(r.link); })}>{t('Einladen')}</button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>{t('Mitglied: eigene Vorgänge und Vorlagen. Administration: alles inkl. Team, API und Einstellungen. Nur lesen: Vorgänge ansehen und herunterladen.')}</p>
          {link && <div className="secret-box" style={{ marginTop: 12 }}><span className="grow">{link}</span></div>}
        </Section>
      )}
      <section className="sheet">
        <div className="table-scroll">
          <table className="kv-table">
            <thead><tr><th>{t('Name')}</th><th>{t('Rolle')}</th><th>{t('Zuletzt aktiv')}</th><th>2FA</th><th /></tr></thead>
            <tbody>
              {q.data.data.map((m: any) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong><div className="hint">{m.email}</div></td>
                  <td>
                    {manage && m.id !== me?.principal.id ? (
                      <select className="select" value={m.role} onChange={(e) => save(() => patch(`/api/v1/members/${m.id}`, { role: e.target.value }))} style={{ height: 32 }}>
                        {['owner', 'admin', 'member', 'viewer'].map((r) => <option key={r} value={r}>{t(roleLabel(r))}</option>)}
                      </select>
                    ) : t(roleLabel(m.role))}
                  </td>
                  <td className="hint">{m.last_seen_at ? fmtRelative(m.last_seen_at) : '—'}</td>
                  <td>{m.totp_enabled ? <Check size={16} color="var(--done)" /> : <span className="hint">—</span>}</td>
                  <td>{manage && m.id !== me?.principal.id && <button className="icon-btn" aria-label={t('Entfernen')} onClick={async () => { if (await confirm({ title: t('{name} entfernen?', { name: m.name }), text: t('Die Person verliert sofort den Zugriff. Ihre Vorgänge bleiben erhalten; private Vorlagen werden für die Organisation freigegeben.'), action: t('Entfernen'), danger: true })) save(() => del(`/api/v1/members/${m.id}`)); }}><Trash2 /></button>}</td>
                </tr>
              ))}
              {q.data.invitations.map((i: any) => (
                <tr key={i.id}>
                  <td><span className="muted">{i.email}</span></td>
                  <td className="hint">{t(roleLabel(i.role))}</td>
                  <td className="hint">{t('eingeladen, gültig bis {d}', { d: fmtDate(i.expires_at, false) })}</td>
                  <td />
                  <td><button className="icon-btn" aria-label={t('Einladung zurückziehen')} onClick={() => save(() => del(`/api/v1/invitations/${i.id}`))}><Trash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {node}
    </>
  );
}

const SCOPE_LABEL: Record<string, string> = {
  'envelopes:read': 'Vorgänge lesen und herunterladen',
  'envelopes:write': 'Vorgänge anlegen, versenden, widerrufen',
  'templates:read': 'Vorlagen lesen',
  'templates:write': 'Vorlagen bearbeiten',
  'webhooks:manage': 'Webhooks verwalten',
  'contacts:read': 'Kontakte lesen',
};

function ApiSettings() {
  const { me } = useSession();
  const save = useSaver();
  const toast = useToast();
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => get('/api/v1/api-keys'), enabled: !!me?.permissions.includes('apikeys.manage') });
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: () => get('/api/v1/webhooks'), enabled: !!me?.permissions.includes('webhooks.manage'), refetchInterval: 10_000 });
  const [newKey, setNewKey] = useState<{ name: string; scopes: string[]; mode: string } | null>(null);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [hook, setHook] = useState<{ url: string; events: string[]; description: string } | null>(null);
  const [origins, setOrigins] = useState((me!.org.settings.embedOrigins ?? []).join('\n'));
  return (
    <>
      <Callout>
        {t('Die API ist vollständig und ohne Zusatzkosten nutzbar – auch für n8n, Make oder Ihre Kanzleisoftware.')} <a href="/docs/api" target="_blank" rel="noreferrer">{t('API-Dokumentation öffnen')}</a>
      </Callout>
      <div style={{ height: 18 }} />
      {keys.data && (
        <Section title={t('API-Schlüssel')} action={<button className="btn btn-sm" onClick={() => setNewKey({ name: '', scopes: ['envelopes:read', 'envelopes:write', 'templates:read'], mode: 'live' })}><Plus /> {t('Neuer Schlüssel')}</button>}>
          {keys.data.data.length === 0 ? <p className="muted">{t('Noch keine Schlüssel.')}</p> : (
            <div className="table-scroll">
              <table className="kv-table">
                <thead><tr><th>{t('Name')}</th><th>{t('Berechtigungen')}</th><th>{t('Zuletzt genutzt')}</th><th /></tr></thead>
                <tbody>
                  {keys.data.data.map((k: any) => (
                    <tr key={k.id} style={{ opacity: k.revoked_at ? 0.5 : 1 }}>
                      <td><strong>{k.name}</strong> {k.mode === 'test' && <span className="tag-test">TEST</span>}<div className="mono hint">{k.prefix}…</div></td>
                      <td className="hint">{k.scopes.join(', ')}</td>
                      <td className="hint">{k.revoked_at ? t('widerrufen') : k.last_used_at ? fmtRelative(k.last_used_at) : t('nie')}</td>
                      <td>{!k.revoked_at && <button className="btn btn-sm btn-danger" onClick={() => save(() => del(`/api/v1/api-keys/${k.id}`), t('Schlüssel widerrufen'))}>{t('Widerrufen')}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      {hooks.data && (
        <Section title={t('Webhooks')} sub={t('Paraph meldet Ereignisse signiert an Ihre Adresse (Standard Webhooks, HMAC-SHA256) und wiederholt fehlgeschlagene Zustellungen.')} action={<button className="btn btn-sm" onClick={() => setHook({ url: '', events: ['envelope.completed', 'recipient.signed', 'envelope.declined'], description: '' })}><Plus /> {t('Neuer Webhook')}</button>}>
          <div className="stack">
            {hooks.data.data.length === 0 && <p className="muted">{t('Noch keine Webhooks.')}</p>}
            {hooks.data.data.map((h: any) => (
              <div key={h.id} className="hook">
                <div className="row">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="mono" style={{ overflowWrap: 'anywhere' }}>{h.url}</div>
                    <div className="hint">{h.events.join(', ')} {h.mode === 'test' && <span className="tag-test">TEST</span>}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => save(() => post(`/api/v1/webhooks/${h.id}/test`), t('Testereignis eingereiht'))}><Send /> {t('Testen')}</button>
                  <label className="row" style={{ gap: 6 }}><input type="checkbox" className="switch" checked={h.active} onChange={(e) => save(() => patch(`/api/v1/webhooks/${h.id}`, { active: e.target.checked }))} aria-label={t('Aktiv')} /></label>
                  <button className="icon-btn" aria-label={t('Löschen')} onClick={() => save(() => del(`/api/v1/webhooks/${h.id}`))}><Trash2 /></button>
                </div>
                {h.recent.length > 0 && (
                  <table className="kv-table" style={{ marginTop: 8 }}>
                    <tbody>
                      {h.recent.map((d: any) => (
                        <tr key={d.id}>
                          <td className="mono hint">{fmtRelative(d.created_at)}</td>
                          <td>{d.event_type}</td>
                          <td>{d.status === 'delivered' ? <span className="pill pill-done">{d.last_status_code}</span> : d.status === 'failed' ? <span className="pill pill-stop">{d.last_error ?? d.last_status_code}</span> : <span className="pill pill-wait">{t('Versuch {n}', { n: d.attempts })}{d.last_error ? ` · ${d.last_error}` : ''}</span>}</td>
                          <td>{d.status !== 'delivered' && <button className="icon-btn" aria-label={t('Erneut zustellen')} onClick={() => save(() => post(`/api/v1/webhooks/deliveries/${d.id}/retry`), t('Erneut eingereiht'))}><RotateCw /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {me?.permissions.includes('org.manage') && (
        <Section title={t('Einbettung')} sub={t('Websites (Origins), die die Signaturseite per iframe einbetten dürfen – eine pro Zeile, z. B. https://portal.kanzlei.de')}>
          <div className="stack-sm">
            <textarea className="textarea mono" value={origins} onChange={(e) => setOrigins(e.target.value)} />
            <div><button className="btn" onClick={() => save(() => patch('/api/v1/org', { settings: { embedOrigins: origins.split('\n').map((s: string) => s.trim()).filter(Boolean) } }))}>{t('Speichern')}</button></div>
          </div>
        </Section>
      )}
      {newKey && (
        <Dialog
          title={t('Neuer API-Schlüssel')}
          onClose={() => setNewKey(null)}
          footer={<><button className="btn" onClick={() => setNewKey(null)}>{t('Abbrechen')}</button><button className="btn btn-primary" disabled={!newKey.name.trim()} onClick={async () => { const r = await save(() => post('/api/v1/api-keys', newKey), t('Schlüssel erstellt')); setNewKey(null); setSecret({ label: t('API-Schlüssel'), value: r.key }); }}>{t('Erstellen')}</button></>}
        >
          <div className="stack">
            <div className="field"><label className="label">{t('Name')}</label><input className="input" placeholder="j-lawyer, n8n …" value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} autoFocus /></div>
            <div className="segmented"><button aria-pressed={newKey.mode === 'live'} onClick={() => setNewKey({ ...newKey, mode: 'live' })}>Live</button><button aria-pressed={newKey.mode === 'test'} onClick={() => setNewKey({ ...newKey, mode: 'test' })}>{t('Testmodus')}</button></div>
            {newKey.mode === 'test' && <p className="hint">{t('Testmodus: getrennte Vorgänge, keine E-Mails, Wasserzeichen „TEST“, Links in der API-Antwort.')}</p>}
            <div className="stack-sm">
              {Object.entries(SCOPE_LABEL).map(([s, l]) => <label key={s} className="check"><input type="checkbox" checked={newKey.scopes.includes(s)} onChange={(e) => setNewKey({ ...newKey, scopes: e.target.checked ? [...newKey.scopes, s] : newKey.scopes.filter((x) => x !== s) })} /> {t(l)} <span className="mono hint">{s}</span></label>)}
            </div>
          </div>
        </Dialog>
      )}
      {hook && (
        <Dialog
          title={t('Neuer Webhook')}
          onClose={() => setHook(null)}
          footer={<><button className="btn" onClick={() => setHook(null)}>{t('Abbrechen')}</button><button className="btn btn-primary" onClick={async () => { const r = await save(() => post('/api/v1/webhooks', hook), t('Webhook angelegt')); setHook(null); setSecret({ label: t('Signaturgeheimnis'), value: r.secret }); }}>{t('Anlegen')}</button></>}
        >
          <div className="stack">
            <div className="field"><label className="label">URL</label><input className="input mono" placeholder="https://n8n.kanzlei.de/webhook/paraph" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} autoFocus /></div>
            <div className="stack-sm">{(hooks.data?.events ?? []).map((ev: string) => <label key={ev} className="check"><input type="checkbox" checked={hook.events.includes(ev)} onChange={(e) => setHook({ ...hook, events: e.target.checked ? [...hook.events, ev] : hook.events.filter((x) => x !== ev) })} /> <span className="mono">{ev}</span></label>)}</div>
            <p className="hint">{t('Interne Adressen (z. B. 192.168.x.x) sind aus Sicherheitsgründen gesperrt, außer sie sind per WEBHOOK_ALLOW_HOSTS freigegeben.')}</p>
          </div>
        </Dialog>
      )}
      {secret && (
        <Dialog title={secret.label} onClose={() => setSecret(null)} footer={<button className="btn btn-primary" onClick={() => setSecret(null)}>{t('Ich habe es gesichert')}</button>}>
          <div className="stack">
            <Callout kind="warn">{t('Wird nur jetzt angezeigt. Bewahren Sie den Wert sicher auf.')}</Callout>
            <div className="secret-box"><span className="grow">{secret.value}</span><button className="icon-btn" style={{ color: '#fff' }} onClick={() => { navigator.clipboard.writeText(secret.value); toast(t('Kopiert')); }} aria-label={t('Kopieren')}><Copy /></button></div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Trust() {
  const { me } = useSession();
  const save = useSaver();
  const seal = useQuery({ queryKey: ['seal'], queryFn: () => get('/api/v1/org/seal') });
  const [imp, setImp] = useState<{ key_pem: string; chain_pem: string } | null>(null);
  const f = me!.features;
  return (
    <>
      <Section title={t('Signaturstufen')} sub={t('Was Paraph heute leistet – und was nicht.')}>
        <div className="levels">
          <div className="level level-on">
            <div className="row"><ShieldCheck size={18} /><strong className="grow">{t('Einfache elektronische Signatur (EES)')}</strong><span className="pill pill-done">{t('aktiv')}</span></div>
            <p>{t('Art. 3 Nr. 10 eIDAS. Ausdrückliche Erklärung, Zuordnung zur Person, gebundene Dokumentfassung, Protokoll. Genügt, wo das Gesetz keine Form vorschreibt oder Textform reicht.')}</p>
          </div>
          <div className="level">
            <div className="row"><strong className="grow">{t('Fortgeschrittene elektronische Signatur (FES)')}</strong><span className="pill">{t('nicht beansprucht')}</span></div>
            <p>{t('Art. 26 eIDAS verlangt u. a. Signaturerstellungsdaten unter alleiniger Kontrolle der unterzeichnenden Person. Ein E-Mail- oder SMS-Code erfüllt das nach überwiegender Ansicht nicht. Paraph bezeichnet seine Signaturen deshalb nicht als FES.')}</p>
          </div>
          <div className="level">
            <div className="row"><strong className="grow">{t('Qualifizierte elektronische Signatur (QES)')}</strong>{f.qes ? <span className="pill pill-wait">{t('Anbieter konfiguriert, nicht verifiziert')}</span> : <span className="pill">{t('nicht eingerichtet')}</span>}</div>
            <p>{t('Nur über einen qualifizierten Vertrauensdiensteanbieter (z. B. D-Trust, Swisscom, Namirial, Skribble). Erfüllt die elektronische Form nach § 126a BGB. Paraph simuliert keine QES; die Anbieter-Schnittstelle ist vorbereitet und erfordert einen Vertrag mit einem Anbieter.')}</p>
          </div>
        </div>
      </Section>
      <Section title={t('Plattformsiegel')} sub={t('Jedes fertige PDF trägt eine PAdES-Signatur dieser Instanz. Sie weist nach, dass die Datei seit Abschluss unverändert ist – sie ist keine persönliche Signatur der Unterzeichner.')}>
        {seal.isLoading ? <Spinner /> : seal.data && (
          <div className="stack">
            <dl className="integrity" style={{ padding: 0 }}>
              <dt>{t('Zertifikat')}</dt><dd>{seal.data.subject} ({seal.data.source === 'uploaded' ? t('eigenes Zertifikat') : t('selbst signiert')})</dd>
              <dt>{t('Fingerabdruck SHA-256')}</dt><dd className="mono">{seal.data.certificate_sha256}</dd>
              <dt>{t('Gültig bis')}</dt><dd>{fmtDate(seal.data.not_after, false)}</dd>
              <dt>{t('Zeitstempeldienst')}</dt><dd>{seal.data.timestamp_authority ?? t('keiner (TSA_URL nicht gesetzt) – Zeitpunkt stammt aus der Serveruhr')}</dd>
            </dl>
            <div className="row row-wrap">
              <button className="btn btn-sm" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([seal.data.pem], { type: 'application/x-pem-file' })); a.download = 'paraph-siegel.pem'; a.click(); }}><Download /> {t('Zertifikat herunterladen')}</button>
              {me?.principal.role === 'owner' && <button className="btn btn-sm" onClick={() => setImp({ key_pem: '', chain_pem: '' })}><Upload /> {t('Eigenes Zertifikat verwenden')}</button>}
            </div>
            <p className="hint">{t('Tipp: Wer den Fingerabdruck in Adobe Acrobat als vertrauenswürdig hinterlegt, sieht das Siegel dort als gültig.')}</p>
          </div>
        )}
      </Section>
      <Section title={t('Optionale Dienste')}>
        <dl className="integrity" style={{ padding: 0 }}>
          <dt>{t('E-Mail-Versand (SMTP)')}</dt><dd>{f.smtp ? t('eingerichtet') : t('nicht eingerichtet – Links müssen manuell weitergegeben werden')}</dd>
          <dt>{t('Word/ODT-Umwandlung')}</dt><dd>{f.office_conversion ? t('eingerichtet (Gotenberg)') : t('nicht eingerichtet – nur PDF')}</dd>
          <dt>{t('SMS-Codes')}</dt><dd>{f.sms ? t('Gateway eingerichtet (Kosten beim Anbieter)') : t('nicht eingerichtet')}</dd>
          <dt>{t('Anmeldung per SSO')}</dt><dd>{f.oidc ? t('eingerichtet') : t('nicht eingerichtet')}</dd>
        </dl>
      </Section>
      {imp && (
        <Dialog wide title={t('Eigenes Siegelzertifikat')} onClose={() => setImp(null)} footer={<><button className="btn" onClick={() => setImp(null)}>{t('Abbrechen')}</button><button className="btn btn-primary" onClick={() => save(() => post('/api/v1/org/seal', imp), t('Zertifikat übernommen')).then(() => setImp(null))}>{t('Übernehmen')}</button></>}>
          <div className="stack">
            <Callout kind="warn">{t('Der private Schlüssel wird verschlüsselt gespeichert. Ein qualifiziertes Siegel ist damit nicht möglich – qualifizierte Schlüssel liegen beim Vertrauensdiensteanbieter.')}</Callout>
            <div className="field"><label className="label">{t('Privater Schlüssel (PKCS#8, „BEGIN PRIVATE KEY“)')}</label><textarea className="textarea mono" rows={5} value={imp.key_pem} onChange={(e) => setImp({ ...imp, key_pem: e.target.value })} /></div>
            <div className="field"><label className="label">{t('Zertifikatskette (PEM, Siegelzertifikat zuerst)')}</label><textarea className="textarea mono" rows={6} value={imp.chain_pem} onChange={(e) => setImp({ ...imp, chain_pem: e.target.value })} /></div>
          </div>
        </Dialog>
      )}
    </>
  );
}

const CHECK_ICON: Record<string, string> = { ok: '✓', warn: '!', fail: '✕', info: 'i' };

function Checks({ checks }: { checks: any[] }) {
  const areas = [...new Set(checks.map((c) => c.area))];
  return (
    <div className="stack">
      {areas.map((a) => (
        <div key={a}>
          <div className="label" style={{ marginBottom: 6 }}>{t(a)}</div>
          <ul className="checks">
            {checks.filter((c) => c.area === a).map((c) => (
              <li key={c.id} className={`check check-${c.status}`}>
                <span className="check-icon" aria-label={c.status}>{CHECK_ICON[c.status]}</span>
                <div><strong>{t(c.label)}</strong><div className="hint" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div></div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SystemPage() {
  const q = useQuery({ queryKey: ['system'], queryFn: () => get('/api/v1/system') });
  const { me } = useSession();
  const save = useSaver();
  const toast = useToast();
  const [deep, setDeep] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [mailTo, setMailTo] = useState('');
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Callout kind="stop">{errorText(q.error)}</Callout>;
  const s = q.data;
  const diag = deep ?? s.diagnostics;
  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <Section
        title={t('Betriebszustand')}
        sub={deep ? t('Tiefenprüfung vom {d}', { d: fmtDate(deep.generated_at) }) : t('Schnellprüfung – die Tiefenprüfung kontaktiert Mailserver, Zeitstempeldienst, SSO und Speicher.')}
        action={<button className="btn" disabled={!!busy} onClick={() => run('deep', async () => { try { setDeep(await post('/api/v1/system/diagnose')); } catch (e) { toast(errorText(e), 'error'); } })}>{busy === 'deep' ? <Spinner size={16} /> : <ShieldCheck />} {t('Tiefenprüfung')}</button>}
      >
        <div style={{ marginBottom: 14 }}>
          {diag.status === 'ok' && <Callout kind="done">{t('Alles in Ordnung.')}</Callout>}
          {diag.status === 'warn' && <Callout kind="warn">{t('Betriebsbereit, aber mit Hinweisen – siehe unten.')}</Callout>}
          {diag.status === 'fail' && <Callout kind="stop">{t('Es gibt Fehler, die vor dem Produktivbetrieb behoben werden müssen.')}</Callout>}
        </div>
        <Checks checks={diag.checks} />
      </Section>
      <Section title={t('E-Mail-Versand prüfen')} sub={t('Sendet sofort eine Test-E-Mail über den eingerichteten Mailserver.')}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="input grow" type="email" placeholder={me?.principal.email} value={mailTo} onChange={(e) => setMailTo(e.target.value)} style={{ minWidth: 220 }} />
          <button
            className="btn"
            disabled={!!busy}
            onClick={() =>
              run('mail', async () => {
                const r = await post('/api/v1/system/test-mail', mailTo ? { to: mailTo } : {}).catch((e: any) => ({ ok: false, error: { message: errorText(e) } }));
                if (r.ok) toast(t('Test-E-Mail angenommen ({r})', { r: r.response || 'OK' }));
                else toast(r.error?.message ?? t('Versand fehlgeschlagen'), 'error');
              })
            }
          >
            {busy === 'mail' ? <Spinner size={16} /> : <Send />} {t('Test-E-Mail senden')}
          </button>
        </div>
      </Section>
      <Section
        title={t('Sicherung')}
        action={<button className="btn" disabled={!!busy} onClick={() => save(() => post('/api/v1/system/backup'), t('Sicherung wird erstellt'))}><Download /> {t('Jetzt sichern')}</button>}
      >
        <dl className="integrity" style={{ padding: 0 }}>
          <dt>{t('Automatisch')}</dt><dd>{s.backup.interval_hours > 0 ? t('alle {h} Stunden, {k} werden aufbewahrt', { h: s.backup.interval_hours, k: s.backup.keep }) : t('aus')}</dd>
          <dt>{t('Letzte Sicherung')}</dt><dd>{s.backup.last ? `${fmtDate(s.backup.last.at)} · ${s.backup.last.file.split('/').pop()}` : t('noch keine')}</dd>
          <dt>{t('Schlüsselmaterial')}</dt><dd>{s.backup.passphrase ? t('enthalten, geschützt durch die Wiederherstellungs-Passphrase') : <span className="error-text">{t('nicht enthalten – Hauptschlüssel getrennt aufbewahren oder BACKUP_PASSPHRASE_FILE einrichten')}</span>}</dd>
        </dl>
        <p className="hint" style={{ marginTop: 10 }}>{t('Sicherungen sind vollständig verschlüsselt. Wiederherstellen: siehe Handbuch, Kapitel Sicherung.')}</p>
      </Section>
      <Section title={t('Hintergrundaufgaben und E-Mails')}>
        {s.failed_jobs.length === 0 && s.failed_mails.length === 0 ? <Callout kind="done">{t('Keine fehlgeschlagenen Hintergrundaufgaben.')}</Callout> : (
          <div className="stack-sm">
            {s.failed_jobs.map((j: any) => (
              <div key={j.id} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 0 }}><strong>{j.type}</strong><div className="hint mono" style={{ overflowWrap: 'anywhere' }}>{String(j.last_error).split('\n')[0]}</div></div>
                <button className="btn btn-sm" onClick={() => save(() => post(`/api/v1/system/jobs/${j.id}/retry`), t('Wird erneut versucht'))}><RotateCw /> {t('Erneut versuchen')}</button>
              </div>
            ))}
            {s.failed_mails.map((m: any) => (
              <div key={m.id} className="hint"><strong>{m.to_addr}</strong> · {fmtDate(m.created_at)} · {m.last_error}</div>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>{t('Warteschlange')}: {s.worker.queued} · {t('in Wiederholung')}: {s.worker.retrying} · {t('überfällig')}: {s.worker.overdue}</p>
      </Section>
      <InstanceUsers />
    </>
  );
}

function InstanceUsers() {
  const q = useQuery({ queryKey: ['admin-users'], queryFn: () => get('/api/v1/admin/users') });
  const save = useSaver();
  const { confirm, node } = useConfirm();
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const { me } = useSession();
  if (q.isLoading) return <Spinner />;
  return (
    <Section title={t('Benutzerkonten der Instanz')} sub={t('Konten sperren, Zwei-Faktor zurücksetzen, Instanz-Administration vergeben. Rollen innerhalb einer Organisation verwalten Sie unter „Team“.')}>
      <div className="table-scroll" style={{ margin: '0 -18px' }}>
        <table className="kv-table users-table">
          <thead><tr><th>{t('Name')}</th><th>{t('Organisationen')}</th><th>{t('Anmeldung')}</th><th>{t('Zuletzt')}</th><th /></tr></thead>
          <tbody>
            {q.data.data.map((u: any) => (
              <tr key={u.id} style={u.disabled_at ? { opacity: 0.55 } : undefined}>
                <td><strong>{u.name}</strong><div className="hint">{u.email}</div>{u.is_instance_admin && <span className="pill">{t('Instanz-Admin')}</span>} {u.disabled_at && <span className="pill pill-stop">{t('gesperrt')}</span>}</td>
                <td className="hint">{u.orgs.map((o: any) => `${o.name} (${roleLabel(o.role)})`).join(', ') || '—'}</td>
                <td className="hint">{[u.has_password && t('Passwort'), u.sso && 'SSO', u.totp_enabled && '2FA'].filter(Boolean).join(' · ')}</td>
                <td className="hint">{u.last_login ? fmtRelative(u.last_login) : '—'}</td>
                <td>
                  {u.id !== me?.principal.id && (
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={async () => {
                        if (!u.disabled_at && !(await confirm({ title: t('Konto sperren?'), text: t('{name} wird sofort abgemeldet und kann sich nicht mehr anmelden. Von der Person angelegte API-Schlüssel verlieren ihre Wirkung.', { name: u.name }), action: t('Sperren'), danger: true }))) return;
                        save(() => patch(`/api/v1/admin/users/${u.id}`, { disabled: !u.disabled_at }), u.disabled_at ? t('Entsperrt') : t('Gesperrt'));
                      }}>{u.disabled_at ? t('Entsperren') : t('Sperren')}</button>
                      {u.totp_enabled && <button className="btn btn-sm" onClick={async () => {
                        if (!(await confirm({ title: t('Zwei-Faktor zurücksetzen?'), text: t('Nur nach sicherer Prüfung der Identität, z. B. bei verlorenem Telefon.'), action: t('Zurücksetzen') }))) return;
                        save(() => post(`/api/v1/admin/users/${u.id}/reset-mfa`), t('Zwei-Faktor zurückgesetzt'));
                      }}>{t('2FA zurücksetzen')}</button>}
                      {!u.disabled_at && u.has_password && <button className="btn btn-sm" onClick={async () => { const r = await save(() => post(`/api/v1/admin/users/${u.id}/reset-link`), t('Link erstellt')); setLink({ name: u.name, url: r.url }); }}>{t('Passwort-Link')}</button>}
                      <button className="btn btn-sm" onClick={() => save(() => patch(`/api/v1/admin/users/${u.id}`, { instance_admin: !u.is_instance_admin }))}>{u.is_instance_admin ? t('Admin entziehen') : t('Zum Admin')}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {link && (
        <Dialog title={t('Link zum Zurücksetzen für {name}', { name: link.name })} onClose={() => setLink(null)} footer={<button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(link.url); setLink(null); }}><Copy /> {t('Kopieren und schließen')}</button>}>
          <p className="hint">{t('60 Minuten gültig. Geben Sie den Link nur auf sicherem Weg weiter.')}</p>
          <input className="input mono" readOnly value={link.url} onFocus={(e) => e.target.select()} />
        </Dialog>
      )}
      {node}
    </Section>
  );
}

void shortHash;
void useMemo;
void useEffect;
