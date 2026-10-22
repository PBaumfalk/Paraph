// TEST A – Administrator lädt PDF hoch, platziert Felder, lädt ein; Unterzeichnerin signiert; PDF wird geladen und geprüft.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clearMail, waitMail, pdfFile, setupOrLogin, drawSignature } from './helpers';
import { rasterize, diffBBox } from '../tests/helpers/pdfs';

test('A: Hochladen → Felder → Einladen → Unterschreiben → Herunterladen', async ({ page, browser }) => {
  await clearMail();
  await setupOrLogin(page);
  const file = await pdfFile('mandat.pdf', { title: 'Mandatsvereinbarung' });

  // Hochladen über die Ablagefläche
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Dokument unterschreiben lassen/ }).click();
  await (await chooser).setFiles(file);
  await page.waitForURL(/\/envelopes\/env_[^/]+\/edit$/);
  await expect(page.locator('.studio')).toBeVisible();
  const envId = page.url().split('/')[4];

  // Person
  await page.getByPlaceholder('Name', { exact: true }).first().fill('Erika Mustermann');
  await page.getByPlaceholder('E-Mail-Adresse', { exact: true }).first().fill('erika@example.org');

  // Unterschriftsfeld per Klick platzieren
  const pageEl = page.locator('.pdfpage[data-page="0"]').first();
  await expect(pageEl.locator('canvas')).toBeVisible();
  const pb = (await pageEl.boundingBox())!;
  await page.locator('.pal-item', { hasText: 'Unterschrift' }).first().click();
  await pageEl.click({ position: { x: pb.width * 0.3, y: pb.height * 0.82 } });
  await page.locator('.pal-item', { hasText: /^Text$/ }).click();
  await pageEl.click({ position: { x: pb.width * 0.7, y: pb.height * 0.86 } });
  await page.getByLabel('Beschriftung').fill('Ort');
  await expect(page.locator('.fbox')).toHaveCount(2);
  await expect(page.locator('.save-state')).toHaveText('Gespeichert', { timeout: 10_000 });

  // Versand
  await page.getByRole('button', { name: 'Weiter zum Versand' }).click();
  await page.getByRole('button', { name: 'Jetzt versenden' }).click();
  await page.waitForURL(new RegExp(`/envelopes/${envId}$`));
  await expect(page.getByText('Unterwegs').first()).toBeVisible();

  // Feldpositionen, wie sie der Server gespeichert hat
  const env = await (await page.request.get(`/api/v1/envelopes/${envId}`)).json();
  const sigField = env.fields.find((f: any) => f.type === 'signature');
  expect(sigField.x + sigField.w / 2).toBeCloseTo(0.3, 1);
  expect(sigField.y + sigField.h / 2).toBeCloseTo(0.82, 1);

  // Einladung kommt per SMTP an
  const mail = await waitMail('erika@example.org', 'bittet Sie um Ihre Unterschrift');
  expect(mail.link).toContain('/s/');

  // Unterzeichnerin (eigener Browser, kein Konto)
  const signer = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  await signer.goto(mail.link!);
  await expect(signer).toHaveURL(/\/s\/session$/); // Token ist aus der Adresszeile verschwunden
  await expect(signer.getByRole('heading', { name: env.title })).toBeVisible();
  await signer.getByRole('button', { name: /Los geht/ }).click();
  await expect(signer.getByRole('dialog', { name: 'Unterschrift erstellen' })).toBeVisible();
  await drawSignature(signer);
  await signer.getByRole('button', { name: 'Übernehmen' }).click();
  await signer.getByRole('button', { name: 'Nächstes Feld' }).click();
  await signer.getByLabel('Ort').fill('Köln');
  await signer.getByRole('button', { name: 'Abschließen' }).click();
  const final = signer.getByRole('button', { name: 'Verbindlich unterschreiben' });
  await expect(final).toBeDisabled();
  await signer.getByLabel('Ich habe die Dokumente gelesen und stimme der Erklärung zu.').check();
  await final.click();
  await expect(signer.getByRole('heading', { name: 'Unterschrieben' })).toBeVisible();
  await expect(signer.getByRole('button', { name: 'Unterschriebenes Dokument' })).toBeVisible({ timeout: 20_000 });

  // Admin sieht Abschluss live und lädt das PDF
  await page.reload();
  await expect(page.getByText('Alle haben unterschrieben.')).toBeVisible({ timeout: 20_000 });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF herunterladen' }).first().click();
  const path = await (await dl).path();
  const pdf = readFileSync(path!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  // Unabhängige Prüfung: Unterschrift erscheint im vorgesehenen Feld
  const orig = Buffer.from(await (await page.request.get(`/api/v1/envelopes/${envId}/documents/${env.documents[0].id}/pdf`)).body());
  const a = rasterize(orig, 0, 100), b = rasterize(pdf, 0, 100);
  const d = diffBBox(a, b);
  expect(d.n).toBeGreaterThan(200);
  const W = a.width, H = a.height;
  // Alle neuen Pixel liegen in einem der beiden Felder (± 2 px)
  const inField = (f: any, x: number, y: number) => x >= f.x * W - 2 && x <= (f.x + f.w) * W + 2 && y >= f.y * H - 2 && y <= (f.y + f.h) * H + 2;
  const txt = env.fields.find((f: any) => f.type === 'text');
  let outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (b.px[i] < 100 && a.px[i] >= 100 && !inField(sigField, x, y) && !inField(txt, x, y)) outside++;
  }
  expect(outside).toBe(0);
  const mailDone = await waitMail('erika@example.org', 'Abgeschlossen');
  expect(mailDone.link).toBeTruthy();
});
