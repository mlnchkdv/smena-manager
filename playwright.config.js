import { defineConfig, devices } from '@playwright/test';

const runId = `${process.pid}-${Date.now()}`;
const clientPort = Number(process.env.E2E_CLIENT_PORT || 5198);
const apiPort = Number(process.env.E2E_API_PORT || 3198);
const isolatedEnv = {
  VERCEL: '',
  REDIS_URL: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REFRESH_TOKEN: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  GOOGLE_SERVICE_ACCOUNT_KEY: '',
  GMAIL_OAUTH_REFRESH_TOKEN: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
};

const accessProfiles = JSON.stringify([
  {
    id: 'e2e-admin',
    name: 'Тестовый администратор',
    email: 'e2e@example.test',
    title: 'Администратор',
    team: 'product',
    role: 'admin',
    accessId: 'e2e-access-id-2026-secure',
    active: true,
  },
  {
    id: 'e2e-editor',
    name: 'E2E Редактор',
    email: 'editor@example.test',
    title: 'Редактор',
    team: 'product',
    role: 'editor',
    accessId: 'e2e-editor-access-id-2026-secure',
    active: true,
  },
]);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: `http://127.0.0.1:${clientPort}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Saratov',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /cross-browser-smoke\.spec\.js/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: /cross-browser-smoke\.spec\.js/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'node src/server/index.js',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...isolatedEnv,
        PORT: String(apiPort),
        DATABASE_PATH: `.data/e2e/${runId}/workspace.json`,
        UPLOADS_PATH: `.data/e2e/${runId}/uploads`,
        BACKUPS_PATH: `.data/e2e/${runId}/backups`,
        ACCESS_IDS_JSON: accessProfiles,
        ACCESS_ID_LOGIN_ENABLED: 'true',
        SESSION_SECRET: 'e2e-session-secret-that-is-at-least-32-characters',
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${clientPort} --strictPort`,
      url: `http://127.0.0.1:${clientPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { SMENA_API_PORT: String(apiPort) },
    },
  ],
});
