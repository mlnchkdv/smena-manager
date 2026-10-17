import { defineConfig, devices } from '@playwright/test';

const runId = `${process.pid}-${Date.now()}`;

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
    baseURL: 'http://127.0.0.1:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Saratov',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: '3001',
      DATABASE_PATH: `.data/e2e/${runId}/workspace.json`,
      UPLOADS_PATH: `.data/e2e/${runId}/uploads`,
      BACKUPS_PATH: `.data/e2e/${runId}/backups`,
      ACCESS_IDS_JSON: accessProfiles,
      ACCESS_ID_LOGIN_ENABLED: 'true',
      SESSION_SECRET: 'e2e-session-secret-that-is-at-least-32-characters',
    },
  },
});
