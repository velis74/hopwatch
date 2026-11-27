import { defineConfig, devices } from '@playwright/test';

// Runs against the development servers started by scripts/dev.sh and MOTIS (e2e/README.md).
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.HOPWATCH_BASE_URL ?? 'http://127.0.0.1:5180',
    trace: 'on-first-retry',
    locale: 'en-GB',
    timezoneId: 'Europe/Ljubljana',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
