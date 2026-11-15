import { defineConfig, devices } from '@playwright/test';

const runId = `${process.pid}-${Date.now()}`;
const clientPort = Number(process.env.E2E_CLIENT_PORT || 5198);
const apiPort = Number(process.env.E2E_API_PORT || 3198);
const engineSmokeMatch = process.env.E2E_EXTENDED_BROWSERS === 'true' ? /(?:cross-browser-smoke|workspace-smoke)\.spec\.js/ : /cross-browser-smoke\.spec\.js/;
export default defineConfig({
  outputDir: `.data/e2e/${runId}/results`,
  testDir: './tests/e2e',
  // Shard individual tests across independent CI machines. Each machine keeps
  // one worker because its preview proxies one per-test isolated API port.
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: `.data/e2e/${runId}/report` }]] : 'line',
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
    { name: 'firefox', testMatch: engineSmokeMatch, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: engineSmokeMatch, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `npx vite build --outDir .data/e2e/${runId}/dist && npx vite preview --outDir .data/e2e/${runId}/dist --host 127.0.0.1 --port ${clientPort} --strictPort`,
      url: `http://127.0.0.1:${clientPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { SMENA_API_PORT: String(apiPort), SMENA_TEST_MODE: 'true' },
    },
  ],
});
