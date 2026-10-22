// Abschluss eines Vorgangs: finale PDFs, Abschlussbestätigung, Audit-Trail, Nachweispaket.
// Ergebnisse werden genau einmal geschrieben und sind danach unveränderlich (DB-Trigger).
import yazl from 'yazl';
import { PDFDocument } from 'pdf-lib';
import type { Ctx } from '../context.js';
import { tx } from '../db/index.js';
import { canonicalJson, sha256Hex } from '../lib/crypto.js';
import { appendAudit, listAudit, verifyChain } from './audit.js';
import { documentsOf, envRow, fieldsOf, recipientsOf, senderName, signingUrl } from './envelopes.js';
import { getOrg } from './orgs.js';
import { registerJob } from './jobs.js';
import { queueMail } from './mail.js';
import { emit } from './webhooks.js';
import { getSealKey } from './sealkeys.js';
import { renderFields, type RenderItem } from '../pdf/render.js';
import { buildCertificate, type CertData } from '../pdf/certificate.js';
import { sealPdf, cmsSignDetached } from '../pdf/seal.js';
import { activeKeys, type LogicField } from '../../shared/fieldlogic.js';
import { ruleById, LEVEL_TEXT } from '../../shared/formrules.js';
import { hashToken, secretToken } from '../lib/crypto.js';
import { VERIFY_AUDIT_PY } from './verify-audit-script.js';

const AUTH_LABEL: Record<string, { de: [string, string]; en: [string, string] }> = {
  link: { de: ['Persönlicher Link', 'Besitz des per E-Mail zugestellten Links'], en: ['Personal link', 'Possession of the link delivered by email'] },
  email_otp: { de: ['E-Mail-Code', 'Zugriff auf das E-Mail-Postfach zum Zeitpunkt der Prüfung (kein Identitätsnachweis)'], en: ['Email code', 'Access to the mailbox at the time of the check (not proof of identity)'] },
  sms_otp: { de: ['SMS-Code', 'Zugriff auf die Mobilnummer zum Zeitpunkt der Prüfung (kein Identitätsnachweis)'], en: ['SMS code', 'Access to the mobile number at the time of the check (not proof of identity)'] },
  access_code: { de: ['Zugangscode', 'Kenntnis eines separat mitgeteilten Codes (kein Identitätsnachweis)'], en: ['Access code', 'Knowledge of a separately shared code (not proof of identity)'] },
  in_person_host: { de: ['Vor Ort', 'Identität durch die gastgebende Person vor Ort geprüft'], en: ['In person', 'Identity checked in person by the host'] },
};

function displayValue(f: any, v: string, locale: 'de' | 'en'): string {
  if (f.type === 'date' || f.type === 'signed_date') {
    const [Y, M, D] = v.split('-');
    const fmt = f.config.dateFormat ?? (locale === 'de' ? 'DD.MM.YYYY' : 'YYYY-MM-DD');
    return fmt === 'DD.MM.YYYY' ? `${D}.${M}.${Y}` : fmt === 'MM/DD/YYYY' ? `${M}/${D}/${Y}` : `${Y}-${M}-${D}`;
  }
  return v;
}

function shortId(envelopeId: string) {
  return sha256Hex(envelopeId).slice(0, 10).toUpperCase();
}

export async function finalizeEnvelope(ctx: Ctx, envelopeId: string) {
  const env = envRow(ctx, envelopeId);
  if (!env) return;
  const existing = ctx.db.prepare('SELECT 1 FROM envelope_results WHERE envelope_id = ?').get(envelopeId);
  if (existing || env.status !== 'sent') return;
  const recs = recipientsOf(ctx, envelopeId);
  if (recs.some((r) => r.kind !== 'viewer' && !['completed', 'delegated'].includes(r.status))) return;

  const events = listAudit(ctx.db, envelopeId);
  const chain = verifyChain(envelopeId, events);
  if (!chain.ok) throw new Error(`Audit-Kette beschädigt bei Eintrag ${chain.brokenAt}: ${chain.reason} – Abschluss abgebrochen`);

  const org = getOrg(ctx, env.org_id);
  const locale = env.locale;
  const docs = documentsOf(ctx, envelopeId);
  const fields = fieldsOf(ctx, envelopeId);
  const values: Record<string, string> = Object.fromEntries(fields.map((f) => [f.key, f.value ?? '']));
  const active = activeKeys(fields.map((f): LogicField => ({ key: f.key, type: f.type, required: f.required, config: f.config })), values);
  const byRec = new Map(recs.map((r) => [r.id, r]));
  const completedAt = ctx.now();
  const sid = shortId(envelopeId);
  const seal = await getSealKey(ctx, env.org_id);

  // Unterschriftsbilder laden (nur die, die in Feldern verwendet wurden)
  const sigRows = new Map<string, any>();
  for (const f of fields) if ((f.type === 'signature' || f.type === 'initials') && f.value) {
    const s = ctx.db.prepare('SELECT * FROM signatures WHERE id = ?').get(f.value) as any;
    if (s) sigRows.set(s.id, { ...s, png: await ctx.blobs.get(s.blob_id) });
  }
  const attRows = ctx.db.prepare(`SELECT a.* FROM recipient_attachments a JOIN recipients r ON r.id = a.recipient_id WHERE r.envelope_id = ?`).all(envelopeId) as any[];

  // Abschlussbestätigung
  const signerEvents = new Map<string, any>();
  const consentEvents = new Map<string, any>();
  for (const e of events) {
    if (['recipient.signed', 'recipient.approved', 'recipient.submitted'].includes(e.type)) signerEvents.set(String(e.data.recipient_id), e);
    if (e.type === 'recipient.consented') consentEvents.set(String(e.data.recipient_id), e);
  }
  const users = new Map((ctx.db.prepare('SELECT id, name, email FROM users').all() as any[]).map((u) => [u.id, u]));
  const certData: CertData = {
    locale,
    timezone: org.settings.timezone,
    orgName: org.name,
    envelopeId,
    title: env.title,
    createdAt: env.created_at,
    sentAt: env.sent_at,
    completedAt: completedAt.toISOString(),
    sender: senderName(ctx, env),
    testMode: !!env.test_mode,
    documents: docs.map((d) => ({ name: d.name, pages: d.pages.length, sha256: d.sha256, sourceSha256: d.source_sha256, sourceKind: d.source_kind })),
    signers: recs
      .filter((r) => r.kind !== 'viewer' && r.status === 'completed')
      .map((r) => {
        const se = signerEvents.get(r.id);
        const ce = consentEvents.get(r.id);
        const method = (se?.data.auth_method as string) ?? 'link';
        const sessionKind = se?.data.session_kind as string | undefined;
        const authKey = sessionKind === 'inperson' ? 'in_person_host' : method;
        const firstSig = (se?.data.signatures as any[] | undefined)?.[0];
        const sigRow = firstSig ? sigRows.get(firstSig.signature_id) : undefined;
        const host = se?.data.in_person_host ? users.get(String(se.data.in_person_host)) : undefined;
        const delegatedFrom = r.delegated_from ? byRec.get(r.delegated_from) : undefined;
        return {
          name: r.name,
          email: r.email,
          kind: r.kind,
          role: r.role,
          authMethod: (AUTH_LABEL[authKey] ?? AUTH_LABEL.link)[locale][0],
          authNote: (AUTH_LABEL[authKey] ?? AUTH_LABEL.link)[locale][1],
          ip: String(se?.data.ip ?? ''),
          userAgent: String(se?.data.user_agent ?? ''),
          sentAt: r.sent_at,
          openedAt: r.opened_at,
          authAt: r.auth_at,
          completedAt: r.completed_at,
          consentVersion: String(ce?.data.consent_version ?? ''),
          consentSha256: String(ce?.data.consent_sha256 ?? ''),
          signatureImage: sigRow?.png,
          signatureMethod: sigRow?.method,
          inPersonHost: host ? `${host.name} (${host.email})` : undefined,
          delegatedFrom: delegatedFrom ? `${delegatedFrom.name} (${delegatedFrom.email})` : undefined,
        };
      }),
    viewers: recs.filter((r) => r.kind === 'viewer').map((r) => ({ name: r.name, email: r.email })),
    events: events.map((e) => ({ ts: e.ts, type: e.type, actor: e.actor.type === 'system' ? 'System' : `${(e.actor as any).name ?? ''}${(e.actor as any).email ? ' <' + (e.actor as any).email + '>' : ''}` })),
    chainHead: chain.head,
    chainCount: chain.count,
    sealSubject: seal.info.subject,
    sealCertSha256: seal.info.sha256,
    sealSource: seal.source,
    verifyUrl: `${ctx.cfg.appUrl}/verify`,
    formNotes: (JSON.parse(env.form_classes) as string[]).map(ruleById).filter(Boolean).map((r) => ({ norm: r!.norm, label: r!.label, level: LEVEL_TEXT[r!.minLevel][locale] })),
    formAck: env.form_ack_at ? { by: env.form_ack_by ?? '', at: env.form_ack_at } : null,
  };
  const certBytes = await buildCertificate(certData);
  const reason = locale === 'de' ? `Plattformsiegel Paraph – Vorgang ${sid} abgeschlossen` : `Paraph platform seal – envelope ${sid} completed`;
  const sealOpts = { reason, name: `Paraph (${org.name})`, tsaUrl: ctx.cfg.tsaUrl, signedAt: completedAt };
  const sealedCert = await sealPdf(certBytes, seal.key, sealOpts);

  // Finale Dokumente
  const finals: { docId: string; name: string; bytes: Buffer; sha256: string; timestamped: boolean; tsErr?: string }[] = [];
  const combined = await PDFDocument.create();
  for (const d of docs) {
    const source = await ctx.blobs.get(d.blob_id);
    if (sha256Hex(source) !== d.sha256) throw new Error(`Dokument ${d.id}: Hash weicht von der maßgeblichen Fassung ab`);
    const items: RenderItem[] = [];
    for (const f of fields.filter((x) => x.document_id === d.id)) {
      if (!active.has(f.key)) continue;
      const v = f.value ?? '';
      if (!v) continue;
      const base = { page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, fontSize: f.config.fontSize };
      if (f.type === 'signature' || f.type === 'initials') {
        const s = sigRows.get(v);
        if (!s) throw new Error(`Unterschrift ${v} fehlt`);
        const r = byRec.get(f.recipient_id);
        const when = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: org.settings.timezone }).format(new Date(r?.completed_at ?? completedAt));
        items.push({ ...base, image: s.png, caption: f.type === 'signature' ? `Paraph ${sid} · ${r?.name ?? ''} · ${when}` : `Paraph ${sid}` });
      } else if (f.type === 'checkbox') {
        items.push({ ...base, checked: v === 'true' });
      } else if (f.type === 'attachment') {
        const a = attRows.find((x) => x.id === v);
        items.push({ ...base, text: a ? `${locale === 'de' ? 'Anhang' : 'Attachment'}: ${a.name}` : '' });
      } else {
        items.push({ ...base, text: displayValue(f, v, locale) });
      }
    }
    const rendered = await renderFields(source, d.pages, items, { watermark: env.test_mode ? (locale === 'de' ? 'TEST – NICHT GÜLTIG' : 'TEST – NOT VALID') : undefined });
    // Abschlussbestätigung anhängen (Einstellung der Organisation)
    let withCert = rendered;
    if (org.settings.appendCertificate) {
      const pd = await PDFDocument.load(rendered, { updateMetadata: false });
      const cd = await PDFDocument.load(certBytes);
      (await pd.copyPages(cd, cd.getPageIndices())).forEach((p) => pd.addPage(p));
      withCert = await pd.save({ useObjectStreams: false });
    }
    const sealed = await sealPdf(withCert, seal.key, sealOpts);
    finals.push({ docId: d.id, name: d.name, bytes: sealed.pdf, sha256: sha256Hex(sealed.pdf), timestamped: sealed.timestamped, tsErr: sealed.timestampError });
    const rd = await PDFDocument.load(rendered, { updateMetadata: false });
    (await combined.copyPages(rd, rd.getPageIndices())).forEach((p) => combined.addPage(p));
  }
  let combinedBytes: Buffer;
  if (docs.length === 1) combinedBytes = finals[0].bytes;
  else {
    const cd = await PDFDocument.load(certBytes);
    if (org.settings.appendCertificate) (await combined.copyPages(cd, cd.getPageIndices())).forEach((p) => combined.addPage(p));
    combined.setTitle(env.title);
    combinedBytes = (await sealPdf(await combined.save({ useObjectStreams: false }), seal.key, sealOpts)).pdf;
  }

  // Audit-Trail (strukturiert)
  const auditDoc = {
    format: 'paraph-audit/1',
    generated_at: completedAt.toISOString(),
    envelope: { id: envelopeId, title: env.title, org: org.name, created_at: env.created_at, sent_at: env.sent_at, completed_at: completedAt.toISOString(), signature_level: env.signature_level, test_mode: !!env.test_mode },
    documents: docs.map((d) => ({ id: d.id, name: d.name, pages: d.pages.length, source_sha256: d.source_sha256, authoritative_sha256: d.sha256, final_sha256: finals.find((f) => f.docId === d.id)!.sha256 })),
    recipients: recs.map((r) => ({ id: r.id, name: r.name, email: r.email, kind: r.kind, role: r.role, status: r.status, routing_order: r.routing_order, auth_method: r.auth_method, sent_at: r.sent_at, opened_at: r.opened_at, completed_at: r.completed_at, delegated_from: r.delegated_from })),
    chain: { algorithm: 'SHA-256 über kanonisches JSON {envelope_id, seq, ts, type, actor, data, prev_hash}', genesis: '0'.repeat(64), head: chain.head, count: chain.count },
    events,
    seal: { subject: seal.info.subject, certificate_sha256: seal.info.sha256, source: seal.source, timestamp_authority: ctx.cfg.tsaUrl ?? null },
  };
  const auditBytes = Buffer.from(JSON.stringify(auditDoc, null, 2));

  // Nachweispaket (ZIP) mit signiertem Manifest
  const files: { path: string; data: Buffer }[] = [];
  const safe = (s: string) => s.replace(/[^\p{L}\p{N} ._-]+/gu, '_').slice(0, 100);
  for (const f of finals) files.push({ path: `01_signiert/${safe(f.name)}.pdf`, data: f.bytes });
  files.push({ path: `02_abschlussbestaetigung.pdf`, data: sealedCert.pdf });
  files.push({ path: `03_audit-trail.json`, data: auditBytes });
  for (const d of docs) {
    files.push({ path: `04_massgebliche_fassung/${safe(d.name)}.pdf`, data: await ctx.blobs.get(d.blob_id) });
    files.push({ path: `05_hochgeladen/${safe(d.name)}.${d.source_kind}`, data: await ctx.blobs.get(d.source_blob_id) });
  }
  for (const [, s] of sigRows) files.push({ path: `06_unterschriften/${s.id}.png`, data: s.png });
  for (const a of attRows) files.push({ path: `07_anhaenge/${a.id}_${safe(a.name)}`, data: await ctx.blobs.get(a.blob_id) });
  files.push({ path: 'siegelzertifikat.pem', data: Buffer.from(seal.info.pem) });
  files.push({ path: 'pruefen/verify-audit.py', data: Buffer.from(VERIFY_AUDIT_PY) });
  const manifest = {
    format: 'paraph-evidence/1',
    envelope_id: envelopeId,
    created_at: completedAt.toISOString(),
    audit_chain_head: chain.head,
    files: files.map((f) => ({ path: f.path, sha256: sha256Hex(f.data), size: f.data.length })),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestSig = await cmsSignDetached(seal.key, manifestBytes, ctx.cfg.tsaUrl);
  files.push({ path: 'manifest.json', data: manifestBytes });
  files.push({ path: 'manifest.json.p7s', data: manifestSig.der });
  files.push({
    path: 'PRUEFANLEITUNG.txt',
    data: Buffer.from(
      `Paraph – Nachweispaket zu Vorgang ${envelopeId}\n\n` +
        `1. Unversehrtheit der Dateien: Die SHA-256-Werte aller Dateien stehen in manifest.json.\n` +
        `   Prüfen z. B. mit: shasum -a 256 <Datei>\n` +
        `2. Echtheit des Manifests (Plattformsiegel, CMS):\n` +
        `   openssl cms -verify -binary -inform DER -in manifest.json.p7s -content manifest.json -CAfile siegelzertifikat.pem -purpose any -out /dev/null\n` +
        `3. PDF-Siegel: Die PDFs in 01_signiert und die Abschlussbestätigung tragen eine PAdES-Signatur.\n` +
        `   Prüfbar mit Adobe Acrobat, pdfsig (Poppler) oder pyHanko. Das Instanzzertifikat ist selbst signiert;\n` +
        `   es als vertrauenswürdig zu markieren, ist eine bewusste Entscheidung (Fingerabdruck in der Abschlussbestätigung).\n` +
        `4. Ereigniskette: 03_audit-trail.json enthält alle Ereignisse; jeder Hash ergibt sich aus dem kanonischen JSON\n` +
        `   des Eintrags inklusive des vorherigen Hashes. Kettenkopf: ${chain.head}\n` +
        `   Unabhängig prüfen: python3 pruefen/verify-audit.py 03_audit-trail.json\n` +
        `5. Online-Prüfung: ${ctx.cfg.appUrl}/verify (die Datei verlässt dabei den Browser nicht).\n\n` +
        `Hinweis: Das Plattformsiegel weist die Unversehrtheit seit Abschluss nach. Es ist keine persönliche Signatur\n` +
        `der Unterzeichner und kein qualifiziertes Siegel. Die Unterschriften sind einfache elektronische Signaturen (EES).\n`,
    ),
  });
  const zipBytes = await new Promise<Buffer>((resolve, reject) => {
    const z = new yazl.ZipFile();
    const mtime = completedAt;
    for (const f of files) z.addBuffer(f.data, f.path, { mtime, compress: !f.path.endsWith('.pdf') && !f.path.endsWith('.png') });
    z.end();
    const chunks: Buffer[] = [];
    z.outputStream.on('data', (c: Buffer) => chunks.push(c));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    z.outputStream.on('error', reject);
  });

  // Speichern
  const blobs = {
    combined: await ctx.blobs.put(combinedBytes, { orgId: env.org_id, mime: 'application/pdf', kind: 'final' }),
    cert: await ctx.blobs.put(sealedCert.pdf, { orgId: env.org_id, mime: 'application/pdf', kind: 'certificate' }),
    audit: await ctx.blobs.put(auditBytes, { orgId: env.org_id, mime: 'application/json', kind: 'audit' }),
    zip: await ctx.blobs.put(zipBytes, { orgId: env.org_id, mime: 'application/zip', kind: 'evidence' }),
  };
  const finalBlobs = [] as { docId: string; name: string; blobId: string; sha256: string }[];
  for (const f of finals) {
    const b = docs.length === 1 ? blobs.combined : await ctx.blobs.put(f.bytes, { orgId: env.org_id, mime: 'application/pdf', kind: 'final' });
    finalBlobs.push({ docId: f.docId, name: f.name, blobId: b.id, sha256: b.sha256 });
  }
  const timestamped = finals.every((f) => f.timestamped) && sealedCert.timestamped;
  const tsError = finals.find((f) => f.tsErr)?.tsErr ?? sealedCert.timestampError;

  const done = tx(ctx.db, () => {
    const e = envRow(ctx, envelopeId)!;
    if (e.status !== 'sent' || ctx.db.prepare('SELECT 1 FROM envelope_results WHERE envelope_id = ?').get(envelopeId)) return false;
    const now = completedAt.toISOString();
    ctx.db
      .prepare(
        `INSERT INTO envelope_results (envelope_id, final_blob_id, final_sha256, certificate_blob_id, certificate_sha256, audit_blob_id, audit_sha256, evidence_blob_id, evidence_sha256, seal_info, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        envelopeId,
        blobs.combined.id,
        blobs.combined.sha256,
        blobs.cert.id,
        blobs.cert.sha256,
        blobs.audit.id,
        blobs.audit.sha256,
        blobs.zip.id,
        blobs.zip.sha256,
        JSON.stringify({ subject: seal.info.subject, certificate_sha256: seal.info.sha256, source: seal.source, standard: timestamped ? 'PAdES-B-T' : 'PAdES-B-B', timestamped, timestamp_error: tsError ?? null }),
        now,
      );
    for (const f of finalBlobs) ctx.db.prepare('INSERT INTO final_documents (envelope_id, document_id, name, blob_id, sha256) VALUES (?, ?, ?, ?, ?)').run(envelopeId, f.docId, f.name, f.blobId, f.sha256);
    const reg = ctx.db.prepare('INSERT OR IGNORE INTO hash_register (sha256, envelope_id, org_id, kind, label, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    reg.run(blobs.combined.sha256, envelopeId, env.org_id, 'final', env.title, now);
    for (const f of finalBlobs) reg.run(f.sha256, envelopeId, env.org_id, 'final_document', f.name, now);
    reg.run(blobs.cert.sha256, envelopeId, env.org_id, 'certificate', env.title, now);
    reg.run(blobs.audit.sha256, envelopeId, env.org_id, 'audit', env.title, now);
    reg.run(blobs.zip.sha256, envelopeId, env.org_id, 'evidence', env.title, now);
    for (const d of docs) {
      reg.run(d.sha256, envelopeId, env.org_id, 'authoritative', d.name, now);
      reg.run(d.source_sha256, envelopeId, env.org_id, 'source', d.name, now);
    }
    ctx.db.prepare(`UPDATE envelopes SET status = 'completed', completed_at = ?, finished_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status = 'sent'`).run(now, now, now, envelopeId);
    appendAudit(ctx.db, envelopeId, env.org_id, 'envelope.completed', { type: 'system' }, {
      final_sha256: blobs.combined.sha256,
      final_documents: finalBlobs.map((f) => ({ document_id: f.docId, sha256: f.sha256 })),
      certificate_sha256: blobs.cert.sha256,
      audit_sha256: blobs.audit.sha256,
      evidence_sha256: blobs.zip.sha256,
      seal: timestamped ? 'PAdES-B-T' : 'PAdES-B-B',
      chain_head_at_seal: chain.head,
    }, completedAt);

    // Abschlussmitteilungen mit neuem, persönlichem Downloadlink
    for (const r of recipientsOf(ctx, envelopeId)) {
      if (!['completed'].includes(r.status) && r.kind !== 'viewer') continue;
      const token = secretToken();
      ctx.db.prepare('UPDATE recipients SET token_hash = ?, token_issued_at = ?, status = CASE WHEN kind = ? THEN ? ELSE status END WHERE id = ?').run(hashToken(token), now, 'viewer', 'completed', r.id);
      queueMail(ctx, {
        orgId: env.org_id,
        envelopeId,
        recipientId: r.id,
        to: r.email,
        kind: 'completed',
        locale,
        link: signingUrl(ctx, env.org_id, token),
        suppress: !!env.test_mode,
        vars: { title: env.title, recipient: r.name, sender: senderName(ctx, env) },
        attachments: org.settings.attachCompletedPdf ? [{ filename: `${safe(env.title)}.pdf`, blobId: blobs.combined.id }] : [],
      });
    }
    const owner = env.owner_id ? (ctx.db.prepare('SELECT email FROM users WHERE id = ?').get(env.owner_id) as any) : null;
    if (owner) queueMail(ctx, { orgId: env.org_id, envelopeId, to: owner.email, kind: 'owner_completed', link: `${ctx.cfg.appUrl}/envelopes/${envelopeId}`, suppress: !!env.test_mode, vars: { title: env.title } });
    emit(ctx, env.org_id, 'envelope.completed', { envelope_id: envelopeId, final_sha256: blobs.combined.sha256 }, { testMode: !!env.test_mode });
    return true;
  });
  if (!done) {
    // Parallel abgeschlossen: eigene, ungenutzte Dateien verwerfen
    for (const b of [blobs.combined, blobs.cert, blobs.audit, blobs.zip]) await ctx.blobs.delete(b.id).catch(() => {});
  }
}

registerJob('finalize_envelope', async (ctx, { envelopeId }) => finalizeEnvelope(ctx, envelopeId));

export function auditCanonicalHash(obj: unknown) {
  return sha256Hex(canonicalJson(obj));
}
