import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.E2E_PORT ?? '8797';
if (!/^\d+$/.test(e2ePort)) throw new Error('E2E_PORT must be a numeric TCP port');
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && PORT=${e2ePort} PUBLIC_ORIGIN=${e2eBaseUrl} npm start`,
    url: `${e2eBaseUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
