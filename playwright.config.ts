import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;

// Test e2e contro la build vera, servita da `astro preview` (runtime workerd).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    // Opzionale: usa un Chromium già installato (es. PW_CHROMIUM_PATH=/percorso/chrome).
    ...(process.env['PW_CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['PW_CHROMIUM_PATH'] } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // --ignore-lock: tiene il server in primo piano (Astro 7 lo manda in background se rileva un agente AI).
  webServer: {
    command: `npm run setup:local && npm run build && npx astro preview --port ${PORT} --ignore-lock`,
    env: { KUF_STYLEGUIDE: '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
