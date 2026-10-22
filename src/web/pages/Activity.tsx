import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../components/ui';
import { get } from '../lib/api';
import { t } from '../lib/i18n';
import { fmtDate } from '../lib/format';

const ACT: Record<string, string> = {
  'auth.login': 'Anmeldung',
  'auth.login_failed': 'Anmeldung fehlgeschlagen',
  'auth.login_oidc': 'Anmeldung per SSO',
  'auth.oidc_linked': 'SSO-Konto verknüpft',
  'auth.oidc_user_created': 'Konto per SSO angelegt',
  'auth.totp_enabled': 'Zwei-Faktor aktiviert',
  'auth.totp_disabled': 'Zwei-Faktor deaktiviert',
  'auth.password_changed': 'Passwort geändert',
  'member.invited': 'Person eingeladen',
  'member.joined': 'Person beigetreten',
  'member.role_changed': 'Rolle geändert',
  'member.removed': 'Person entfernt',
  'apikey.created': 'API-Schlüssel erstellt',
  'apikey.revoked': 'API-Schlüssel widerrufen',
  'webhook.created': 'Webhook angelegt',
  'template.created': 'Vorlage angelegt',
  'template.published': 'Vorlage veröffentlicht',
  'org.updated': 'Einstellungen geändert',
  'envelope.downloaded': 'Ergebnis heruntergeladen',
  'seal.imported': 'Siegelzertifikat ersetzt',
  'public_form.created': 'Formular angelegt',
  'contact.deleted': 'Kontakt gelöscht',
};

export default function Activity() {
  const q = useQuery({ queryKey: ['activity'], queryFn: () => get('/api/v1/activity'), refetchInterval: 20_000 });
  if (q.isLoading) return <div className="page"><Spinner /></div>;
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>{t('Aktivität')}</h1><p className="sub">{t('Wer hat was getan – Verwaltung und Vorgänge der Organisation.')}</p></div></div>
      <div className="env-layout" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="sheet">
          <div className="sheet-head"><h2>{t('Vorgänge')}</h2></div>
          <div className="table-scroll"><table className="kv-table"><tbody>
            {q.data.envelope_events.map((e: any, i: number) => (
              <tr key={i}><td className="hint" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.ts)}</td><td><Link to={`/envelopes/${e.envelope_id}`}>{e.title}</Link><div className="hint">{e.type} · {e.actor.name ?? t('System')}</div></td></tr>
            ))}
          </tbody></table></div>
        </section>
        <section className="sheet">
          <div className="sheet-head"><h2>{t('Verwaltung')}</h2></div>
          <div className="table-scroll"><table className="kv-table"><tbody>
            {q.data.activity.map((a: any) => (
              <tr key={a.id}><td className="hint" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.ts)}</td><td>{t(ACT[a.action] ?? a.action)}<div className="hint">{a.user_name ?? (a.api_key_id ? 'API' : '')}{a.ip ? ` · ${a.ip}` : ''}</div></td></tr>
            ))}
          </tbody></table></div>
        </section>
      </div>
    </div>
  );
}
