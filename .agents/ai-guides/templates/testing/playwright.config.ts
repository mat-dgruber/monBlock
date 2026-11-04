import { defineConfig, devices } from '@playwright/test';

// Fonte canônica: templates/testing/playwright.config.ts (instalado por TESTF-04)
// Jornadas críticas em e2e/*.spec.ts — ver guides/testing/frontend/test-writing-standards.md
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
