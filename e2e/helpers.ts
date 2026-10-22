import { expect, type Page, type BrowserContext } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { makePdf } from '../tests/helpers/pdfs';

const MAILPIT = process.env.E2E_MAILPIT ?? 'http://127.0.0.1:8025';

export async function clearMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

/** Wartet auf eine E-Mail an `to` (optional mit Betreff-Teil) und liefert Text und ersten Paraph-Link. */
export async function waitMail(to: string, subjectPart?: string, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const msg = (r.messages ?? []).find((m: any) => !subjectPart || m.Subject.includes(subjectPart));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const link = /(https?:\/\/[^\s"<>]+\/(?:s|invite|reset)\/[A-Za-z0-9_-]+)/.exec(full.Text)?.[1];
      return { subject: msg.Subject as string, text: full.Text as string, html: full.HTML as string, link, from: full.From, replyTo: full.ReplyTo };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Keine E-Mail an ${to}${subjectPart ? ` mit „${subjectPart}“` : ''}`);
}

export async function pdfFile(name: string, opts: Parameters<typeof makePdf>[0] = {}) {
  mkdirSync('.tmp/e2e-files', { recursive: true });
  const p = `.tmp/e2e-files/${name}`;
  writeFileSync(p, await makePdf(opts));
  return p;
}

export const ADMIN = { email: 'anna@kanzlei.test', password: 'sehr-sicheres-passwort-1', name: 'Anna Anwältin' };

export async function setupOrLogin(page: Page) {
  await page.goto('/');
  await page.locator('h1').first().waitFor();
  if (page.url().endsWith('/setup')) {
    await page.getByLabel('Einrichtungscode').fill('e2e-setup-code');
    await page.getByLabel('Name der Kanzlei oder Organisation').fill('Kanzlei Baumgarten');
    await page.getByLabel('Ihr Name').fill(ADMIN.name);
    await page.getByLabel('E-Mail-Adresse').fill(ADMIN.email);
    await page.getByLabel('Passwort').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Einrichten und anmelden' }).click();
  } else if (page.url().includes('/login')) {
    await page.getByLabel('E-Mail-Adresse').fill(ADMIN.email);
    await page.getByLabel('Passwort').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Anmelden' }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Guten (Morgen|Tag|Abend)/);
}

/** Zeichnet eine Unterschrift mit Maus- bzw. Touch-Bewegungen auf das Zeichenfeld. */
export async function drawSignature(page: Page) {
  const canvas = page.getByLabel('Unterschriftsfeld');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    const x = box.x + box.width * (0.15 + (i / 40) * 0.7);
    const y = box.y + box.height * (0.55 + Math.sin(i / 3) * 0.2);
    await page.mouse.move(x, y, { steps: 2 });
  }
  await page.mouse.up();
}

export async function newContext(page: Page): Promise<BrowserContext> {
  return page.context().browser()!.newContext({ locale: 'de-DE' });
}
