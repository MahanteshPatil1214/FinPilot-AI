import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

// Non-mocked end-to-end run against a live backend and PostgreSQL. Unlike the
// default config (which intercepts every /api request in the browser), this one
// starts the real FastAPI backend, points the Vite dev server at it and drives
// the seeded synthetic dataset. See tests/integration/journey.spec.ts.
//
//   npm run test:e2e:integration
//
// It is deliberately separate from the mocked suite so `npm run test:e2e` still
// runs fast and offline. Requires PostgreSQL reachable at the URL in
// backend/.env (the docker-compose service publishes host port 5433).

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(here, '..', 'backend')

export default defineConfig({
  testDir: './tests/integration',
  outputDir: './test-results/integration',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // Generous: the seed step loads the local embedding model on first index.
  timeout: 240_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command:
        '.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: BACKEND_DIR,
      url: 'http://localhost:8000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Force the deterministic, model-free path so the run is reproducible.
      env: { GROQ_API_KEY: '' },
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
