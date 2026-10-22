import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Ban, Copy, Download, FileArchive, FileCheck2, FileJson, MoreHorizontal, PenTool, ShieldCheck, Link2, Send, Eye, KeyRound, CheckCircle2, XCircle, CircleDot, FilePlus2, Repeat } from 'lucide-react';
import { Avatar, Callout, Dialog, Menu, Paraph, PdfPage, RSTATUS, Spinner, StatusPill, errorText, useToast, useConfirm } from '../components/ui';
import { download, fetchBytes, get, post } from '../lib/api';
import { loadPdf, type PdfDoc } from '../lib/pdf';
import { t } from '../lib/i18n';
import { fmtDate, fmtRelative, shortHash } from '../lib/format';
import { useSession } from '../lib/session';

const EVENT_TEXT: Record<string, string> = {
  'envelope.created': 'Vorgang angelegt',
  'document.added': 'Dokument hinzugefügt',
  'document.removed': 'Dokument entfernt',
  'recipients.updated': 'Beteiligte festgelegt',
  'template.applied': 'Aus Vorlage erstellt',
  'form.risk_acknowledged': 'Formhinweis bestätigt',
  'envelope.sent': 'Versendet',
  'recipient.notified': 'Eingeladen',
  'recipient.link_opened': 'Geöffnet',
  'recipient.inperson_started': 'Vor Ort gestartet',
  'recipient.otp_sent': 'Code gesendet',
  'recipient.authenticated': 'Identität bestätigt',
  'recipient.auth_failed': 'Code falsch eingegeben',
  'recipient.consented': 'Erklärung abgegeben',
  'recipient.signed': 'Unterschrieben',
  'recipient.approved': 'Freigegeben',
  'recipient.submitted': 'Angaben übermittelt',
  'recipient.declined': 'Abgelehnt',
  'recipient.delegated': 'An Vertretung weitergegeben',
  'recipient.reminded': 'Erinnert',
  'recipient.link_issued': 'Neuer Link ausgestellt',
  'envelope.declined': 'Vorgang beendet (abgelehnt)',
  'envelope.voided': 'Widerrufen',
  'envelope.expired': 'Abgelaufen',
  'envelope.completed': 'Abgeschlossen und versiegelt',
  'envelope.duplicated': 'Als Kopie angelegt',
  'envelope.content_purged': 'Inhalte nach Aufbewahrungsfrist gelöscht',
};

function eventIcon(type: string) {
  if (['recipient.signed', 'recipient.approved', 'recipient.submitted', 'envelope.completed'].includes(type)) return { cls: 'ok', icon: <CheckCircle2 /> };
  if (['recipient.declined', 'envelope.voided', 'envelope.expired', 'envelope.declined', 'recipient.auth_failed'].includes(type)) return { cls: 'bad', icon: <XCircle /> };
  if (['envelope.sent', 'recipient.notified', 'recipient.reminded'].includes(type)) return { cls: 'ink', icon: <Send /> };
  if (type === 'recipient.link_opened') return { cls: '', icon: <Eye /> };
  if (type === 'recipient.authenticated') return { cls: 'ink', icon: <KeyRound /> };
  return { cls: '', icon: <CircleDot /> };
}

function Preview({ env }: { env: any }) {
  const completed = env.status === 'completed';
  const url = completed ? `/api/v1/envelopes/${env.id}/files/final?inline=1` : `/api/v1/envelopes/${env.id}/documents/${env.documents[0]?.id}/pdf`;
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [docIdx, setDocIdx] = useState(0);
  const docUrl = completed ? url : `/api/v1/envelopes/${env.id}/documents/${env.documents[docIdx]?.id}/pdf`;
  const [width, setWidth] = useState(600);
  useEffect(() => {
    setPdf(null);
    loadPdf(docUrl, () => fetchBytes(docUrl)).then(setPdf).catch(() => {});
  }, [docUrl]);
  const pages = completed ? (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i) : []) : env.documents[docIdx]?.pages.map((_: any, i: number) => i) ?? [];
  const info = (i: number) => (completed ? null : env.documents[docIdx].pages[i]);
  const recColor = Object.fromEntries(env.recipients.map((r: any) => [r.id, r.color]));
  const recStatus = Object.fromEntries(env.recipients.map((r: any) => [r.id, r.status]));
  return (
    <div>
      {!completed && env.documents.length > 1 && (
        <div className="tabs" style={{ marginBottom: 10 }}>
          {env.documents.map((d: any, i: number) => <button key={d.id} className="tab" aria-selected={i === docIdx} onClick={() => setDocIdx(i)}>{d.name}</button>)}
        </div>
      )}
      <div className="doc-preview" ref={(el) => { if (el && Math.abs(el.clientWidth - 36 - width) > 4) setWidth(Math.min(el.clientWidth - 36, 860)); }}>
        {!pdf && <Spinner />}
        {pdf &&
          pages.map((i: number) => {
            const p = info(i);
            return (
              <div key={i} className="page" style={{ width, aspectRatio: p ? `${p.width} / ${p.height}` : undefined, minHeight: p ? undefined : width * 1.41, margin: '0 auto' }}>
                <PdfPage doc={pdf} index={i} width={width} />
                {!completed &&
                  env.fields
                    .filter((f: any) => f.document_id === env.documents[docIdx].id && f.page === i)
                    .map((f: any) => (
                      <div key={f.id} className={`fbox ${recStatus[f.recipient_id] === 'completed' ? 'fbox-done' : ''}`} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, ['--pc' as any]: recColor[f.recipient_id], cursor: 'default', fontSize: 11 }}>
                        <span className="fbox-label">{recStatus[f.recipient_id] === 'completed' ? '✓ ' : ''}{f.value && f.type !== 'signature' && f.type !== 'initials' ? f.value : f.label}</span>
                      </div>
                    ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default function EnvelopePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { me } = useSession();
  const q = useQuery({ queryKey: ['envelope', id], queryFn: () => get(`/api/v1/envelopes/${id}`), refetchInterval: (d) => ((d.state.data as any)?.status === 'sent' ? 15_000 : false) });
  const audit = useQuery({ queryKey: ['envelope', id, 'audit'], queryFn: () => get(`/api/v1/envelopes/${id}/audit`) });
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<null | { name: string; url: string }>(null);
  const { confirm, node: confirmNode } = useConfirm();
  const env = q.data;
  const canWrite = !!env?.can_edit;
  useEffect(() => {
    if (env?.status === 'draft') nav(`/envelopes/${id}/edit`, { replace: true });
  }, [env?.status]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['envelope', id] });
  };
  const events = useMemo(() => [...(audit.data?.events ?? [])].reverse(), [audit.data]);
  if (q.isLoading || !env) return <div style={{ padding: 60 }}><Spinner /></div>;
  if (q.isError) return <div className="page"><Callout kind="stop">{errorText(q.error)}</Callout></div>;

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      toast(ok);
      refresh();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const actors = env.recipients.filter((r: any) => r.kind !== 'viewer');
  const done = actors.filter((r: any) => r.status === 'completed').length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="page-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <Link to="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 8, marginLeft: -10 }}><ArrowLeft /> {t('Übersicht')}</Link>
          <h1 style={{ overflowWrap: 'anywhere' }}>{env.title}</h1>
          <div className="row row-wrap" style={{ marginTop: 10 }}>
            <StatusPill status={env.status} />
            {env.test_mode && <span className="tag-test">TEST</span>}
            <span className="muted">{t('{d} von {n} erledigt', { d: done, n: actors.length })}</span>
            {env.external_ref && <span className="mono muted">{env.external_ref}</span>}
            {env.owner && <span className="muted">· {env.owner.name}</span>}
          </div>
        </div>
        <div className="row">
          {env.status === 'sent' && canWrite && (
            <button className="btn" onClick={() => setVoidOpen(true)}><Ban /> {t('Vorgang widerrufen')}</button>
          )}
          {canWrite && (
            <button className="btn" onClick={() => act(async () => { const r = await post(`/api/v1/envelopes/${id}/duplicate`); nav(`/envelopes/${r.id}/edit`); }, t('Kopie angelegt'))}>
              <Repeat /> {t('Erneut verwenden')}
            </button>
          )}
        </div>
      </div>

      {env.status === 'completed' && (
        <div className="sheet complete-hero" style={{ marginBottom: 20 }}>
          <Paraph size={84} draw />
          <div className="grow">
            <h2>{t('Alle haben unterschrieben.')}</h2>
            <p className="muted">{t('Abgeschlossen {when}. Das Dokument ist versiegelt; jede spätere Änderung wäre nachweisbar.', { when: fmtDate(env.completed_at) })}</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => download(`/api/v1/envelopes/${id}/files/final`)}><Download /> {t('PDF herunterladen')}</button>
        </div>
      )}
      {env.status === 'declined' && (
        <div style={{ marginBottom: 20 }}>
          <Callout kind="stop">
            <strong>{t('Abgelehnt von {name}', { name: env.recipients.find((r: any) => r.status === 'declined')?.name ?? '' })}</strong>
            {env.recipients.find((r: any) => r.status === 'declined')?.decline_reason && <div>„{env.recipients.find((r: any) => r.status === 'declined')?.decline_reason}“</div>}
            <div>{t('Der Vorgang ist beendet. Mit „Erneut verwenden“ legen Sie eine bearbeitbare Kopie an.')}</div>
          </Callout>
        </div>
      )}
      {env.status === 'voided' && <div style={{ marginBottom: 20 }}><Callout>{t('Widerrufen.')} {env.void_reason}</Callout></div>}
      {env.status === 'expired' && <div style={{ marginBottom: 20 }}><Callout>{t('Abgelaufen am {d}. Offene Links sind ungültig.', { d: fmtDate(env.expires_at) })}</Callout></div>}

      <div className="env-layout">
        <Preview env={env} />
        <div className="stack">
          <div className="sheet">
            <div className="sheet-head"><h2 className="grow">{t('Beteiligte')}</h2>{env.signing_order === 'sequential' && <span className="hint">{t('nacheinander')}</span>}</div>
            {env.recipients.filter((r: any) => r.status !== 'delegated' || true).map((r: any) => (
              <div key={r.id} className="recipient-card">
                <Avatar name={r.name} status={r.status} />
                <div style={{ minWidth: 0 }}>
                  <div className="recipient-name">{r.name} {r.delegated_from && <span className="hint">({t('Vertretung')})</span>}</div>
                  <div className="recipient-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</div>
                  <div className="recipient-sub">
                    {t(RSTATUS[r.status] ?? r.status)}
                    {r.completed_at ? ` · ${fmtRelative(r.completed_at)}` : r.opened_at ? ` · ${t('geöffnet')} ${fmtRelative(r.opened_at)}` : r.sent_at ? ` · ${fmtRelative(r.sent_at)}` : ''}
                    {r.kind === 'viewer' && ` · ${t('erhält Kopie')}`}
                  </div>
                </div>
                {env.status === 'sent' && canWrite && ['sent', 'opened'].includes(r.status) && (
                  <Menu trigger={(open) => <button className="icon-btn" onClick={open} aria-label={t('Aktionen')}><MoreHorizontal /></button>}>
                    {() => (
                      <>
                        <button onClick={() => act(() => post(`/api/v1/envelopes/${id}/recipients/${r.id}/remind`), t('Erinnerung versendet'))}><Bell /> {t('Erinnern (neuer Link)')}</button>
                        <button
                          onClick={async () => {
                            if (!(await confirm({ title: t('Neuen Link ausstellen?'), text: t('Der bisherige Link von {name} wird ungültig. Sie geben den neuen Link selbst weiter.', { name: r.name }), action: t('Link ausstellen') }))) return;
                            try {
                              const x = await post(`/api/v1/envelopes/${id}/recipients/${r.id}/link`);
                              setLink({ name: r.name, url: x.url });
                            } catch (e) {
                              toast(errorText(e), 'error');
                            }
                          }}
                        >
                          <Link2 /> {t('Link selbst weitergeben')}
                        </button>
                        {me?.principal.kind === 'user' && (
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: t('Vor Ort unterschreiben'), text: t('{name} unterschreibt jetzt auf diesem Gerät. Prüfen Sie die Identität persönlich – das wird mit Ihrem Namen protokolliert.', { name: r.name }), action: t('Starten') }))) return;
                              try {
                                const x = await post(`/api/v1/envelopes/${id}/recipients/${r.id}/in-person`);
                                sessionStorage.setItem('paraph.signer', x.session);
                                sessionStorage.setItem('paraph.signer.return', `/envelopes/${id}`);
                                nav('/s/session');
                              } catch (e) {
                                toast(errorText(e), 'error');
                              }
                            }}
                          >
                            <PenTool /> {t('Vor Ort unterschreiben')}
                          </button>
                        )}
                      </>
                    )}
                  </Menu>
                )}
              </div>
            ))}
          </div>

          {env.status === 'completed' && (
            <div className="sheet">
              <div className="sheet-head"><h2>{t('Ergebnis')}</h2></div>
              <div className="download-grid">
                <button className="download" onClick={() => download(`/api/v1/envelopes/${id}/files/final`)}><FileCheck2 /><div><strong>{t('Unterschriebenes PDF')}</strong><span>{t('mit Abschlussbestätigung, versiegelt')}</span></div></button>
                {env.final_documents?.length > 1 && env.final_documents.map((d: any) => (
                  <button key={d.document_id} className="download" onClick={() => download(`/api/v1/envelopes/${id}/files/${d.document_id}`)}><FilePlus2 /><div><strong>{d.name}</strong><span>{t('einzelnes Dokument')}</span></div></button>
                ))}
                <button className="download" onClick={() => download(`/api/v1/envelopes/${id}/files/certificate`)}><ShieldCheck /><div><strong>{t('Abschlussbestätigung')}</strong><span>{t('wer, wann, wie – zum Vorlegen')}</span></div></button>
                <button className="download" onClick={() => download(`/api/v1/envelopes/${id}/files/evidence`)}><FileArchive /><div><strong>{t('Nachweispaket (ZIP)')}</strong><span>{t('alle Fassungen, Protokoll, signiertes Manifest')}</span></div></button>
                <button className="download" onClick={() => download(`/api/v1/envelopes/${id}/files/audit`)}><FileJson /><div><strong>{t('Audit-Trail (JSON)')}</strong><span>{t('maschinenlesbar, verkettet')}</span></div></button>
              </div>
            </div>
          )}

          <div className="sheet">
            <div className="sheet-head"><h2 className="grow">{t('Verlauf')}</h2>{audit.data?.chain && (audit.data.chain.ok ? <span className="pill pill-done">{t('Kette intakt')}</span> : <span className="pill pill-stop">{t('Kette beschädigt')}</span>)}</div>
            <ul className="timeline">
              {events.slice(0, 40).map((e: any) => {
                const ic = eventIcon(e.type);
                const who = e.actor.type === 'system' ? t('System') : e.actor.name;
                return (
                  <li key={e.seq}>
                    <span className={`dot ${ic.cls}`}>{ic.icon}</span>
                    <div>
                      <div className="what">{t(EVENT_TEXT[e.type] ?? e.type)} <span className="muted">· {who}</span></div>
                      <div className="when" title={e.ts}>{fmtDate(e.ts)}{e.data?.ip ? ` · ${e.data.ip}` : ''}{e.data?.method ? ` · ${e.data.method}` : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sheet">
            <div className="sheet-head"><h2>{t('Integrität')}</h2></div>
            <dl className="integrity">
              {env.documents.map((d: any) => (
                <div key={d.id}>
                  <dt>{d.name} · {t('maßgebliche Fassung')}</dt>
                  <dd className="mono" title={d.sha256}>{shortHash(d.sha256)}</dd>
                </div>
              ))}
              {env.result && (
                <>
                  <dt>{t('Unterschriebenes PDF')}</dt>
                  <dd className="mono" title={env.result.final_sha256}>{shortHash(env.result.final_sha256)}</dd>
                  <dt>{t('Siegel')}</dt>
                  <dd>{env.result.seal.standard}{env.result.seal.timestamped ? ` · ${t('mit Zeitstempel')}` : ''} · {env.result.seal.subject}</dd>
                </>
              )}
              <dt>{t('Ereigniskette')}</dt>
              <dd>{audit.data ? t('{n} Einträge, Kopf {h}', { n: audit.data.chain.count, h: shortHash(audit.data.chain.head) }) : '…'}</dd>
              <dt>{t('Signaturstufe')}</dt>
              <dd>{t('Einfache elektronische Signatur (EES)')}</dd>
            </dl>
          </div>
        </div>
      </div>

      {voidOpen && (
        <Dialog
          title={t('Vorgang widerrufen')}
          onClose={() => setVoidOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setVoidOpen(false)}>{t('Abbrechen')}</button>
              <button className="btn btn-ink" onClick={() => act(async () => { await post(`/api/v1/envelopes/${id}/void`, { reason }); setVoidOpen(false); }, t('Vorgang widerrufen'))}><Ban /> {t('Vorgang widerrufen')}</button>
            </>
          }
        >
          <div className="stack">
            <p className="muted">{t('Alle offenen Links werden sofort ungültig. Wer schon eingeladen war, erhält eine kurze Nachricht. Bereits geleistete Unterschriften bleiben im Protokoll.')}</p>
            <div className="field">
              <label className="label" htmlFor="reason">{t('Grund (wird mitgeteilt)')}</label>
              <textarea id="reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        </Dialog>
      )}
      {link && (
        <Dialog title={t('Link für {name}', { name: link.name })} onClose={() => setLink(null)} footer={<button className="btn btn-primary" onClick={() => setLink(null)}>{t('Fertig')}</button>}>
          <div className="stack">
            <Callout kind="warn">{t('Nur an diese Person weitergeben. Der Link wird nicht erneut angezeigt.')}</Callout>
            <div className="secret-box"><span className="grow">{link.url}</span><button className="icon-btn" style={{ color: '#fff' }} onClick={() => { navigator.clipboard.writeText(link.url); toast(t('Link kopiert')); }} aria-label={t('Kopieren')}><Copy /></button></div>
          </div>
        </Dialog>
      )}
      {confirmNode}
    </div>
  );
}
