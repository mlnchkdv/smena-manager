import { defineConfig, devices } from '@playwright/test';

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
]);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Saratov',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: '3001',
      DATABASE_PATH: `.data/e2e/workspace-${process.pid}.json`,
      UPLOADS_PATH: `.data/e2e/uploads-${process.pid}`,
      BACKUPS_PATH: `.data/e2e/backups-${process.pid}`,
      ACCESS_IDS_JSON: accessProfiles,
      SESSION_SECRET: 'e2e-session-secret-that-is-at-least-32-characters',
    },
  },
});
