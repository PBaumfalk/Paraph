// Screenshots für README und Handbuch (docs/screenshots) mit erfundenen Demodaten.
// Kein Test im eigentlichen Sinn: läuft nur mit PARAPH_SCREENSHOTS=1, z. B.
//   npm run build && PARAPH_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
// Galerie aller Hauptansichten: zusätzlich PARAPH_SCREENSHOTS_OUT=.tmp/galerie
import { test, expect, devices, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { clearMail, waitMail, setupOrLogin, drawSignature } from './helpers';

const OUT = process.env.PARAPH_SCREENSHOTS_OUT ?? 'docs/screenshots';
// Mit eigenem Ausgabeverzeichnis entstehen zusätzlich Galeriebilder aller Hauptansichten (für die Gestaltung)
const GALLERY = !!process.env.PARAPH_SCREENSHOTS_OUT;
test.skip(process.env.PARAPH_SCREENSHOTS !== '1', 'nur mit PARAPH_SCREENSHOTS=1');

/** Vertrag im A4-Format (erfundene Firma); liefert die Bytes und die Lage der Unterschriftszeilen (0..1, von oben). */
async function vertrag(partner: string, heading = 'Arbeitsvertrag') {
  const doc = await PDFDocument.create();
  doc.setTitle(heading);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.addPage([595, 842]);
  const grey = rgb(0.35, 0.37, 0.42);
  let y = 790;
  p.drawText('Nordlicht Software GmbH', { x: 60, y, size: 13, font: bold });
  p.drawText('Hafenstraße 8 · 20457 Hamburg · Geschäftsführung: Anna Albers', { x: 60, y: y - 16, size: 8.5, font, color: grey });
  p.drawLine({ start: { x: 60, y: y - 26 }, end: { x: 535, y: y - 26 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) });
  y -= 70;
  p.drawText(heading, { x: 60, y, size: 20, font: bold });
  y -= 30;
  const line = (t: string, f = font, size = 10) => {
    p.drawText(t, { x: 60, y, size, font: f });
    y -= size + 5;
  };
  line('zwischen');
  line('Nordlicht Software GmbH, Hafenstraße 8, 20457 Hamburg', bold);
  line('– Unternehmen –');
  y -= 6;
  line('und');
  line(`${partner}, Lindenstraße 4, 22767 Hamburg`, bold);
  line('– Vertragspartnerin –');
  y -= 14;
  const paras: [string, string[]][] = [
    ['§ 1 Gegenstand', ['Die Vertragspartnerin wird ab dem 01.01.2027 als Softwareentwicklerin tätig. Ort der', 'Tätigkeit ist Hamburg; mobiles Arbeiten ist nach Absprache möglich.']],
    ['§ 2 Vergütung', ['Die Vergütung beträgt 5.200 Euro brutto monatlich, zahlbar jeweils zum Monatsende.', 'Überstunden werden durch Freizeit ausgeglichen.']],
    ['§ 3 Arbeitszeit und Urlaub', ['Die regelmäßige Arbeitszeit beträgt 38 Stunden pro Woche. Der Urlaubsanspruch', 'beträgt 30 Arbeitstage im Kalenderjahr.']],
    ['§ 4 Vertraulichkeit', ['Über Geschäftsgeheimnisse ist auch nach dem Ende der Zusammenarbeit Stillschweigen', 'zu bewahren. Einzelheiten regelt die beigefügte Vertraulichkeitsvereinbarung.']],
  ];
  for (const [h, ls] of paras) {
    line(h, bold, 11);
    y -= 1;
    for (const l of ls) line(l);
    y -= 10;
  }
  const sigY = 150;
  for (const [x, label] of [[60, 'Ort, Datum, Unterschrift Vertragspartnerin'], [320, 'Nordlicht Software GmbH']] as const) {
    p.drawLine({ start: { x, y: sigY }, end: { x: x + 215, y: sigY }, thickness: 0.6, color: grey });
    p.drawText(label, { x, y: sigY - 13, size: 8.5, font, color: grey });
  }
  return {
    bytes: Buffer.from(await doc.save()),
    // Felder über der linken Linie: Ort (schmal) und Unterschrift
    ort: { x: 60 / 595, y: (842 - sigY - 34) / 842, w: 70 / 595, h: 22 / 842 },
    sig: { x: 135 / 595, y: (842 - sigY - 44) / 842, w: 140 / 595, h: 42 / 842 },
  };
}

async function csrf(page: Page) {
  return (await (await page.request.get('/api/auth/state')).json()).session.csrf as string;
}

async function envelope(page: Page, title: string, mandant: string, email: string, send: boolean) {
  const pdf = await vertrag(mandant, title.split(' ')[0]);
  const r = await page.request.post('/api/v1/envelopes', {
    headers: { 'x-csrf-token': await csrf(page) },
    data: {
      title,
      documents: [{ name: `${title}.pdf`, file_base64: pdf.bytes.toString('base64') }],
      recipients: [{ ref: 'm', name: mandant, email }],
      fields: [
        { type: 'text', document: 0, recipient: 'm', page: 0, ...pdf.ort, label: 'Ort' },
        { type: 'signature', document: 0, recipient: 'm', page: 0, ...pdf.sig },
      ],
      send,
      acknowledge_form_risk: true,
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()).id as string;
}

test('Screenshots', async ({ page, browser }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await clearMail();
  await setupOrLogin(page);

  // Bestand: abgeschlossen, unterwegs, Entwurf
  const done = await envelope(page, 'Arbeitsvertrag Schneider', 'Lena Schneider', 'lena.schneider@example.org', true);
  const weber = await envelope(page, 'Arbeitsvertrag Weber', 'Jonas Weber', 'jonas.weber@example.org', true);
  await envelope(page, 'Auftragsbestätigung Klein GmbH', 'Sabine Klein', 'sabine.klein@example.org', true);
  await envelope(page, 'Vollmacht Yilmaz', 'Deniz Yilmaz', 'deniz.yilmaz@example.org', true);
  await envelope(page, 'Datenschutzeinwilligung Hoffmann', 'Mia Hoffmann', 'mia.hoffmann@example.org', true);
  const draft = await envelope(page, 'Dienstleistungsvertrag Krüger', 'Petra Krüger', 'petra.krueger@example.org', false);

  // Unterzeichnerin auf dem iPhone
  const mail = await waitMail('lena.schneider@example.org', 'bittet Sie um Ihre Unterschrift');
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'de-DE' });
  const phone = await ctx.newPage();
  await phone.goto(mail.link!);
  await expect(phone.getByRole('button', { name: /Los geht/ })).toBeVisible();
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: `${OUT}/signieren-start-iphone.png` });
  await phone.getByRole('button', { name: /Los geht/ }).click();
  await drawSignature(phone);
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${OUT}/signieren-zeichnen-iphone.png` });
  await phone.getByRole('button', { name: 'Übernehmen' }).click();
  await phone.getByRole('button', { name: 'Nächstes Feld' }).click();
  // Auf dem Telefon öffnet ein Textfeld ein Eingabeblatt
  if (!(await phone.getByRole('dialog').isVisible())) await phone.getByRole('button', { name: /^Ort/ }).click();
  await phone.getByRole('dialog').locator('input').fill('Köln');
  await phone.getByRole('button', { name: 'Weiter', exact: true }).click();
  await phone.getByRole('button', { name: /Abschließen/ }).click();
  if (GALLERY) {
    await expect(phone.getByLabel('Ich stimme der obigen Erklärung zu.')).toBeVisible();
    await phone.waitForTimeout(600);
    await phone.screenshot({ path: `${OUT}/signieren-erklaerung-iphone.png` });
  }
  await phone.getByLabel('Ich stimme der obigen Erklärung zu.').check();
  await phone.getByRole('button', { name: 'Verbindlich unterschreiben' }).click();
  await expect(phone.getByRole('button', { name: 'Unterschriebenes Dokument' })).toBeVisible({ timeout: 30_000 });
  const dl = phone.waitForEvent('download');
  await phone.getByRole('button', { name: 'Unterschriebenes Dokument' }).click();
  const signed = readFileSync((await (await dl).path())!);
  await phone.waitForTimeout(1600); // Siegel aufgedrückt, Tinte gezogen
  await phone.screenshot({ path: `${OUT}/signieren-fertig-iphone.png` });

  // Prüfstelle (Desktop)
  await page.goto('/verify');
  await page.locator('input[type=file]').setInputFiles({ name: 'Arbeitsvertrag Schneider.pdf', mimeType: 'application/pdf', buffer: signed });
  await expect(page.getByRole('heading', { name: 'Echt und unverändert' })).toBeVisible();
  await page.getByRole('button', { name: /eingebettete Siegel prüfen/ }).click();
  await expect(page.getByText(/Siegel dieser Instanz gültig/)).toBeVisible();
  await page.waitForTimeout(2000); // Häkchen-Animation
  await page.screenshot({ path: `${OUT}/pruefstelle.png`, fullPage: true });

  // Übersicht, abgeschlossener Vorgang, Editor
  await page.goto('/');
  await expect(page.getByText('Arbeitsvertrag Weber').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/uebersicht.png` });
  await page.goto(`/envelopes/${done}`);
  await expect(page.getByText('Alle haben unterschrieben.')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/vorgang.png` });
  await page.goto(`/envelopes/${draft}/edit`);
  await expect(page.locator('.pdfpage[data-page="0"] canvas').first()).toBeVisible();
  await expect(page.locator('.fbox')).toHaveCount(2);
  // Unterschriftszeile mit den Feldern ins Bild holen
  await page.locator('.fbox').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.locator('.fbox').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/editor.png` });

  if (!GALLERY) return;
  const shot = async (p: Page, name: string, full = false) => {
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  };
  await page.goto(`/envelopes/${done}`);
  await expect(page.getByText('Alle haben unterschrieben.')).toBeVisible({ timeout: 20_000 });
  await shot(page, 'vorgang-ganz', true);
  await page.goto(`/envelopes/${weber}`);
  await shot(page, 'vorgang-unterwegs');
  // Versandschritt mit Formhinweis (Vollmacht)
  const vollmacht = await envelope(page, 'Vollmacht Becker', 'Tom Becker', 'tom.becker@example.org', false);
  await page.goto(`/envelopes/${vollmacht}/edit`);
  await expect(page.locator('.fbox')).toHaveCount(2);
  await page.getByRole('button', { name: 'Weiter zum Versand' }).click();
  await shot(page, 'versand');
  await page.goto(`/envelopes/${vollmacht}/edit`);
  await shot(page, 'editor-start');
  for (const [path, name] of [['/forms', 'formulare'], ['/settings/api', 'einst-api'], ['/settings/trust', 'einst-siegel'], ['/docs/api', 'api-doku'], ['/templates', 'vorlagen'], ['/activity', 'aktivitaet'], ['/settings/profile', 'einst-profil'], ['/settings/org', 'einst-organisation'], ['/settings/branding', 'einst-erscheinungsbild'], ['/settings/team', 'einst-team'], ['/settings/system', 'einst-system']] as const) {
    await page.goto(path);
    await shot(page, name);
  }
  await page.goto('/');
  await page.getByRole('button', { name: /Suchen/ }).first().click();
  await shot(page, 'suche');
  await page.keyboard.press('Escape');
  // Neues Dokument: leerer Editor
  const fresh = await browser.newContext({ locale: 'de-DE', viewport: { width: 1440, height: 900 } });
  const anon = await fresh.newPage();
  await anon.goto('/login');
  await shot(anon, 'anmeldung');
  await phone.goto('/verify');
  await phone.locator('input[type=file]').setInputFiles({ name: 'Arbeitsvertrag Schneider.pdf', mimeType: 'application/pdf', buffer: signed });
  await expect(phone.getByRole('heading', { name: 'Echt und unverändert' })).toBeVisible();
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: `${OUT}/pruefstelle-iphone.png`, fullPage: true });
  const ph2 = await (await browser.newContext({ ...devices['iPhone 14'], locale: 'de-DE' })).newPage();
  await ph2.goto('/');
  await setupOrLogin(ph2).catch(() => {});
  await shot(ph2, 'uebersicht-iphone');
});
