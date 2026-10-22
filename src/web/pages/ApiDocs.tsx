import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Logo, Spinner } from '../components/ui';
import { t } from '../lib/i18n';

function Md({ text }: { text: string }) {
  return (
    <div className="md">
      {text.split('\n\n').map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="mono">$1</code>').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
      ))}
    </div>
  );
}

const WEBHOOK_NODE = `import crypto from 'node:crypto';

// secret = "whsec_…" aus Paraph, headers/body unverändert vom Request
export function verify(secret, headers, rawBody) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signed = \`\${headers['webhook-id']}.\${headers['webhook-timestamp']}.\${rawBody}\`;
  const expected = crypto.createHmac('sha256', key).update(signed).digest('base64');
  const age = Math.abs(Date.now() / 1000 - Number(headers['webhook-timestamp']));
  if (age > 300) return false; // Wiederholungsangriffe abwehren
  return headers['webhook-signature'].split(' ').some((s) => {
    const v = s.split(',')[1] ?? '';
    return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected));
  });
}`;

export default function ApiDocs() {
  const q = useQuery({ queryKey: ['openapi'], queryFn: () => fetch('/api/v1/openapi.json').then((r) => r.json()) });
  const [open, setOpen] = useState<string | null>(null);
  const ops = useMemo(() => {
    if (!q.data) return [];
    const out: any[] = [];
    for (const [path, item] of Object.entries<any>(q.data.paths)) for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) out.push({ path, method: m, ...item[m], params: [...(item.parameters ?? []), ...(item[m].parameters ?? [])] });
    return out;
  }, [q.data]);
  if (q.isLoading) return <Spinner />;
  const base = q.data.servers?.[0]?.url ?? location.origin;
  const tags = q.data.tags.map((x: any) => x.name);
  const curl = (o: any) => {
    const ex = o.requestBody?.content?.['application/json']?.example;
    const url = base + o.path.replace(/\{(\w+)\}/g, ':$1');
    return [`curl -X ${o.method.toUpperCase()} '${url}'`, o.security?.length === 0 ? null : `  -H 'Authorization: Bearer $PARAPH_KEY'`, ex ? `  -H 'Content-Type: application/json'` : null, o.params?.some((p: any) => p.name === 'Idempotency-Key') ? `  -H 'Idempotency-Key: $(uuidgen)'` : null, ex ? `  -d '${JSON.stringify(ex, null, 2)}'` : null].filter(Boolean).join(' \\\n');
  };
  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="signer-bar"><Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo small /></Link><a className="btn btn-sm" href="/api/v1/openapi.json" style={{ marginLeft: 'auto' }}>openapi.json</a></header>
      <div className="page page-narrow">
        <div className="page-head"><div className="grow"><h1>{q.data.info.title}</h1><p className="sub">v{q.data.info.version} · {base}</p></div></div>
        <section className="sheet sheet-pad"><Md text={q.data.info.description} /></section>
        {tags.map((tag: string) => (
          <section key={tag} className="sheet" style={{ marginTop: 18 }}>
            <div className="sheet-head"><h2>{tag}</h2></div>
            {ops.filter((o) => (o.tags ?? ['Sonstiges'])[0] === tag).map((o) => {
              const k = o.method + o.path;
              return (
                <div key={k} className="api-op">
                  <button className="row" style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }} onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                    <span className={`api-method ${o.method}`}>{o.method.toUpperCase()}</span>
                    <span className="mono" style={{ fontSize: 13.5 }}>{o.path}</span>
                    <span className="muted grow" style={{ fontSize: 13.5 }}>{o.summary}</span>
                  </button>
                  {open === k && (
                    <div className="stack-sm" style={{ marginTop: 12 }}>
                      {o.description && <Md text={o.description} />}
                      {o.params.length > 0 && <div className="hint">{t('Parameter')}: {o.params.map((p: any) => `${p.name}${p.required ? '*' : ''} (${p.in})`).join(', ')}</div>}
                      <div className="code">{curl(o)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        <section className="sheet sheet-pad" style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 10 }}>{t('Webhook-Signatur prüfen (Node.js)')}</h2>
          <div className="code">{WEBHOOK_NODE}</div>
        </section>
      </div>
    </div>
  );
}
