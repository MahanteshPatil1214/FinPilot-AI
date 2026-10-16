import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

// A genuine, non-mocked integration journey. Nothing is intercepted: the browser
// talks to the Vite dev server, which proxies /api to the live FastAPI backend
// and PostgreSQL. The dataset is the synthetic fixtures seeded through the
// public API by backend/scripts/seed_live.py.
//
// The suite is serial: the first step seeds, the final steps assert that a human
// decision recorded in the UI is reflected back on the dashboard.

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(here, '..', '..', '..', 'backend')
const PYTHON = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
const SEED_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'seed_live.py')

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  // Reset the database and re-seed the demo dataset through the HTTP API.
  execFileSync(PYTHON, [SEED_SCRIPT, '--reset', '--index'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    timeout: 180_000,
  })
})

test('dashboard summarises the seeded, persisted records', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await expect(page.locator('a', { hasText: 'Documents' }).first()).toContainText(
    '2',
  )
  await expect(
    page.locator('a', { hasText: 'Invoices imported' }),
  ).toContainText('1')
  await expect(
    page.locator('a', { hasText: 'Transactions imported' }),
  ).toContainText('3')
  await expect(
    page.locator('a', { hasText: 'Awaiting review' }),
  ).toContainText('1')

  await expect(page.getByRole('heading', { name: 'Reconciliation' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Investigations' })).toBeVisible()
})

test('document center lists the uploaded sources', async ({ page }) => {
  await page.goto('/documents')
  await expect(
    page.getByRole('heading', { name: 'Document center' }),
  ).toBeVisible()

  const body = page.locator('tbody')
  await expect(body).toContainText('invoice_acme_2026_0001.pdf')
  await expect(body).toContainText('vendor_policy_acme.pdf')
})

test('reconciliation stores the deterministic partial match', async ({ page }) => {
  await page.goto('/reconciliation')
  await expect(page.getByRole('heading', { name: 'Reconciliation' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)

  const partial = rows.filter({ hasText: 'Partial match' })
  await expect(partial).toHaveCount(1)
  await expect(partial).toContainText('+300.00')

  // Re-running is idempotent: the stored rules produce the same result.
  await page.getByRole('button', { name: 'Run reconciliation' }).click()
  await expect(page.getByText(/row\(s\) · window/)).toBeVisible()
  await expect(rows.filter({ hasText: 'Partial match' })).toHaveCount(1)
})

test('the seeded investigation opens with its report', async ({ page }) => {
  await page.goto('/investigations')
  await expect(page.getByRole('heading', { name: 'Investigations' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Needs review')

  await rows.first().click()
  await expect(page).toHaveURL(/\/investigations\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: /Investigation/ })).toBeVisible()
  await expect(page.getByText('Assessment')).toBeVisible()
})

test('a human decision is recorded against the report version', async ({ page }) => {
  await page.goto('/reviews')
  await expect(page.getByRole('heading', { name: 'Report review' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(page.getByText('Awaiting decision')).toBeVisible()

  await page
    .getByLabel('Rationale')
    .fill('Confirmed the 300.00 early-settlement discount against the vendor policy.')
  await page.getByRole('button', { name: 'Approve report' }).click()
  await expect(page.getByRole('status')).toContainText('Decision recorded')
})

test('the recorded decision is reflected on the dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(
    page.locator('a', { hasText: 'Awaiting review' }),
  ).toContainText('0')
  await expect(page.getByRole('heading', { name: 'Review decisions' })).toBeVisible()
})
