import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry' },
  webServer: { command: 'npm run dev:web', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [{ name: process.env.CI ? 'chromium' : 'chrome-installed', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } }],
});
