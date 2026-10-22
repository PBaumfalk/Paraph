// Lokaler RFC-3161-Zeitstempeldienst für Tests – unabhängige Implementierung (OpenSSL `ts -reply`).
// Modus „replay“ liefert absichtlich immer dieselbe, alte Antwort (Angriff: fremder Zeitstempel).
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestTsa {
  url: string;
  caPem: string;
  mode: { replay: boolean; fail: boolean };
  requests: number;
  close: () => Promise<void>;
}

export async function startTestTsa(): Promise<TestTsa> {
  const dir = mkdtempSync(join(tmpdir(), 'paraph-tsa-'));
  const ossl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(dir, 'ext.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\n');
  ossl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-subj', '/CN=Test TSA CA', '-days', '30');
  ossl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'tsa.key', '-out', 'tsa.csr', '-subj', '/CN=Test TSA/O=Paraph Tests');
  ossl('x509', '-req', '-in', 'tsa.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'tsa.pem', '-days', '30', '-extfile', 'ext.cnf');
  writeFileSync(join(dir, 'serial'), '01\n');
  writeFileSync(
    join(dir, 'tsa.cnf'),
    `[ tsa ]\ndefault_tsa = tsa_config\n[ tsa_config ]\ndir = ${dir}\nserial = $dir/serial\nsigner_cert = $dir/tsa.pem\ncerts = $dir/ca.pem\nsigner_key = $dir/tsa.key\nsigner_digest = sha256\ndefault_policy = 1.2.3.4.1\ndigests = sha256\naccuracy = secs:1\nordering = no\ntsa_name = no\ness_cert_id_chain = no\ness_cert_id_alg = sha256\n`,
  );
  let lastReply: Buffer | null = null;
  const t: TestTsa = { url: '', caPem: readFileSync(join(dir, 'ca.pem'), 'utf8'), mode: { replay: false, fail: false }, requests: 0, close: async () => {} };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      t.requests++;
      if (t.mode.fail) {
        res.writeHead(503).end();
        return;
      }
      if (t.mode.replay && lastReply) {
        res.writeHead(200, { 'content-type': 'application/timestamp-reply' }).end(lastReply);
        return;
      }
      const q = join(dir, `q${t.requests}.tsq`);
      const r = join(dir, `r${t.requests}.tsr`);
      writeFileSync(q, Buffer.concat(chunks));
      ossl('ts', '-reply', '-config', join(dir, 'tsa.cnf'), '-queryfile', q, '-out', r);
      lastReply = readFileSync(r);
      res.writeHead(200, { 'content-type': 'application/timestamp-reply' }).end(lastReply);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  t.url = `http://127.0.0.1:${addr.port}/tsr`;
  t.close = () => new Promise((resolve) => server.close(() => resolve()));
  return t;
}
