import { defineConfig, devices } from '@playwright/test';

// Browser-Tests gegen den gebauten Server mit frischem Datenverzeichnis.
// Voraussetzung: Mailpit auf 127.0.0.1:1025/8025, z. B.:
// docker run -d --name paraph-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.34
const PORT = Number(process.env.E2E_PORT ?? 8091);
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  webServer: {
    command: `rm -rf .tmp/e2e-data && mkdir -p .tmp/e2e-data && node dist/server/main.js`,
    url: `http://localhost:${PORT}/api/health/ready`,
    reuseExistingServer: false,
    env: {
      DATA_DIR: '.tmp/e2e-data',
      APP_URL: `http://localhost:${PORT}`,
      PORT: String(PORT),
      SMTP_URL: process.env.E2E_SMTP_URL ?? 'smtp://127.0.0.1:1025',
      MAIL_FROM: 'Paraph E2E <e2e@kanzlei.test>',
      SETUP_CODE: 'e2e-setup-code',
      LOG_LEVEL: 'warn',
      BACKUP_INTERVAL_HOURS: '0',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'pixel', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testMatch: /mobile/ },
  ],
});
