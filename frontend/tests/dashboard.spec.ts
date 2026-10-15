import { expect, test, type Page } from '@playwright/test'

// Synthetic dashboard summary only. Every /api request is intercepted in the
// browser; no backend, database or model is contacted.

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

const EMPTY_SUMMARY = {
  organization_id: 'org_1',
  generated_at: '2026-10-05T12:00:00Z',
  invoices_imported: 0,
  transactions_imported: 0,
  documents_total: 0,
  documents_indexed: 0,
  documents_pending_indexing: 0,
  reconciliation: {
    total: 0,
    counts: {
      exact_match: 0,
      partial_match: 0,
      possible_match: 0,
      needs_review: 0,
      unmatched: 0,
      duplicate_candidate: 0,
    },
  },
  investigations: {
    total: 0,
    counts: {
      pending: 0,
      running: 0,
      completed: 0,
      needs_review: 0,
      failed: 0,
      approved: 0,
      rejected: 0,
      needs_more_information: 0,
    },
  },
  reviews: {
    total: 0,
    counts: { approved: 0, rejected: 0, needs_more_information: 0 },
  },
  investigations_awaiting_review: 0,
}

interface MockOptions {
  body?: unknown
  delayMs?: number
  status?: number
}

async function installMock(page: Page, options: MockOptions = {}) {
  await page.route('**/api/v1/dashboard/summary', async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }
    if (options.status && options.status !== 200) {
      await route.fulfill({
        status: options.status,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Dashboard service unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.body ?? SUMMARY),
    })
  })
}

function section(page: Page, name: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name, exact: true }),
  })
}

test('renders metrics and status breakdowns from the summary', async ({
  page,
}) => {
  await installMock(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText(/Generated/)).toBeVisible()

  // Metric cards link to the workspace that owns the records.
  const awaiting = page.getByRole('link', { name: /Awaiting review/ })
  await expect(awaiting).toContainText('4')
  await expect(awaiting).toHaveAttribute('href', '/reviews')

  const documents = page.getByRole('link', { name: /Documents/ })
  await expect(documents).toContainText('20')
  await expect(documents).toContainText('17 indexed · 3 pending indexing')

  await expect(
    page.getByRole('link', { name: /Invoices imported/ }),
  ).toContainText('12')
  await expect(
    page.getByRole('link', { name: /Transactions imported/ }),
  ).toContainText('9')

  // Reconciliation breakdown.
  const reconciliation = section(page, 'Reconciliation')
  await expect(reconciliation).toContainText('30')
  await expect(
    reconciliation.getByText('Exact match', { exact: true }),
  ).toBeVisible()
  await expect(reconciliation.getByText('10', { exact: true })).toBeVisible()
  await expect(
    reconciliation.getByText('Duplicate candidate', { exact: true }),
  ).toBeVisible()
  await expect(
    reconciliation.getByRole('link', { name: /Open reconciliation/ }),
  ).toBeVisible()

  // Investigations breakdown, including a zero-count status.
  const investigations = section(page, 'Investigations')
  await expect(investigations).toContainText('8')
  await expect(
    investigations.getByText('Needs review', { exact: true }),
  ).toBeVisible()
  await expect(investigations.getByText('Rejected', { exact: true })).toBeVisible()

  // Review decisions breakdown and its honesty note.
  const reviews = section(page, 'Review decisions')
  await expect(reviews).toContainText('3')
  await expect(
    reviews.getByText('Needs more information', { exact: true }),
  ).toBeVisible()
  await expect(reviews).toContainText('including those superseded')
})

test('shows the loading state while the summary is in flight', async ({
  page,
}) => {
  await installMock(page, { delayMs: 1500 })
  await page.goto('/dashboard')

  await expect(page.getByText('Loading dashboard')).toBeVisible()
})

test('shows an error state with retry when the summary fails', async ({
  page,
}) => {
  await installMock(page, { status: 500 })
  await page.goto('/dashboard')

  await expect(page.getByText('Could not load the dashboard')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('shows the empty state when nothing is recorded', async ({ page }) => {
  await installMock(page, { body: EMPTY_SUMMARY })
  await page.goto('/dashboard')

  await expect(page.getByText('Nothing recorded yet')).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Document center' }),
  ).toBeVisible()
})

test('narrow layout keeps page width', async ({ page }) => {
  await installMock(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(scrollWidth).toBeLessThanOrEqual(421)
})
