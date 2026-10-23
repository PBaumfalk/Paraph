// TEST F – Betrieb aus Sicht der Administration und der Unterzeichner (0.2.0):
// Systemdiagnose, Test-E-Mail, Benutzerverwaltung, Datenschutzhinweis auf der Signaturseite (Smartphone),
// Prüfstelle mit Gesamturteil. Screenshots unter .tmp/shots zur Sichtprüfung.
import { test, expect, devices } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { clearMail, waitMail, pdfFile, setupOrLogin, drawSignature } from './helpers';

const SHOTS = '.tmp/shots';
mkdirSync(SHOTS, { recursive: true });

test('F: Systemseite, Benutzerverwaltung, Datenschutzhinweis, Prüfstelle', async ({ page, browser }) => {
  await clearMail();
  await setupOrLogin(page);

  // Systemdiagnose
  await page.goto('/settings/system');
  await expect(page.getByRole('heading', { name: 'Betriebszustand' })).toBeVisible();
  await expect(page.getByText('Zeitstempeldienst').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tiefenprüfung' }).click();
  await expect(page.getByText(/Tiefenprüfung vom/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Audit-Ketten/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/system-desktop.png`, fullPage: true });

  // Test-E-Mail kommt an
  await page.getByRole('button', { name: 'Test-E-Mail senden' }).click();
  await expect(page.getByText(/Test-E-Mail angenommen/)).toBeVisible();
  await waitMail('anna@kanzlei.test', 'Test-E-Mail');

  // Benutzerverwaltung: eigenes Konto ohne Sperr-Knopf
  await expect(page.getByRole('heading', { name: 'Benutzerkonten der Instanz' })).toBeVisible();
  await expect(page.locator('.users-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.users-table').getByRole('button', { name: 'Sperren' })).toHaveCount(0);

  // Datenschutzhinweis hinterlegen – über das Untermenü, nicht per Adresse (relative Links führten ins Leere)
  await page.locator('.settings-nav').getByRole('link', { name: 'Organisation', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/org$/);
  await page.getByLabel('Datenschutzhinweise für Unterzeichner (Art. 13 DSGVO)').fill('https://kanzlei.example/datenschutz');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.getByText('Gespeichert').first()).toBeVisible();

  // Vorgang versenden
  const file = await pdfFile('datenschutz.pdf', { title: 'Vollmacht' });
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Dokument unterschreiben lassen/ }).click();
  await (await chooser).setFiles(file);
  await page.waitForURL(/\/envelopes\/env_[^/]+\/edit$/);
  await page.getByPlaceholder('Name', { exact: true }).first().fill('Sophie Smartphone');
  await page.getByPlaceholder('E-Mail-Adresse', { exact: true }).first().fill('sophie@example.org');
  const pageEl = page.locator('.pdfpage[data-page="0"]').first();
  await expect(pageEl.locator('canvas')).toBeVisible();
  const pb = (await pageEl.boundingBox())!;
  await page.locator('.pal-item', { hasText: 'Unterschrift' }).first().click();
  await pageEl.click({ position: { x: pb.width * 0.3, y: pb.height * 0.8 } });
  await expect(page.locator('.save-state')).toHaveText('Gespeichert', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Weiter zum Versand' }).click();
  const ack = page.getByLabel(/Mir ist bewusst|Ich habe den Formhinweis gelesen/);
  // „Vollmacht“ löst den Formhinweis aus: ohne Bestätigung bleibt „Jetzt versenden“ gesperrt
  await expect(page.getByRole('button', { name: 'Jetzt versenden' })).toBeDisabled();
  await ack.first().check();
  await page.getByRole('button', { name: 'Jetzt versenden' }).click();
  await page.waitForURL(/\/envelopes\/env_[^/]+$/);
  await page.screenshot({ path: `${SHOTS}/envelope-desktop.png`, fullPage: true });

  // Unterzeichnerin auf dem iPhone-Format
  const mail = await waitMail('sophie@example.org', 'bittet Sie um Ihre Unterschrift');
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'de-DE' });
  const phone = await ctx.newPage();
  await phone.goto(mail.link!);
  await phone.getByRole('button', { name: /Los geht/ }).click();
  await drawSignature(phone);
  await phone.getByRole('button', { name: 'Übernehmen' }).click();
  await phone.getByRole('button', { name: /Abschließen/ }).click();
  await expect(phone.getByRole('link', { name: /Hinweise zum Datenschutz/ })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText(/nicht um eine qualifizierte elektronische Signatur/)).toBeVisible();
  await phone.screenshot({ path: `${SHOTS}/sign-consent-iphone.png`, fullPage: true });
  await phone.getByLabel('Ich stimme der obigen Erklärung zu.').check();
  await phone.getByRole('button', { name: 'Verbindlich unterschreiben' }).click();
  await expect(phone.getByRole('button', { name: 'Unterschriebenes Dokument' })).toBeVisible({ timeout: 30_000 });
  const dl = phone.waitForEvent('download');
  await phone.getByRole('button', { name: 'Unterschriebenes Dokument' }).click();
  const signedPath = await (await dl).path();
  await phone.screenshot({ path: `${SHOTS}/sign-done-iphone.png`, fullPage: true });

  // Abschlussmail nennt den Prüfwert
  const done = await waitMail('sophie@example.org', 'Abgeschlossen');
  expect(done.text).toMatch(/Prüfwert \(SHA-256\)[\s\S]*[0-9a-f]{64}/);

  // Prüfstelle auf dem Smartphone: echtes Dokument → gültig
  await phone.goto('/verify');
  await phone.locator('input[type=file]').setInputFiles({ name: 'vollmacht.pdf', mimeType: 'application/pdf', buffer: readFileSync(signedPath!) });
  await expect(phone.getByRole('heading', { name: 'Echt und unverändert' })).toBeVisible();
  await phone.getByRole('button', { name: /eingebettete Siegel prüfen/ }).click();
  await expect(phone.getByText('Siegel dieser Instanz gültig – Datei seit dem Siegel unverändert')).toBeVisible();
  await expect(phone.getByText(/weder ein qualifiziertes Siegel noch eine persönliche Signatur/)).toBeVisible();
  await phone.screenshot({ path: `${SHOTS}/verify-iphone.png`, fullPage: true });

  // Ein angehängtes Byte → nicht gefunden, Siegel als verändert erkannt
  await phone.goto('/verify');
  await phone.locator('input[type=file]').setInputFiles({ name: 'veraendert.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([readFileSync(signedPath!), Buffer.from('\n%x\n')]) });
  await expect(phone.getByRole('heading', { name: 'Nicht gefunden' })).toBeVisible();
  await phone.getByRole('button', { name: /eingebettete Siegel prüfen/ }).click();
  await expect(phone.getByText('Datei wurde nach dem Siegel verändert')).toBeVisible();
  await ctx.close();
});
