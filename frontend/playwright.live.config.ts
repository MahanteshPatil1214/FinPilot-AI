import { defineConfig, devices } from '@playwright/test'

// Live integration config: NO route mocks. The Vite dev server proxies
// /api -> http://localhost:8000, so these tests exercise the real backend
// (PostgreSQL + pgvector + Groq). Run with:
//   npx playwright test --config playwright.live.config.ts
// Requires the docker stack (backend) to be running.
export default defineConfig({
  testDir: './tests/integration',
  testMatch: '**/assistant.live.spec.ts',
  outputDir: './test-results-live',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'live-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
