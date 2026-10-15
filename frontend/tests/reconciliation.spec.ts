import { expect, test, type Page } from '@playwright/test'

// Synthetic financial data only. No production services are contacted: every
// /api request is intercepted in the browser below.

const STATUSES = [
  'exact_match',
  'partial_match',
  'possible_match',
  'needs_review',
  'unmatched',
  'duplicate_candidate',
] as const

const MATCHES = [
  {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    organization_id: 'org_1',
    invoice_id: 'inv-104',
    transaction_id: 'txn-778',
    match_status: 'partial_match',
    matching_method: 'reference_exact',
    difference_amount: '50.00',
    explanation:
      "Reference 'TXN-778' matched the invoice number; amounts differ by 50.00.",
    created_at: '2026-10-05T10:00:00Z',
  },
  {
    id: 'bbbbbbbb-1111-2222-3333-444444444444',
    organization_id: 'org_1',
    invoice_id: 'inv-104',
    transaction_id: 'txn-778',
    match_status: 'exact_match',
    matching_method: 'reference_in_description',
    difference_amount: '0.00',
    explanation: 'Reference and amount agree exactly.',
    created_at: '2026-10-05T10:00:00Z',
  },
  {
    id: 'cccccccc-1111-2222-3333-444444444444',
    organization_id: 'org_1',
    invoice_id: null,
    transaction_id: 'txn-999',
    match_status: 'unmatched',
    matching_method: 'none',
    difference_amount: null,
    explanation: null,
    created_at: '2026-10-05T10:00:00Z',
  },
]

const INVOICE = {
  id: 'inv-104',
  organization_id: 'org_1',
  invoice_number: 'INV-104',
  invoice_date: '2026-10-01',
  due_date: '2026-10-30',
  currency: 'INR',
  total_amount: '12000.00',
  source_document_id: 'doc-abc',
  extraction_status: 'completed',
  created_at: '2026-10-05T10:00:00Z',
}

const TRANSACTION = {
  id: 'txn-778',
  organization_id: 'org_1',
  transaction_reference: 'TXN-778',
  transaction_date: '2026-10-05',
  description: 'ACME SUPPLIES INV-104 PAYMENT',
  amount: '11950.00',
  currency: 'INR',
  counterparty: 'ACME SUPPLIES',
  source_document_id: null,
  import_batch_id: 'batch-1',
  created_at: '2026-10-05T10:00:00Z',
}

function countsFor(items: Array<{ match_status: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const status of STATUSES) counts[status] = 0
  for (const item of items) {
    counts[item.match_status] = (counts[item.match_status] ?? 0) + 1
  }
  return counts
}

function resultsBody(items: typeof MATCHES): string {
  return JSON.stringify({
    organization_id: 'org_1',
    total: items.length,
    skip: 0,
    limit: 50,
    counts: countsFor(items),
    items,
  })
}

interface MockOptions {
  resultsDelayMs?: number
  resultsStatus?: number
  resultsBodyOverride?: string
}

async function installMocks(page: Page, options: MockOptions = {}): Promise<void> {
  await page.route('**/api/v1/reconciliation/results*', async (route) => {
    if (options.resultsDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.resultsDelayMs))
    }
    if (options.resultsStatus && options.resultsStatus !== 200) {
      await route.fulfill({
        status: options.resultsStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Reconciliation service unavailable' }),
      })
      return
    }
    if (options.resultsBodyOverride) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: options.resultsBodyOverride,
      })
      return
    }
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const items = status
      ? MATCHES.filter((match) => match.match_status === status)
      : MATCHES
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: resultsBody(items),
    })
  })

  await page.route('**/api/v1/invoices/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(INVOICE),
    }),
  )
  await page.route('**/api/v1/transactions/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TRANSACTION),
    }),
  )
}

test('renders the Reconciliation workspace with table, statuses and inspector', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/reconciliation')

  await expect(
    page.getByRole('heading', { name: 'Reconciliation' }),
  ).toBeVisible()
  await expect(page.getByText('Deterministic invoice', { exact: false })).toBeVisible()

  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Difference' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Rule applied' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)

  const body = page.locator('tbody')
  await expect(body.getByText('Partial match')).toBeVisible()
  await expect(body.getByText('Exact match')).toBeVisible()
  await expect(body.getByText('Unmatched')).toBeVisible()

  await expect(page.getByText('Select a reconciliation row').first()).toBeVisible()
})

test('selecting a row updates the inspector and filtering clears an invalid selection', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/reconciliation')

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)

  await rows.nth(0).click()
  const inspector = page.locator('aside')
  await expect(inspector.getByText('aaaaaaaa-1111-2222')).toBeVisible()
  await expect(inspector.getByText('Linked records')).toBeVisible()
  await expect(inspector.getByText('INV-104')).toBeVisible()
  await expect(inspector.getByText('TXN-778').first()).toBeVisible()
  await expect(inspector.getByText('DETERMINISTIC', { exact: true })).toBeVisible()
  await expect(inspector.getByText('EVIDENCE', { exact: true })).toBeVisible()
  await expect(inspector.getByText('Human decision')).toBeVisible()
  await expect(inspector.getByText('not applicable').first()).toBeVisible()

  // Filtering to exact_match removes the selected (partial) row, so the
  // inspector must drop the stale selection.
  await page.getByRole('button', { name: /Exact match/ }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('Select a reconciliation row').first()).toBeVisible()
})

test('shows the loading state while results are in flight', async ({ page }) => {
  await installMocks(page, { resultsDelayMs: 1500 })
  await page.goto('/reconciliation')

  await expect(page.getByText('Loading results')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
})

test('shows the empty state when there are no results', async ({ page }) => {
  await installMocks(page, {
    resultsBodyOverride: resultsBody([]),
  })
  await page.goto('/reconciliation')

  await expect(page.getByText('No reconciliation results')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows the API-error state with a retry action', async ({ page }) => {
  await installMocks(page, { resultsStatus: 500 })
  await page.goto('/reconciliation')

  await expect(
    page.getByText('Could not load reconciliation results'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('captures desktop and narrow screenshots', async ({ page }) => {
  await installMocks(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/reconciliation')
  await page.locator('tbody tr').first().click()
  await expect(page.locator('aside').getByText('Linked records')).toBeVisible()

  await page.screenshot({
    path: 'test-results/reconciliation-desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 420, height: 900 })
  await page.screenshot({
    path: 'test-results/reconciliation-narrow.png',
    fullPage: true,
  })
})

test('narrow layout keeps page width and scrolls only the table', async ({
  page,
}) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/reconciliation')
  await expect(page.locator('tbody tr')).toHaveCount(3)

  const metrics = await page.evaluate(() => {
    const table = document.querySelector('table')
    const scroller = table?.parentElement as HTMLElement | null
    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      tableScrollWidth: scroller?.scrollWidth ?? 0,
      tableClientWidth: scroller?.clientWidth ?? 0,
      navVisible: isVisible(document.querySelector('nav')),
    }

    function isVisible(el: Element | null): boolean {
      if (!el) return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
  })

  // The shell (nav + context bar) fits: no page-level horizontal scroll.
  expect(metrics.navVisible).toBe(true)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewport + 1)

  // Horizontal scrolling is confined to the dense table.
  expect(metrics.tableScrollWidth).toBeGreaterThan(metrics.tableClientWidth)

  // The evidence inspector stays reachable on narrow: selecting a row reveals
  // it stacked below the table.
  await page.locator('tbody tr').first().click()
  await expect(page.locator('aside').getByText('Linked records')).toBeVisible()
  await expect(page.locator('aside').getByText('aaaaaaaa-1111-2222')).toBeVisible()
})
