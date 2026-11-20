// TEST D (Ablehnung, Vertretung bei Linkübergabe), E (Widerruf: alter Link wirkungslos), H (Vorlage über die Oberfläche verwenden)
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clearMail, waitMail, pdfFile, setupOrLogin } from './helpers';

async function apiEnvelope(page: any, title: string, email: string, extra: Record<string, unknown> = {}) {
  const csrf = (await (await page.request.get('/api/auth/state')).json()).session.csrf;
  const file = await pdfFile(`${title}.pdf`, { title });
  const r = await page.request.post('/api/v1/envelopes', {
    headers: { 'x-csrf-token': csrf },
    data: { title, documents: [{ name: `${title}.pdf`, file_base64: readFileSync(file).toString('base64') }], recipients: [{ ref: 'x', name: 'Xenia', email }], fields: [{ type: 'signature', document: 0, recipient: 'x', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }], send: true, ...extra },
  });
  expect(r.status()).toBe(201);
  const j = await r.json();
  return Object.assign(j.id as string, { links: (j.signing_links ?? []) as { url: string }[] });
}

test('D: Ablehnung mit Begründung – Status und kein Abschluss möglich', async ({ page, browser }) => {
  await clearMail();
  await setupOrLogin(page);
  const id = await apiEnvelope(page, 'Vergleichsvorschlag', 'xenia.d@example.org');
  const mail = await waitMail('xenia.d@example.org', 'bittet');
  const s = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  await s.goto(mail.link!);
  await s.getByRole('button', { name: 'Weitere Optionen' }).click();
  await s.getByRole('button', { name: 'Ablehnen' }).click();
  await s.getByLabel('Begründung (optional, wird übermittelt)').fill('Die Vergleichssumme ist zu niedrig.');
  await s.getByRole('dialog').getByRole('button', { name: 'Ablehnen' }).click();
  await expect(s.getByRole('heading', { name: 'Abgelehnt' })).toBeVisible();
  await page.goto(`/envelopes/${id}`);
  await expect(page.getByText('Abgelehnt von Xenia')).toBeVisible();
  await expect(page.getByText('„Die Vergleichssumme ist zu niedrig.“')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF herunterladen' })).toHaveCount(0);
  await waitMail('anna@nordlicht.test', 'Abgelehnt');
  // Alter Link zeigt nur noch den Hinweis
  const s2 = await (await browser.newContext()).newPage();
  await s2.goto(mail.link!);
  await expect(s2.getByRole('heading', { name: /Link ungültig|Beendet/ })).toBeVisible();
});

test('D2: Vertretung bei Linkübergabe – „Weitergegeben“ statt „Abgelehnt“, Absender stellt den Link aus', async ({ page, browser }) => {
  await clearMail();
  await setupOrLogin(page);
  const env = await apiEnvelope(page, 'Vollmacht Vertretung', 'xenia.d2@example.org', { notify: false, allow_delegation: true });
  const s = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  await s.goto(env.links[0].url);
  await s.getByRole('button', { name: 'Weitere Optionen' }).click();
  await s.getByRole('button', { name: 'An Vertretung weitergeben' }).click();
  const d = s.getByRole('dialog');
  await d.getByLabel('Name').fill('Vera Vertretung');
  await d.getByLabel('E-Mail-Adresse').fill('vera.d2@example.org');
  await d.getByRole('button', { name: 'Weitergeben' }).click();
  await expect(s.getByRole('heading', { name: 'Weitergegeben' })).toBeVisible();
  await expect(s.getByText('Vera Vertretung unterschreibt an Ihrer Stelle')).toBeVisible();
  await expect(s.getByRole('heading', { name: 'Abgelehnt' })).toHaveCount(0);
  await waitMail('anna@nordlicht.test', 'Link übergeben');
  await page.goto(`/envelopes/${env}`);
  await expect(page.getByText('Ohne E-Mail-Einladung: wartet auf Ihren Link.')).toBeVisible();
  await page.getByText('Ohne E-Mail-Einladung').getByRole('button', { name: 'Link selbst weitergeben' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Link ausstellen' }).click();
  await expect(page.getByRole('dialog', { name: 'Link für Vera Vertretung' })).toBeVisible();
});

test('E: Widerruf – geöffnete Sitzung und alter Link sind wirkungslos', async ({ page, browser }) => {
  await clearMail();
  await setupOrLogin(page);
  const id = await apiEnvelope(page, 'Falsche Fassung', 'xenia.e@example.org');
  const mail = await waitMail('xenia.e@example.org', 'bittet');
  const s = await (await browser.newContext()).newPage();
  await s.goto(mail.link!);
  await expect(s.getByRole('heading', { name: 'Falsche Fassung' })).toBeVisible();
  await page.goto(`/envelopes/${id}`);
  await page.getByRole('button', { name: 'Vorgang widerrufen' }).click();
  await page.getByLabel('Grund (wird mitgeteilt)').fill('Es war die falsche Fassung.');
  await page.getByRole('dialog').getByRole('button', { name: 'Vorgang widerrufen' }).click();
  await expect(page.getByText('Widerrufen.').first()).toBeVisible();
  await waitMail('xenia.e@example.org', 'Zurückgezogen');
  // Offene Sitzung: Unterschreiben schlägt fehl
  await s.getByRole('button', { name: /Los geht/ }).click();
  const r = await s.evaluate(async () => (await fetch('/api/sign/view', { headers: { 'x-signer-session': sessionStorage.getItem('paraph.signer') ?? '' } })).status);
  expect([401, 410]).toContain(r);
  const s2 = await (await browser.newContext()).newPage();
  await s2.goto(mail.link!);
  await expect(s2.getByRole('heading', { name: /Link ungültig|Zurückgezogen/ })).toBeVisible();
});

test('H: Vorlage anlegen, veröffentlichen, mit wenigen Klicks verwenden', async ({ page }) => {
  await clearMail();
  await setupOrLogin(page);
  await page.goto('/templates');
  await page.getByRole('button', { name: /Neue Vorlage|Erste Vorlage anlegen/ }).first().click();
  await page.getByRole('button', { name: 'Auftragsbestätigung' }).click();
  await page.getByRole('button', { name: 'Anlegen und Dokument hochladen' }).click();
  await page.waitForURL(/\/templates\/tpl_[^/]+\/edit$/);
  const file = await pdfFile('vorlage.pdf', { title: 'Auftragsbestätigung' });
  await page.locator('.drop-card input[type=file]').setInputFiles(file);
  const pageEl = page.locator('.pdfpage[data-page="0"]').first();
  await expect(pageEl.locator('canvas')).toBeVisible();
  const pb = (await pageEl.boundingBox())!;
  await page.locator('.pal-item', { hasText: 'Unterschrift' }).first().click();
  await pageEl.click({ position: { x: pb.width * 0.3, y: pb.height * 0.82 } });
  await expect(page.locator('.save-state')).toHaveText('Gespeichert', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.getByText('v1').first()).toBeVisible();
  // Verwenden: Name + E-Mail genügen
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Verwenden' }).first().click();
  await page.getByPlaceholder('Name', { exact: true }).fill('Bruno Bauer');
  await page.getByPlaceholder('E-Mail-Adresse', { exact: true }).fill('bruno@example.org');
  await page.getByRole('dialog').getByRole('button', { name: 'Versenden' }).click();
  await page.waitForURL(/\/envelopes\/env_/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Auftragsbestätigung – Bruno Bauer');
  const mail = await waitMail('bruno@example.org', 'Auftragsbestätigung – Bruno Bauer');
  expect(mail.link).toBeTruthy();
});
