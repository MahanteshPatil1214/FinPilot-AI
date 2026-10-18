import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

// Captures documentation screenshots of the real, seeded application.
//
//   $env:SCREENSHOTS=1; npm run test:e2e:integration -- screenshots
//
// Disabled by default so the normal integration run is unaffected. Reuses the
// live webServer (backend + Vite) from playwright.integration.config.ts and
// seeds the same synthetic dataset as journey.spec.ts.

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(here, '..', '..', '..', 'backend')
const PYTHON = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
const SEED_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'seed_live.py')
const OUT_DIR = path.resolve(here, '..', '..', '..', 'docs', 'screenshots')

test.skip(
  process.env.SCREENSHOTS !== '1',
  'Set SCREENSHOTS=1 to (re)generate documentation screenshots.',
)

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  execFileSync(PYTHON, [SEED_SCRIPT, '--reset', '--index'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    timeout: 180_000,
  })
})

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  })
}

test('assistant', async ({ page }) => {
  await page.goto('/assistant')
  await expect(page.getByRole('heading', { name: 'Assistant' })).toBeVisible()
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(
    page.getByText(
      'This conversation is empty. Ask a question below to get started.',
    ),
  ).toBeVisible()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()
  await composer.fill('Which transactions are unmatched?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByRole('article').getByText('Completed', { exact: true }),
  ).toBeVisible({ timeout: 60_000 })
  await capture(page, 'assistant')
})

test('dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await capture(page, 'dashboard')
})

test('document center', async ({ page }) => {
  await page.goto('/documents')
  await expect(
    page.getByRole('heading', { name: 'Document center' }),
  ).toBeVisible()
  await capture(page, 'documents')
})

test('reconciliation', async ({ page }) => {
  await page.goto('/reconciliation')
  await expect(page.getByRole('heading', { name: 'Reconciliation' })).toBeVisible()
  await capture(page, 'reconciliation')
})

test('investigations', async ({ page }) => {
  await page.goto('/investigations')
  await expect(page.getByRole('heading', { name: 'Investigations' })).toBeVisible()
  await capture(page, 'investigations')
})

test('investigation report', async ({ page }) => {
  await page.goto('/investigations')
  await page.locator('tbody tr').first().click()
  await expect(page.getByRole('heading', { name: /Investigation/ })).toBeVisible()
  await expect(page.getByText('Assessment')).toBeVisible()
  await capture(page, 'investigation-detail')
})

test('report review', async ({ page }) => {
  await page.goto('/reviews')
  await expect(page.getByRole('heading', { name: 'Report review' })).toBeVisible()
  await page.locator('tbody tr').first().click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await capture(page, 'review-detail')
})

test('audit history', async ({ page }) => {
  await page.goto('/audit')
  await expect(
    page.getByRole('heading', { name: 'Audit history' }),
  ).toBeVisible()
  await capture(page, 'audit')
})
