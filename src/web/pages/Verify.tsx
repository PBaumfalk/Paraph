import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck, ShieldAlert, FileSearch, Lock } from 'lucide-react';
import { Logo, Paraph, Spinner, Callout, Seal } from '../components/ui';
import { sha256File } from '../lib/pdf';
import { t, useLang, setLang, getLang } from '../lib/i18n';
import { fmtDate } from '../lib/format';

const KIND: Record<string, string> = {
  final: 'Unterschriebenes Dokument (Gesamt-PDF)',
  final_document: 'Unterschriebenes Einzeldokument',
  certificate: 'Abschlussbestätigung',
  audit: 'Audit-Trail',
  evidence: 'Nachweispaket',
  authoritative: 'Maßgebliche Fassung vor der Unterschrift',
  source: 'Ursprünglich hochgeladene Datei',
};

const VERDICT: Record<string, string> = {
  valid: 'Siegel dieser Instanz gültig – Datei seit dem Siegel unverändert',
  foreign: 'Signatur nicht von dieser Instanz – Herkunft unbekannt',
  modified: 'Datei wurde nach dem Siegel verändert',
  timestamp_invalid: 'Siegel gültig, Zeitstempel jedoch ungültig',
  invalid: 'Siegel ungültig',
};

export default function Verify() {
  useLang();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState('');
  const [res, setRes] = useState<any>(null);
  const [sig, setSig] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const check = async (f: File) => {
    setFile(f);
    setRes(null);
    setSig(null);
    setBusy(true);
    try {
      const h = await sha256File(f);
      setHash(h);
      const r = await fetch('/api/public/verify/hash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: h }) });
      setRes(await r.json());
    } finally {
      setBusy(false);
    }
  };
  const checkSeal = async () => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/public/verify/signature', { method: 'POST', body: fd });
    setSig(await r.json());
    setBusy(false);
  };
  return (
    <div className="signer">
      <header className="signer-bar"><Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo small /></Link><button className="icon-btn" onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}>{getLang() === 'de' ? 'EN' : 'DE'}</button></header>
      <div className="page page-narrow" style={{ width: '100%' }}>
        <div className="page-head"><div className="grow"><h1>{t('Dokument prüfen')}</h1><p className="sub">{t('Stimmt diese Datei Bit für Bit mit dem überein, was hier unterschrieben wurde?')}</p></div></div>
        <label className={`verify-drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) check(f); }}>
          <FileSearch size={36} color="var(--tinte)" />
          <strong>{file ? file.name : t('Datei hierher ziehen oder auswählen')}</strong>
          <span className="hint"><Lock size={12} style={{ display: 'inline', verticalAlign: -1 }} /> {t('Der Fingerabdruck (SHA-256) wird in Ihrem Browser berechnet. Die Datei wird dafür nicht hochgeladen.')}</span>
          <input type="file" hidden onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
        </label>
        <div style={{ height: 18 }} />
        {busy && <Spinner />}
        {res && !busy && (
          res.found ? (
            <div className="stack">
              {res.matches.map((m: any, i: number) => (
                <div key={i} className="sheet verdict">
                  <Seal size={68} press />
                  <div className="grow stack-sm">
                    <h2>{t('Echt und unverändert')}</h2>
                    <p>{t(KIND[m.kind] ?? m.kind)} {t('zu „{title}“', { title: m.envelope.title })} · {m.org}</p>
                    {m.envelope.test_mode && <Callout kind="warn">{t('Testvorgang – nicht rechtsverbindlich.')}</Callout>}
                    <p className="muted">{t('Abgeschlossen')}: {fmtDate(m.envelope.completed_at)} · {t('Ereigniskette')}: {m.audit_chain.ok ? t('intakt ({n} Einträge)', { n: m.audit_chain.events }) : t('BESCHÄDIGT')}</p>
                    {m.signers.length > 0 && <p className="muted">{t('Unterschrieben von')}: {m.signers.map((s: any) => `${s.name} (${fmtDate(s.completed_at)})`).join(', ')}</p>}
                    <p className="hint mono" style={{ overflowWrap: 'anywhere' }}>SHA-256 {hash}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sheet verdict">
              <ShieldAlert size={48} color="var(--stop)" />
              <div className="stack-sm grow">
                <h2>{t('Nicht gefunden')}</h2>
                <p className="muted">{t('Diese Datei stimmt mit keinem hier gesicherten Dokument überein. Schon eine einzige geänderte Stelle – auch durch erneutes Speichern oder Drucken in PDF – ergibt einen anderen Fingerabdruck.')}</p>
                <p className="hint mono" style={{ overflowWrap: 'anywhere' }}>SHA-256 {hash}</p>
              </div>
            </div>
          )
        )}
        {file && res && !busy && /\.pdf$/i.test(file.name) && !sig && (
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={checkSeal}><ShieldCheck /> {t('Zusätzlich das eingebettete Siegel prüfen')}</button>
            <p className="hint" style={{ marginTop: 6 }}>{t('Dafür wird die Datei an diesen Server übertragen, nur im Arbeitsspeicher geprüft und nicht gespeichert.')}</p>
          </div>
        )}
        {sig && (
          <div className="sheet sheet-pad" style={{ marginTop: 16 }}>
            {sig.signatures?.length ? sig.signatures.map((s: any) => (
              <div key={s.index} className="stack-sm">
                <strong>{t(VERDICT[s.verdict] ?? VERDICT.invalid)}</strong>
                <span className="hint">{s.subfilter} · {s.signerSubject}{s.timestamp ? ` · ${t('Zeitstempel')} ${fmtDate(s.timestamp)}${s.timestampAuthority ? ` (${s.timestampAuthority})` : ''}` : ''}</span>
                {s.verdict === 'valid' && <p className="hint">{t('Das ist das technische Plattformsiegel dieser Paraph-Instanz. Es belegt die Unversehrtheit seit dem Abschluss – es ist weder ein qualifiziertes Siegel noch eine persönliche Signatur der Unterzeichner.')}</p>}
                {s.verdict === 'foreign' && <Callout kind="warn">{t('Die Signatur ist rechnerisch korrekt, stammt aber nicht von dieser Instanz. Wer sie erstellt hat, lässt sich hier nicht feststellen.')}</Callout>}
                {s.verdict === 'modified' && <Callout kind="warn">{t('Nach dem Siegel wurden Daten angehängt oder geändert.')}</Callout>}
                {s.timestampOk === false && <Callout kind="warn">{t('Der eingebettete Zeitstempel ist ungültig')}{s.timestampError ? `: ${s.timestampError}` : ''}</Callout>}
                {s.timestampOk && s.timestampTrusted === null && <p className="hint">{t('Zeitstempel rechnerisch geprüft. Ob der Zeitstempeldienst vertrauenswürdig ist, wurde hier nicht geprüft (kein Vertrauensanker eingerichtet).')}</p>}
                {s.timestampOk && s.timestampTrusted === false && <Callout kind="warn">{t('Der Zeitstempeldienst gehört nicht zu den eingerichteten vertrauenswürdigen Anbietern.')}</Callout>}
              </div>
            )) : <p>{t('Kein eingebettetes Siegel gefunden.')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
