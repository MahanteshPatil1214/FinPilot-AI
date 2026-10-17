import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

// LIVE end-to-end journeys for the Assistant. No /api route mocks: these run
// against the real stack through the Vite dev proxy (frontend:5173 ->
// backend:8000 -> PostgreSQL + pgvector + Groq). Run with:
//
//   npx playwright test --config playwright.live.config.ts
//
// The backend must be running (e.g. the docker-compose service on :8000, with
// GROQ_API_KEY configured to also exercise model answer generation).

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(here, '..', '..', '..', 'backend')
const PYTHON = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
const SEED_SCRIPT = path.join(BACKEND_DIR, 'scripts', 'seed_live.py')

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  // Seed the canonical demo dataset through the public API so assertions are
  // reproducible (vendor_policy_acme.pdf, INV-2026-0001, 3 reconciliation rows).
  execFileSync(PYTHON, [SEED_SCRIPT, '--reset', '--index'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    timeout: 300_000,
  })
})

async function startConversation(page: Page) {
  await page.goto('/assistant')
  await page.getByRole('button', { name: 'New conversation' }).click()
  // Wait for the freshly-created (empty) conversation to be the selected view
  // before typing, otherwise the creation round-trip can reset the composer.
  await expect(
    page.getByText(
      'This conversation is empty. Ask a question below to get started.',
    ),
  ).toBeVisible()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()
  return composer
}

test('document Q&A answers from the indexed policy with a real citation', async ({
  page,
}) => {
  const composer = await startConversation(page)

  await composer.fill(
    'What does the vendor payment policy say about the early payment discount?',
  )
  await page.getByRole('button', { name: 'Send' }).click()

  const thread = page.getByRole('article')
  // A grounded answer outcome (not a generic capability dump).
  await expect(thread.getByText('Answered', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(thread.getByText(/discount/i).first()).toBeVisible({
    timeout: 60_000,
  })

  // The cited document + page are shown.
  await expect(thread.getByText('vendor_policy_acme.pdf').first()).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: 'Citations' })).toBeVisible()
})

test('financial query returns deterministic records with provenance', async ({
  page,
}) => {
  const composer = await startConversation(page)

  await composer.fill('Which transactions are unmatched?')
  await page.getByRole('button', { name: 'Send' }).click()

  const thread = page.getByRole('article')
  await expect(thread.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(thread.getByText(/unmatched/i).first()).toBeVisible({
    timeout: 60_000,
  })

  // Tool provenance is disclosed and honest.
  await page.getByText('Activity').first().click()
  await expect(
    page.getByText('Search reconciliation results').first(),
  ).toBeVisible()

  // A result ref links to the reconciliation workspace.
  await expect(
    page.getByRole('link', { name: /^Reconciliation/ }).first(),
  ).toBeVisible()
})

test('plural invoice query routes to the deterministic invoice tool', async ({
  page,
}) => {
  const composer = await startConversation(page)

  await composer.fill('Show me all invoices')
  await page.getByRole('button', { name: 'Send' }).click()

  const thread = page.getByRole('article')
  await expect(thread.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(thread.getByText('INV-2026-0001').first()).toBeVisible({
    timeout: 60_000,
  })
})

test('unsupported requests are refused, not answered', async ({ page }) => {
  const composer = await startConversation(page)

  await composer.fill('Pay the invoice INV-2026-0001 right now')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Not supported')).toBeVisible({ timeout: 60_000 })
})

test('a conversation persists across reload and can be deleted', async ({ page }) => {
  const composer = await startConversation(page)

  await composer.fill('Which transactions are unmatched?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByRole('article').getByText('Completed', { exact: true }),
  ).toBeVisible({ timeout: 60_000 })

  // Reload: the conversation is persisted and auto-selected.
  await page.reload()
  await expect(
    page.getByRole('article').getByText(/unmatched/i).first(),
  ).toBeVisible({ timeout: 60_000 })

  // Delete via the inline confirmation in the sidebar; the rail shrinks by one.
  const deleteButtons = page.getByRole('button', { name: /^Delete / })
  const before = await deleteButtons.count()
  await deleteButtons.first().click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect
    .poll(async () => page.getByRole('button', { name: /^Delete / }).count(), {
      timeout: 30_000,
    })
    .toBe(before - 1)
})
