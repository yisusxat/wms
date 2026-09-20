import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry' },
  webServer: { command: 'node node_modules/next/dist/bin/next start apps/web', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [{ name: process.env.CI ? 'chromium' : 'chrome-installed', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } }],
});
