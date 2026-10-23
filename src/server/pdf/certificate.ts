// Abschlussbestätigung (Completion Certificate) als PDF.
import { PDFDocument, rgb, type PDFPage, type Color } from 'pdf-lib';
import { FontChain } from './fonts.js';

export interface CertSigner {
  name: string;
  email: string;
  kind: string;
  role: string;
  authMethod: string;
  authNote: string;
  ip: string;
  userAgent: string;
  sentAt: string | null;
  openedAt: string | null;
  authAt: string | null;
  completedAt: string | null;
  consentVersion: string;
  consentSha256: string;
  signatureImage?: Buffer;
  signatureMethod?: string;
  inPersonHost?: string;
  delegatedFrom?: string;
}

export interface CertData {
  locale: 'de' | 'en';
  timezone: string;
  orgName: string;
  envelopeId: string;
  title: string;
  createdAt: string;
  sentAt: string | null;
  completedAt: string;
  sender: string;
  testMode: boolean;
  documents: { name: string; pages: number; sha256: string; sourceSha256: string; sourceKind: string }[];
  signers: CertSigner[];
  viewers: { name: string; email: string }[];
  events: { ts: string; type: string; actor: string }[];
  chainHead: string;
  chainCount: number;
  sealSubject: string;
  sealCertSha256: string;
  sealSource: string;
  verifyUrl: string;
  formNotes: { norm: string; label: string; level: string }[];
  formAck?: { by: string; at: string } | null;
}

const L = {
  de: {
    title: 'Abschlussbestätigung',
    status: 'Vollständig unterzeichnet',
    envelope: 'Vorgang',
    id: 'Vorgangs-ID',
    org: 'Organisation',
    sender: 'Absender',
    created: 'Erstellt',
    sent: 'Versendet',
    completed: 'Abgeschlossen',
    documents: 'Dokumente (maßgebliche Fassung)',
    pages: 'Seiten',
    hash: 'SHA-256',
    source: 'Hochgeladene Datei',
    participants: 'Beteiligte',
    viewers: 'Erhalten eine Kopie',
    kind: { signer: 'Unterzeichner', approver: 'Freigabe', filler: 'Ausfüllende Person', witness: 'Zeuge', viewer: 'Kopie' } as Record<string, string>,
    email: 'E-Mail',
    auth: 'Zugangsnachweis',
    ip: 'IP-Adresse',
    device: 'Gerät',
    tSent: 'Eingeladen',
    tOpened: 'Geöffnet',
    tAuth: 'Bestätigt',
    tDone: 'Abgeschlossen',
    consent: 'Erklärung',
    method: { drawn: 'gezeichnet', typed: 'getippt', uploaded: 'als Bild hochgeladen' } as Record<string, string>,
    inPerson: 'Vor Ort unterschrieben, begleitet von',
    delegated: 'Vertretung für',
    events: 'Ereignisprotokoll (Auszug)',
    integrity: 'Integrität und Nachweis',
    chain: (n: number, h: string) => `Das Ereignisprotokoll besteht aus ${n} kryptografisch verketteten Einträgen. Kettenkopf (SHA-256): ${h}`,
    seal: (s: string, h: string, src: string) =>
      `Die Dokumente sind mit dem technischen Plattformsiegel versiegelt (PAdES, ${src === 'uploaded' ? 'eigenes Zertifikat' : 'selbst signiertes Instanzzertifikat'}: ${s}; Zertifikat SHA-256 ${h}). Das Siegel weist nach, dass die Datei seit der Versiegelung nicht verändert wurde. Es ist keine persönliche Signatur der Unterzeichner und kein qualifiziertes elektronisches Siegel.`,
    verify: (u: string) => `Unabhängige Prüfung: Datei unter ${u} prüfen (der Hash wird lokal im Browser berechnet) oder mit einem PDF-Signaturprüfprogramm.`,
    level: 'Signaturstufe',
    levelText:
      'Einfache elektronische Signatur (EES) i. S. v. Art. 3 Nr. 10 eIDAS-VO. Sie ersetzt nicht die gesetzliche Schriftform (§ 126 BGB) und erfüllt nicht die elektronische Form (§ 126a BGB), die eine qualifizierte elektronische Signatur voraussetzt.',
    formNotes: 'Formhinweise',
    formAck: (by: string, at: string) => `Formhinweise vor dem Versand ausdrücklich bestätigt von ${by} am ${at}.`,
    test: 'TESTMODUS – kein rechtsverbindlicher Vorgang',
    page: 'Seite',
    utc: 'UTC',
  },
  en: {
    title: 'Certificate of Completion',
    status: 'Fully signed',
    envelope: 'Envelope',
    id: 'Envelope ID',
    org: 'Organisation',
    sender: 'Sender',
    created: 'Created',
    sent: 'Sent',
    completed: 'Completed',
    documents: 'Documents (authoritative version)',
    pages: 'Pages',
    hash: 'SHA-256',
    source: 'Uploaded file',
    participants: 'Participants',
    viewers: 'Receive a copy',
    kind: { signer: 'Signer', approver: 'Approver', filler: 'Form filler', witness: 'Witness', viewer: 'Copy' } as Record<string, string>,
    email: 'Email',
    auth: 'Authentication',
    ip: 'IP address',
    device: 'Device',
    tSent: 'Invited',
    tOpened: 'Opened',
    tAuth: 'Verified',
    tDone: 'Completed',
    consent: 'Declaration',
    method: { drawn: 'drawn', typed: 'typed', uploaded: 'uploaded image' } as Record<string, string>,
    inPerson: 'Signed in person, hosted by',
    delegated: 'Delegate for',
    events: 'Event log (excerpt)',
    integrity: 'Integrity and evidence',
    chain: (n: number, h: string) => `The event log consists of ${n} cryptographically chained entries. Chain head (SHA-256): ${h}`,
    seal: (s: string, h: string, src: string) =>
      `The documents are sealed with the platform's technical seal (PAdES, ${src === 'uploaded' ? 'custom certificate' : 'self-signed instance certificate'}: ${s}; certificate SHA-256 ${h}). The seal proves the file has not been modified since sealing. It is not a personal signature of the signers and not a qualified electronic seal.`,
    verify: (u: string) => `Independent verification: check the file at ${u} (the hash is computed locally in the browser) or with a PDF signature validator.`,
    level: 'Signature level',
    levelText: 'Simple electronic signature (SES) within the meaning of Art. 3(10) eIDAS. It does not replace statutory written form requirements.',
    formNotes: 'Form notes',
    formAck: (by: string, at: string) => `Form notes explicitly acknowledged before sending by ${by} on ${at}.`,
    test: 'TEST MODE – not legally binding',
    page: 'Page',
    utc: 'UTC',
  },
};

const C = {
  ink: rgb(0.1, 0.11, 0.15),
  muted: rgb(0.42, 0.44, 0.5),
  line: rgb(0.88, 0.87, 0.84),
  accent: rgb(0.051, 0.361, 0.388),
  paper: rgb(0.973, 0.965, 0.95),
  ok: rgb(0.04, 0.52, 0.34),
  red: rgb(0.8, 0.2, 0.2),
};

export async function buildCertificate(d: CertData): Promise<Uint8Array> {
  const t = L[d.locale];
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.title} – ${d.title}`);
  doc.setProducer('Paraph');
  doc.setCreator('Paraph');
  const reg = await FontChain.create(doc, 'regular');
  const semi = await FontChain.create(doc, 'semibold');
  const mono = await FontChain.create(doc, 'mono');
  const serif = await FontChain.create(doc, 'serif');

  const W = 595.28;
  const H = 841.89;
  const M = 52;
  const CW = W - 2 * M;
  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const dt = new Date(iso);
    const local = new Intl.DateTimeFormat(d.locale === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: d.timezone }).format(dt);
    return `${local} (${d.timezone}) · ${dt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`;
  };

  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (d.testMode) {
      page.drawRectangle({ x: 0, y: H - 22, width: W, height: 22, color: C.red });
      semi.draw(page, t.test, M, H - 15, 9, rgb(1, 1, 1));
      y -= 12;
    }
  };
  const need = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  const text = (f: FontChain, s: string, size: number, color: Color = C.ink, x = M, maxW = CW, lh = 1.4) => {
    const lines = f.wrap(s, size, maxW);
    for (const ln of lines) {
      need(size * lh);
      f.draw(page, ln, x, y - size, size, color);
      y -= size * lh;
    }
  };
  const label = (s: string) => {
    need(26);
    y -= 10;
    semi.draw(page, s.toUpperCase(), M, y - 8, 7.5, C.muted);
    y -= 16;
  };
  const kv = (k: string, v: string, f: FontChain = reg, size = 9) => {
    const kw = 118;
    const lines = f.wrap(v, size, CW - kw);
    need(lines.length * size * 1.45);
    reg.draw(page, k, M, y - size, size, C.muted);
    lines.forEach((ln, i) => f.draw(page, ln, M + kw, y - size - i * size * 1.45, size, C.ink));
    y -= lines.length * size * 1.45 + 2;
  };
  const rule = () => {
    need(10);
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line });
    y -= 6;
  };

  newPage();
  // Kopf
  mono.draw(page, d.orgName.toUpperCase(), M, y - 8, 7.5, C.muted);
  y -= 30;
  serif.draw(page, t.title, M, y - 30, 32, C.ink);
  y -= 46;
  text(semi, d.title, 13);
  y -= 4;
  page.drawCircle({ x: M + 4, y: y - 6, size: 4, color: C.ok });
  semi.draw(page, t.status, M + 14, y - 9.5, 9.5, C.ok);
  y -= 22;
  rule();
  kv(t.id, d.envelopeId, mono, 8.5);
  kv(t.org, d.orgName);
  kv(t.sender, d.sender);
  kv(t.created, fmt(d.createdAt));
  kv(t.sent, fmt(d.sentAt));
  kv(t.completed, fmt(d.completedAt));
  kv(t.level, t.levelText);

  label(t.documents);
  d.documents.forEach((doc_, i) => {
    need(44);
    semi.draw(page, `${i + 1}. ${semi.fit(doc_.name, 10, CW - 80)}`, M, y - 10, 10, C.ink);
    const pl = `${doc_.pages} ${doc_.pages === 1 ? t.page : t.pages}`;
    reg.draw(page, pl, W - M - reg.width(pl, 9), y - 10, 9, C.muted);
    y -= 16;
    mono.draw(page, `${t.hash}  ${doc_.sha256}`, M + 12, y - 7.5, 7, C.muted);
    y -= 11;
    mono.draw(page, `${t.source} (${doc_.sourceKind.toUpperCase()})  ${doc_.sourceSha256}`, M + 12, y - 7.5, 7, C.muted);
    y -= 15;
  });

  label(t.participants);
  for (const s of d.signers) {
    const imgH = s.signatureImage ? 46 : 0;
    need(150 + imgH);
    const top = y;
    page.drawRectangle({ x: M, y: y - 4, width: 2, height: -8, color: C.accent });
    semi.draw(page, s.name, M + 10, y - 11, 11.5, C.ink);
    const k = (t.kind[s.kind] ?? s.kind) + (s.role ? ` · ${s.role}` : '');
    reg.draw(page, k, W - M - reg.width(k, 9), y - 11, 9, C.muted);
    y -= 20;
    if (s.signatureImage) {
      try {
        const img = await doc.embedPng(s.signatureImage);
        const sc = Math.min(180 / img.width, 42 / img.height);
        page.drawImage(img, { x: M + 10, y: y - img.height * sc, width: img.width * sc, height: img.height * sc });
        if (s.signatureMethod) reg.draw(page, `(${t.method[s.signatureMethod] ?? s.signatureMethod})`, M + 200, y - 24, 8, C.muted);
        y -= imgH;
      } catch {}
    }
    const sub = (k2: string, v: string, f = reg) => {
      const lines = f.wrap(v, 8.5, CW - 130);
      need(lines.length * 12);
      reg.draw(page, k2, M + 10, y - 8.5, 8, C.muted);
      lines.forEach((ln, i) => f.draw(page, ln, M + 130, y - 8.5 - i * 12, 8.5, C.ink));
      y -= lines.length * 12 + 1;
    };
    sub(t.email, s.email);
    if (s.delegatedFrom) sub(t.delegated, s.delegatedFrom);
    sub(t.auth, `${s.authMethod} – ${s.authNote}`);
    if (s.inPersonHost) sub(t.inPerson, s.inPersonHost);
    sub(t.tSent, fmt(s.sentAt));
    sub(t.tOpened, fmt(s.openedAt));
    if (s.authAt) sub(t.tAuth, fmt(s.authAt));
    sub(t.tDone, fmt(s.completedAt));
    sub(t.ip, s.ip || '—', mono);
    sub(t.device, s.userAgent || '—');
    sub(t.consent, `Version ${s.consentVersion} · SHA-256 ${s.consentSha256}`, mono);
    page.drawLine({ start: { x: M + 0.5, y: top - 2 }, end: { x: M + 0.5, y: y + 2 }, thickness: 1, color: C.line });
    y -= 12;
  }
  if (d.viewers.length) {
    label(t.viewers);
    for (const v of d.viewers) text(reg, `${v.name} · ${v.email}`, 9);
  }

  if (d.formNotes.length) {
    label(t.formNotes);
    for (const f of d.formNotes) text(reg, `${f.norm} – ${f.label}: ${f.level}`, 8.5);
    if (d.formAck) text(reg, t.formAck(d.formAck.by, fmt(d.formAck.at)), 8.5, C.muted);
  }

  label(t.events);
  for (const e of d.events) {
    need(12);
    mono.draw(page, e.ts.replace('T', ' ').replace(/\.\d+Z$/, 'Z'), M, y - 8, 7, C.muted);
    reg.draw(page, reg.fit(e.type, 8, 150), M + 108, y - 8, 8, C.ink);
    reg.draw(page, reg.fit(e.actor, 8, CW - 270), M + 268, y - 8, 8, C.muted);
    y -= 11.5;
  }

  label(t.integrity);
  text(reg, t.chain(d.chainCount, d.chainHead), 8.5);
  y -= 3;
  text(reg, t.seal(d.sealSubject, d.sealCertSha256, d.sealSource), 8.5);
  y -= 3;
  text(reg, t.verify(d.verifyUrl), 8.5, C.accent);

  pages.forEach((p, i) => {
    const s = `${t.title} · ${d.envelopeId} · ${t.page} ${i + 1}/${pages.length}`;
    reg.draw(p, s, M, 26, 7, C.muted);
    mono.draw(p, 'PARAPH', W - M - mono.width('PARAPH', 7), 26, 7, C.muted);
  });
  return doc.save({ useObjectStreams: false });
}
