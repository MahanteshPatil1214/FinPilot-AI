import { expect, test, type Page } from '@playwright/test'

// Synthetic investigation data only. Every /api request is intercepted in the
// browser; no backend, database or model is contacted.

const INVOICE = {
  id: 'inv-104',
  organization_id: 'org_1',
  invoice_number: 'INV-104',
  invoice_date: '2026-10-01',
  due_date: '2026-10-30',
  currency: 'INR',
  total_amount: '12000.00',
  source_document_id: 'doc-cite-1',
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

const MATCH = {
  id: 'match-1',
  organization_id: 'org_1',
  invoice_id: 'inv-104',
  transaction_id: 'txn-778',
  match_status: 'partial_match',
  matching_method: 'reference_exact',
  difference_amount: '50.00',
  explanation: "Reference 'TXN-778' matched; amounts differ by 50.00.",
  created_at: '2026-10-05T10:00:00Z',
}

const DOC_CITE = {
  id: 'doc-cite-1',
  organization_id: 'org_1',
  original_filename: 'INV-104.pdf',
  content_type: 'application/pdf',
  document_type: 'invoice',
  file_hash: 'hash-cite-1',
  file_size: 2048,
  page_count: 2,
  processing_status: 'completed',
  created_at: '2026-10-05T10:00:00Z',
  pages: [
    {
      page_number: 1,
      content: 'Tax invoice header page.',
      char_count: 24,
    },
    {
      page_number: 2,
      content: 'Payment terms: net 30. Invoice INV-104 total INR 12,000.00.',
      char_count: 59,
    },
  ],
}

const REPORT_AI = {
  summary:
    'The invoice and transaction reference agree, but the settled amount is short by 50.00.',
  findings: [
    {
      statement: 'Invoice -104 records a total of INR 12,000.00.',
      kind: 'fact',
      citations: [2],
    },
    {
      statement: "The transaction reference 'TXN-778' matches the invoice number.",
      kind: 'fact',
      citations: [1],
    },
    {
      statement: 'The 50.00 shortfall is likely a bank charge or fee.',
      kind: 'hypothesis',
      citations: [1, 2],
    },
  ],
  missing_evidence: ['No signed delivery note was found for this invoice.'],
  recommended_action: 'Review supporting documents',
  confidence: 'medium',
  requires_human_review: true,
  citations: [
    {
      index: 1,
      kind: 'document_chunk',
      document_id: 'doc-cite-1',
      filename: 'INV-104.pdf',
      document_type: 'invoice',
      page_number: 2,
      chunk_id: 'chunk-aaaa',
      score: 0.812,
      record_type: null,
      record_id: null,
    },
    {
      index: 2,
      kind: 'database_record',
      document_id: null,
      filename: null,
      document_type: null,
      page_number: null,
      chunk_id: null,
      score: null,
      record_type: 'invoice',
      record_id: 'inv-104',
    },
  ],
}

const REPORT_DET = {
  summary: 'Reference and amount agree with the linked transaction.',
  findings: [
    {
      statement: 'Invoice -104 records a total of INR 12,000.00.',
      kind: 'fact',
      citations: [1],
    },
  ],
  missing_evidence: [],
  recommended_action: 'No action needed',
  confidence: 'high',
  requires_human_review: false,
  citations: [
    {
      index: 1,
      kind: 'database_record',
      document_id: null,
      filename: null,
      document_type: null,
      page_number: null,
      chunk_id: null,
      score: null,
      record_type: 'invoice',
      record_id: 'inv-104',
    },
  ],
}

const INV_NEEDS_REVIEW = {
  id: 'inv-0001-aaaa',
  organization_id: 'org_1',
  created_by: 'demo-user',
  invoice_id: 'inv-104',
  reconciliation_match_id: 'match-1',
  status: 'needs_review',
  workflow_state: 'human_review',
  model_name: 'llama-3.3-70b-versatile',
  report_version: 2,
  report: REPORT_AI,
  review_status: null,
  latest_review: null,
  created_at: '2026-10-05T10:00:00Z',
  updated_at: '2026-10-05T10:05:00Z',
}

const INV_PENDING = {
  id: 'inv-0002-bbbb',
  organization_id: 'org_1',
  created_by: 'demo-user',
  invoice_id: 'inv-104',
  reconciliation_match_id: null,
  status: 'pending',
  workflow_state: null,
  model_name: null,
  report_version: 0,
  report: null,
  review_status: null,
  latest_review: null,
  created_at: '2026-10-04T10:00:00Z',
  updated_at: '2026-10-04T10:00:00Z',
}

const INV_COMPLETED = {
  id: 'inv-0003-cccc',
  organization_id: 'org_1',
  created_by: 'demo-user',
  invoice_id: 'inv-104',
  reconciliation_match_id: 'match-1',
  status: 'completed',
  workflow_state: 'completed',
  model_name: 'deterministic',
  report_version: 2,
  report: REPORT_DET,
  review_status: null,
  latest_review: {
    id: 'rev-old',
    investigation_id: 'inv-0003-cccc',
    decision: 'approved',
    rationale: 'Approved an earlier report version.',
    reviewer_id: 'demo-user',
    previous_status: 'needs_review',
    resulting_status: 'approved',
    report_version: 1,
    is_current: false,
    created_at: '2026-10-04T09:00:00Z',
  },
  created_at: '2026-10-03T10:00:00Z',
  updated_at: '2026-10-04T09:00:00Z',
}

const REVIEW_NEEDS_INFO = {
  id: 'rev-1',
  investigation_id: 'inv-0001-aaaa',
  decision: 'needs_more_information',
  rationale: 'Need the signed delivery note before deciding.',
  reviewer_id: 'demo-user',
  previous_status: 'needs_review',
  resulting_status: 'needs_more_information',
  report_version: 1,
  is_current: false,
  created_at: '2026-10-05T09:30:00Z',
}

interface MockState {
  listRequests: string[]
  runRequests: string[]
}

interface MockOptions {
  items?: unknown[]
  listDelayMs?: number
  listStatus?: number
  detailStatus?: number
}

function baseItems(): unknown[] {
  return structuredClone([INV_NEEDS_REVIEW, INV_PENDING, INV_COMPLETED])
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = { listRequests: [], runRequests: [] }
  const items = options.items ?? baseItems()

  await page.route('**/api/v1/investigations**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path.endsWith('/run')) {
      const id = path.split('/').slice(-2, -1)[0]
      state.runRequests.push(id)
      const current = items.find((item) => (item as { id: string }).id === id) as
        | typeof INV_PENDING
        | undefined
      const updated = {
        ...(current ?? INV_PENDING),
        status: 'completed',
        workflow_state: 'completed',
        model_name: 'deterministic',
        report_version: 1,
        report: REPORT_DET,
        updated_at: '2026-10-05T11:00:00Z',
      }
      items[items.findIndex((item) => (item as { id: string }).id === id)] =
        updated
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      })
      return
    }

    if (path.endsWith('/reviews')) {
      const id = path.split('/').slice(-2, -1)[0]
      const reviewItems = id === 'inv-0003-cccc' ? [INV_COMPLETED.latest_review] : id === 'inv-0001-aaaa' ? [REVIEW_NEEDS_INFO] : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          investigation_id: id,
          total: reviewItems.length,
          review_status: null,
          items: reviewItems,
        }),
      })
      return
    }

    if (path.endsWith('/investigations')) {
      if (options.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs))
      }
      if (options.listStatus && options.listStatus !== 200) {
        state.listRequests.push(url.search)
        await route.fulfill({
          status: options.listStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Investigation service unavailable' }),
        })
        return
      }
      state.listRequests.push(url.search)
      const status = url.searchParams.get('status')
      const skip = Number(url.searchParams.get('skip') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? '25')
      const filtered = status
        ? items.filter(
            (item) => (item as { status: string }).status === status,
          )
        : items
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: filtered.length,
          skip,
          limit,
          items: filtered.slice(skip, skip + limit),
        }),
      })
      return
    }

    // Detail: /api/v1/investigations/{id}
    if (options.detailStatus && options.detailStatus !== 200) {
      await route.fulfill({
        status: options.detailStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Investigation not found' }),
      })
      return
    }
    const id = path.split('/').pop()
    const found = items.find((item) => (item as { id: string }).id === id)
    if (!found) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Investigation not found' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(found),
    })
  })

  await page.route('**/api/v1/documents/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DOC_CITE),
    }),
  )
  await page.route('**/api/v1/reconciliation/results/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MATCH),
    }),
  )
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

  return state
}

test('lists investigations with statuses and review state', async ({ page }) => {
  await installMocks(page)
  await page.goto('/investigations')

  await expect(
    page.getByRole('heading', { name: 'Investigations' }),
  ).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)

  const body = page.locator('tbody')
  await expect(body.getByText('Needs review', { exact: true })).toBeVisible()
  await expect(body.getByText('Pending', { exact: true })).toBeVisible()
  await expect(body.getByText('Completed', { exact: true })).toBeVisible()
  await expect(body.getByText('Superseded')).toBeVisible()
  await expect(body.getByText('v2').first()).toBeVisible()
})

test('status filter narrows rows using the backend status parameter', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/investigations')

  await page.getByRole('button', { name: 'Pending', exact: true }).click()

  await expect(page.locator('tbody tr')).toHaveCount(1)
  expect(state.listRequests.some((q) => q.includes('status=pending'))).toBe(true)
})

test('opening a case file shows report, findings, evidence and review history', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/investigations')
  await page.locator('tbody tr').first().click()

  await expect(page).toHaveURL(/\/investigations\/inv-0001-aaaa$/)
  await expect(page.getByRole('heading', { name: /Investigation/ })).toBeVisible()

  await expect(page.getByText('Assessment')).toBeVisible()
  await expect(page.getByText('Medium confidence')).toBeVisible()
  await expect(page.getByText('Human review required')).toBeVisible()
  await expect(page.getByText('Recommended action')).toBeVisible()
  await expect(page.getByText('Review supporting documents')).toBeVisible()

  // Facts and hypotheses are separated and tagged by provenance.
  await expect(
    page.getByText('Invoice -104 records a total of INR 12,000.00.'),
  ).toBeVisible()
  await expect(
    page.getByText('The 50.00 shortfall is likely a bank charge or fee.'),
  ).toBeVisible()
  const hypothesisSection = page.locator('section', {
    has: page.getByRole('heading', { name: 'Hypotheses' }),
  })
  await expect(hypothesisSection.getByTitle('AI hypothesis')).toBeVisible()

  await expect(page.getByText('Missing evidence')).toBeVisible()
  await expect(
    page.getByText('No signed delivery note was found for this invoice.'),
  ).toBeVisible()

  // Evidence table lists both cited sources.
  await expect(page.getByRole('columnheader', { name: 'Source' })).toBeVisible()
  await expect(page.getByText('INV-104.pdf')).toBeVisible()
  await expect(page.getByText('Page 2')).toBeVisible()

  // Linked records resolve invoice, match and transaction, each navigable to
  // the workspace that owns the record.
  await expect(page.getByText('INV-104').first()).toBeVisible()
  await expect(page.getByText('Partial match')).toBeVisible()
  await expect(page.getByText('TXN-778').first()).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Open invoices/ }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Open reconciliation/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Open transactions/ }),
  ).toBeVisible()

  // Review history preserves the superseded decision.
  await expect(page.getByText('Needs more information')).toBeVisible()
  await expect(
    page.getByText('Need the signed delivery note before deciding.'),
  ).toBeVisible()
})

test('selecting a citation shows stored page text, then a database record', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/investigations/inv-0001-aaaa')

  const inspector = page.locator('aside')
  await expect(
    inspector.getByText('Select a citation', { exact: false }),
  ).toBeVisible()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(2)

  // First citation is a document passage: its stored page text is fetched.
  await rows.nth(0).click()
  await expect(inspector.getByText('Stored page text')).toBeVisible()
  await expect(
    inspector.getByText('Payment terms: net 30', { exact: false }),
  ).toBeVisible()
  await expect(
    inspector.getByText('The exact retrieved passage is not stored', {
      exact: false,
    }),
  ).toBeVisible()

  // Second citation is a database record: no passage, links to the record.
  await rows.nth(1).click()
  await expect(
    inspector.getByText('Database record', { exact: true }),
  ).toBeVisible()
  await expect(
    inspector.getByText('points to a stored database record', { exact: false }),
  ).toBeVisible()
  await expect(
    inspector.getByRole('link', { name: /Open invoices/ }),
  ).toBeVisible()
})

test('running a pending investigation produces a report', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/investigations/inv-0002-bbbb')

  await expect(page.getByText('No report yet')).toBeVisible()
  const runButton = page.getByRole('button', {
    name: 'Run investigation',
    exact: true,
  })
  await expect(runButton).toBeVisible()

  await runButton.click()

  await expect(page.getByText('Assessment')).toBeVisible()
  await expect(page.getByText('Recommended action')).toBeVisible()
  await expect(page.getByText('No report yet')).toHaveCount(0)
  expect(state.runRequests).toContain('inv-0002-bbbb')
})

test('a report-bearing investigation offers re-run and warns about versioning', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/investigations/inv-0001-aaaa')

  await expect(
    page.getByRole('button', { name: 'Re-run investigation', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Re-running produces a new report version', { exact: false }),
  ).toBeVisible()
})

test('shows the loading state while list records are in flight', async ({
  page,
}) => {
  await installMocks(page, { listDelayMs: 1500 })
  await page.goto('/investigations')

  await expect(page.getByText('Loading investigations')).toBeVisible()
})

test('shows the empty state when there are no investigations', async ({
  page,
}) => {
  await installMocks(page, { items: [] })
  await page.goto('/investigations')

  await expect(page.getByText('No investigations')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows a list error state with retry', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/investigations')

  await expect(page.getByText('Could not load investigations')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('shows a detail error state when the investigation cannot be loaded', async ({
  page,
}) => {
  await installMocks(page, { detailStatus: 500 })
  await page.goto('/investigations/inv-0001-aaaa')

  await expect(page.getByText('Could not load investigation')).toBeVisible()
})

test('shows a not-found state for an unknown investigation', async ({ page }) => {
  await installMocks(page)
  await page.goto('/investigations/does-not-exist')

  await expect(page.getByText('Investigation not found').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Back to investigations/ }),
  ).toBeVisible()
})

test('narrow layout keeps page width and keeps the inspector reachable', async ({
  page,
}) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/investigations/inv-0001-aaaa')

  await expect(page.getByText('Assessment')).toBeVisible()

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('nav')
    const navRect = nav?.getBoundingClientRect()
    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      navVisible: !!navRect && navRect.width > 0 && navRect.height > 0,
    }
  })

  expect(metrics.navVisible).toBe(true)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewport + 1)

  await page.locator('table tbody tr').first().click()
  await expect(page.locator('aside').getByText('Stored page text')).toBeVisible()
})
