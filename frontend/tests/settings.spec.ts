import { expect, test, type Page } from '@playwright/test'

// Synthetic responses only. All /api requests are intercepted in the browser;
// no backend, database or model is contacted. These tests assert that Settings
// is strictly read-only and never invents editable controls.

const HEALTH = { status: 'ok', service: 'finpilot-ai' }

const SUMMARY = {
  organization_id: 'org_1',
  generated_at: '2026-10-05T12:00:00Z',
  invoices_imported: 12,
  transactions_imported: 9,
  documents_total: 20,
  documents_indexed: 17,
  documents_pending_indexing: 3,
  reconciliation: {
    total: 30,
    counts: {
      exact_match: 10,
      partial_match: 5,
      possible_match: 3,
      needs_review: 4,
      unmatched: 6,
      duplicate_candidate: 2,
    },
  },
  investigations: {
    total: 8,
    counts: {
      pending: 1,
      running: 0,
      completed: 2,
      needs_review: 2,
      failed: 1,
      approved: 1,
      rejected: 0,
      needs_more_information: 1,
    },
  },
  reviews: {
    total: 3,
    counts: { approved: 1, rejected: 1, needs_more_information: 1 },
  },
  investigations_awaiting_review: 4,
}

interface MockOptions {
  healthStatus?: number
  summaryStatus?: number
}

async function mockApi(page: Page, options: MockOptions = {}) {
  const healthStatus = options.healthStatus ?? 200
  const summaryStatus = options.summaryStatus ?? 200

  await page.route('**/api/v1/health', (route) =>
    route.fulfill(
      healthStatus === 200
        ? { status: 200, json: HEALTH }
        : { status: healthStatus, json: { detail: 'unavailable' } },
    ),
  )
  await page.route('**/api/v1/dashboard/summary', (route) =>
    route.fulfill(
      summaryStatus === 200
        ? { status: 200, json: SUMMARY }
        : { status: summaryStatus, json: { detail: 'unavailable' } },
    ),
  )
}

test('renders service status, workspace and data footprint from real sources', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Service status from GET /api/v1/health.
  await expect(page.getByText('finpilot-ai', { exact: true })).toBeVisible()
  await expect(page.getByText('ok', { exact: true })).toBeVisible()

  // Workspace identity from GET /api/v1/dashboard/summary.
  await expect(page.getByText('org_1', { exact: true })).toBeVisible()
  await expect(page.getByText('None — development build')).toBeVisible()

  // Data footprint counts linking to their workspaces.
  await expect(page.getByText('Documents', { exact: true })).toBeVisible()
  await expect(page.getByText('20', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Review decisions', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Documents/ })).toHaveAttribute(
    'href',
    '/documents',
  )

  // Limitations are stated explicitly, including no-authentication.
  await expect(
    page.getByText(/No authentication: this build uses a single fixed/),
  ).toBeVisible()
})

test('exposes no editable controls', async ({ page }) => {
  await mockApi(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /save|apply|update/i }),
  ).toHaveCount(0)
})

test('health failure shows a retry that recovers', async ({ page }) => {
  // The default query policy retries once, so gate failure on an explicit flag
  // rather than a call counter (which would let the retry silently succeed).
  let fail = true
  await page.route('**/api/v1/health', (route) =>
    fail
      ? route.fulfill({ status: 500, json: { detail: 'unavailable' } })
      : route.fulfill({ status: 200, json: HEALTH }),
  )
  await page.route('**/api/v1/dashboard/summary', (route) =>
    route.fulfill({ status: 200, json: SUMMARY }),
  )

  await page.goto('/settings')
  await expect(page.getByText('Could not reach the API.')).toBeVisible()

  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('finpilot-ai', { exact: true })).toBeVisible()
})

test('summary failure shows the data footprint error state', async ({
  page,
}) => {
  await mockApi(page, { summaryStatus: 500 })
  await page.goto('/settings')

  await expect(page.getByText('Could not load data footprint')).toBeVisible()
})

test('narrow layout keeps page width', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(scrollWidth).toBeLessThanOrEqual(421)
})
