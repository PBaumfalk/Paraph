// TEST C – Unterzeichner öffnet den Link auf dem Smartphone und schließt den gesamten Vorgang ab (Touch).
import { test, expect, request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pdfFile, ADMIN } from './helpers';

test('C: Signieren auf dem Smartphone mit Finger, Pflichtfeldern, Checkbox und Datum', async ({ page, baseURL }, info) => {
  // Admin-Zugang und Vorgang per API vorbereiten (Ersteinrichtung, falls noch nicht geschehen)
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
  const state = await (await api.get('/api/auth/state')).json();
  if (state.setup_required) await api.post('/api/auth/setup', { data: { code: 'e2e-setup-code', orgName: 'Nordlicht Software GmbH', name: ADMIN.name, email: ADMIN.email, password: ADMIN.password } });
  else await api.post('/api/auth/login', { data: { email: ADMIN.email, password: ADMIN.password } });
  const csrf = (await (await api.get('/api/auth/state')).json()).session.csrf;
  const file = await pdfFile('mobil.pdf', { pages: 2, title: 'Vollmacht' });
  const res = await api.post('/api/v1/envelopes', {
    headers: { 'x-csrf-token': csrf },
    data: {
      title: `Vollmacht mobil (${info.project.name})`,
      documents: [{ name: 'Vollmacht.pdf', file_base64: readFileSync(file).toString('base64') }],
      recipients: [{ ref: 'm', name: 'Mia Mobil', email: `mia.${info.project.name}@example.org` }],
      fields: [
        { type: 'text', key: 'anschrift', label: 'Anschrift', document: 0, recipient: 'm', page: 0, x: 0.1, y: 0.3, w: 0.6, h: 0.03 },
        { type: 'checkbox', key: 'kenntnis', label: 'Kenntnisnahme', document: 0, recipient: 'm', page: 0, x: 0.1, y: 0.4, w: 0.03, h: 0.02 },
        { type: 'select', key: 'umfang', label: 'Umfang', document: 0, recipient: 'm', page: 0, x: 0.1, y: 0.5, w: 0.4, h: 0.03, config: { options: ['außergerichtlich', 'gerichtlich'] } },
        { type: 'signature', document: 0, recipient: 'm', page: 1, x: 0.1, y: 0.75, w: 0.45, h: 0.08 },
        { type: 'signed_date', document: 0, recipient: 'm', page: 1, x: 0.6, y: 0.8, w: 0.25, h: 0.03 },
      ],
      send: true,
      notify: false,
      acknowledge_form_risk: true,
    },
  });
  expect(res.status()).toBe(201);
  const env = await res.json();
  const link = env.signing_links[0].url;

  await page.goto(link);
  await expect(page).toHaveURL(/\/s\/session$/);
  await expect(page.getByRole('heading', { name: env.title })).toBeVisible();
  // Kein horizontales Scrollen auf dem Telefon
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /Los geht/ }).tap();
  // Anschrift im Eingabeblatt
  await expect(page.getByRole('dialog', { name: 'Anschrift' })).toBeVisible();
  await page.getByRole('dialog').locator('input').fill('Domstraße 1, 50667 Köln');
  await page.getByRole('button', { name: 'Weiter', exact: true }).tap();
  // Checkbox wird per Tipp gesetzt
  await expect(page.locator('#sf-kenntnis')).toHaveClass(/is-current/);
  await page.locator('#sf-kenntnis').tap();
  await page.getByRole('button', { name: 'Nächstes Feld' }).tap();
  // Auswahl
  await expect(page.getByRole('dialog', { name: 'Umfang' })).toBeVisible();
  await page.getByRole('button', { name: 'gerichtlich', exact: true }).tap();
  await page.getByRole('button', { name: 'Weiter', exact: true }).tap();
  // Unterschrift mit dem Finger (Touch-Ereignisse über CDP bzw. WebKit)
  await expect(page.getByRole('dialog', { name: 'Unterschrift erstellen' })).toBeVisible();
  const canvas = page.getByLabel('Unterschriftsfeld');
  const box = (await canvas.boundingBox())!;
  await canvas.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 30, clientY: box.y + box.height * 0.6, pointerId: 1, isPrimary: true, pressure: 0.6, bubbles: true });
  for (let i = 1; i <= 30; i++) {
    await canvas.dispatchEvent('pointermove', { pointerType: 'touch', clientX: box.x + 30 + i * ((box.width - 60) / 30), clientY: box.y + box.height * (0.55 + Math.sin(i / 3) * 0.2), pointerId: 1, isPrimary: true, pressure: 0.6, bubbles: true });
  }
  await canvas.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true });
  await page.getByRole('button', { name: 'Übernehmen' }).tap();
  await expect(page.getByText('Alles ausgefüllt')).toBeVisible();
  await page.getByRole('button', { name: 'Abschließen' }).tap();
  await page.getByLabel('Ich stimme der obigen Erklärung zu.').check();
  await page.getByRole('button', { name: 'Verbindlich unterschreiben' }).tap();
  await expect(page.getByRole('heading', { name: 'Unterschrieben' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unterschriebenes Dokument' })).toBeVisible({ timeout: 20_000 });

  // Serverseitig abgeschlossen, Werte korrekt übernommen
  const done = await (await api.get(`/api/v1/envelopes/${env.id}`)).json();
  expect(done.status).toBe('completed');
  const val = (k: string) => done.fields.find((f: any) => f.key === k).value;
  expect(val('anschrift')).toBe('Domstraße 1, 50667 Köln');
  expect(val('kenntnis')).toBe('true');
  expect(val('umfang')).toBe('gerichtlich');
  expect(val('signed_date_5')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const audit = await (await api.get(`/api/v1/envelopes/${env.id}/audit`)).json();
  const signed = audit.events.find((e: any) => e.type === 'recipient.signed');
  expect(signed.data.user_agent).toMatch(/Mobile|iPhone|Android/);
});
