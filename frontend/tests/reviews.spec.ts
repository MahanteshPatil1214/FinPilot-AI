import { expect, test, type Page } from '@playwright/test'

// Synthetic review data only. Every /api request is intercepted in the browser;
// no backend, database or model is contacted.

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
    { page_number: 1, content: 'Tax invoice header page.', char_count: 24 },
    {
      page_number: 2,
      content: 'Payment terms: net 30. Invoice INV-104 total INR 12,000.00.',
      char_count: 59,
    },
  ],
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

interface ReviewRecord {
  id: string
  investigation_id: string
  decision: string
  rationale: string
  reviewer_id: string | null
  previous_status: string
  resulting_status: string
  report_version: number
  is_current: boolean
  created_at: string
}

interface MockInvestigation {
  id: string
  organization_id: string
  created_by: string | null
  invoice_id: string | null
  reconciliation_match_id: string | null
  status: string
  workflow_state: string | null
  model_name: string | null
  report_version: number
  report: unknown
  review_status: string | null
  latest_review: ReviewRecord | null
  created_at: string
  updated_at: string
}

const INV_AWAITING: MockInvestigation = {
  id: 'inv-await-1',
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

const INV_COMPLETED: MockInvestigation = {
  id: 'inv-done-1',
  organization_id: 'org_1',
  created_by: 'demo-user',
  invoice_id: 'inv-104',
  reconciliation_match_id: 'match-1',
  status: 'completed',
  workflow_state: 'completed',
  model_name: 'deterministic',
  report_version: 1,
  report: REPORT_AI,
  review_status: null,
  latest_review: null,
  created_at: '2026-10-04T10:00:00Z',
  updated_at: '2026-10-04T10:00:00Z',
}

const SUPERSEDED_RECORD: ReviewRecord = {
  id: 'rev-old',
  investigation_id: 'inv-super-1',
  decision: 'approved',
  rationale: 'Approved an earlier report version.',
  reviewer_id: 'demo-user',
  previous_status: 'needs_review',
  resulting_status: 'approved',
  report_version: 1,
  is_current: false,
  created_at: '2026-10-03T09:00:00Z',
}

const INV_SUPERSEDED: MockInvestigation = {
  id: 'inv-super-1',
  organization_id: 'org_1',
  created_by: 'demo-user',
  invoice_id: 'inv-104',
  reconciliation_match_id: null,
  status: 'needs_review',
  workflow_state: 'human_review',
  model_name: 'deterministic',
  report_version: 3,
  report: REPORT_AI,
  review_status: null,
  latest_review: SUPERSEDED_RECORD,
  created_at: '2026-10-03T10:00:00Z',
  updated_at: '2026-10-05T10:05:00Z',
}

const DECISION_TO_STATUS: Record<string, string> = {
  approved: 'approved',
  rejected: 'rejected',
  needs_more_information: 'needs_more_information',
}

interface MockOptions {
  items?: MockInvestigation[]
  listDelayMs?: number
  listStatus?: number
  detailStatus?: number
  reviewError?: { status: number; detail: string }
  staleBumpVersion?: boolean
}

interface MockState {
  listRequests: string[]
  reviewRequests: {
    id: string
    body: { decision: string; rationale: string; report_version: number }
  }[]
}

function baseItems(): MockInvestigation[] {
  return structuredClone([INV_AWAITING, INV_COMPLETED, INV_SUPERSEDED])
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = { listRequests: [], reviewRequests: [] }
  const items = options.items ?? baseItems()
  const history: Record<string, ReviewRecord[]> = {
    'inv-super-1': [SUPERSEDED_RECORD],
  }

  await page.route('**/api/v1/investigations**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    // POST /investigations/{id}/review
    if (path.endsWith('/review')) {
      const id = path.split('/').slice(-2, -1)[0]
      const body = JSON.parse(
        request.postData() ?? '{}',
      ) as ReviewRecord & { decision: string }
      state.reviewRequests.push({ id, body })

      if (options.reviewError) {
        if (options.staleBumpVersion) {
          const index = items.findIndex((item) => item.id === id)
          if (index >= 0) {
            items[index] = {
              ...items[index],
              report_version: items[index].report_version + 1,
              report: REPORT_AI,
            }
          }
        }
        await route.fulfill({
          status: options.reviewError.status,
          contentType: 'application/json',
          body: JSON.stringify({ detail: options.reviewError.detail }),
        })
        return
      }

      const index = items.findIndex((item) => item.id === id)
      const current = items[index]
      const resulting = DECISION_TO_STATUS[body.decision] ?? 'needs_review'
      const record: ReviewRecord = {
        id: `rev-${state.reviewRequests.length}`,
        investigation_id: id,
        decision: body.decision,
        rationale: body.rationale,
        reviewer_id: 'demo-user',
        previous_status: current.status,
        resulting_status: resulting,
        report_version: body.report_version,
        is_current: true,
        created_at: '2026-10-05T12:00:00Z',
      }
      history[id] = [...(history[id] ?? []), record]
      const updated: MockInvestigation = {
        ...current,
        status: resulting,
        review_status: body.decision,
        latest_review: record,
        updated_at: '2026-10-05T12:00:00Z',
      }
      items[index] = updated
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      })
      return
    }

    // GET /investigations/{id}/reviews
    if (path.endsWith('/reviews')) {
      const id = path.split('/').slice(-2, -1)[0]
      const reviewItems = history[id] ?? []
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

    // GET /investigations (queue / list)
    if (path.endsWith('/investigations')) {
      if (options.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs))
      }
      state.listRequests.push(url.search)
      if (options.listStatus && options.listStatus !== 200) {
        await route.fulfill({
          status: options.listStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Review service unavailable' }),
        })
        return
      }
      const status = url.searchParams.get('status')
      const skip = Number(url.searchParams.get('skip') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? '25')
      const filtered = status
        ? items.filter((item) => item.status === status)
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

    // GET /investigations/{id}
    if (options.detailStatus && options.detailStatus !== 200) {
      await route.fulfill({
        status: options.detailStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Investigation not found' }),
      })
      return
    }
    const id = path.split('/').pop()
    const found = items.find((item) => item.id === id)
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

test('queue defaults to investigations awaiting review', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/reviews')

  await expect(
    page.getByRole('heading', { name: 'Report review' }),
  ).toBeVisible()

  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(
    page.locator('tbody').getByText('Needs review', { exact: true }).first(),
  ).toBeVisible()
  expect(state.listRequests.some((q) => q.includes('status=needs_review'))).toBe(
    true,
  )
})

test('the queue can show completed reports', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/reviews')

  await page.getByRole('button', { name: 'Completed' }).click()

  await expect(page.locator('tbody tr')).toHaveCount(1)
  expect(state.listRequests.some((q) => q.includes('status=completed'))).toBe(
    true,
  )
})

test('the queue paginates using the reported total', async ({ page }) => {
  const items = Array.from({ length: 30 }, (_, index) => ({
    ...INV_AWAITING,
    id: `inv-bulk-${index}`,
    created_at: `2026-10-05T10:${String(index).padStart(2, '0')}:00Z`,
  }))
  await installMocks(page, { items })
  await page.goto('/reviews')

  await expect(page.locator('tbody tr')).toHaveCount(25)
  await expect(page.getByText('1–25 of 30')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(5)
  await expect(page.getByText('26–30 of 30')).toBeVisible()
})

test('opening a queued report shows the review workspace', async ({ page }) => {
  await installMocks(page)
  await page.goto('/reviews')
  await page.locator('tbody tr').first().click()

  await expect(page).toHaveURL(/\/reviews\/inv-await-1$/)
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(page.getByText('Awaiting decision')).toBeVisible()

  await expect(page.getByText('Assessment')).toBeVisible()
  await expect(page.getByText('Medium confidence')).toBeVisible()
  await expect(page.getByText('Recommended action')).toBeVisible()
  await expect(page.getByText('Review supporting documents')).toBeVisible()

  await expect(page.getByText('INV-104.pdf')).toBeVisible()
  await expect(page.getByText('Page 2')).toBeVisible()
  await expect(page.getByText('Partial match')).toBeVisible()
  await expect(page.getByText('TXN-778').first()).toBeVisible()

  await expect(page.getByText('Record a decision')).toBeVisible()
  await expect(page.getByText('Audit timeline')).toBeVisible()
  await expect(page.getByText('No decisions recorded')).toBeVisible()
})

test('approving records the decision against the shown report version', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/reviews/inv-await-1')

  await page.getByLabel('Rationale').fill('Confirmed against the delivery note.')
  await page.getByRole('button', { name: 'Approve report' }).click()

  await expect(page.getByRole('status')).toContainText('Decision recorded')
  expect(state.reviewRequests).toHaveLength(1)
  expect(state.reviewRequests[0].id).toBe('inv-await-1')
  expect(state.reviewRequests[0].body).toEqual({
    decision: 'approved',
    rationale: 'Confirmed against the delivery note.',
    report_version: 2,
  })

  // The refetched audit timeline shows the new current decision and the form is
  // no longer offering a decision.
  await expect(page.getByText('Current', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Confirmed against the delivery note.'),
  ).toBeVisible()
  await expect(
    page.getByText('This investigation is not currently awaiting a review decision.'),
  ).toBeVisible()
})

test('rejecting records a rejected decision', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/reviews/inv-await-1')

  await page.getByRole('radio', { name: /Reject/ }).check()
  await page.getByLabel('Rationale').fill('Amounts do not reconcile.')
  await page.getByRole('button', { name: 'Reject report' }).click()

  await expect(page.getByRole('status')).toContainText('Decision recorded')
  expect(state.reviewRequests[0].body.decision).toBe('rejected')
})

test('needs-more-information records a hold decision', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/reviews/inv-await-1')

  await page.getByRole('radio', { name: 'Needs more information' }).check()
  await page.getByLabel('Rationale').fill('Awaiting the signed note.')
  await page.getByRole('button', { name: 'Request more information' }).click()

  await expect(page.getByRole('status')).toContainText('Decision recorded')
  expect(state.reviewRequests[0].body.decision).toBe('needs_more_information')
})

test('requires a rationale before submitting a decision', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/reviews/inv-await-1')

  await page.getByRole('button', { name: 'Approve report' }).click()

  await expect(
    page.getByText('A rationale is required before recording a decision.'),
  ).toBeVisible()
  expect(state.reviewRequests).toHaveLength(0)
})

test('a stale report version is not overwritten', async ({ page }) => {
  const state = await installMocks(page, {
    reviewError: {
      status: 409,
      detail: 'Stale review: the investigation changed since it was reviewed',
    },
    staleBumpVersion: true,
  })
  await page.goto('/reviews/inv-await-1')

  await page.getByLabel('Rationale').fill('Approve the shown version.')
  await page.getByRole('button', { name: 'Approve report' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(
    'This report changed while you were reviewing it',
  )
  await expect(alert).toContainText('Your decision was not saved')
  expect(state.reviewRequests[0].body.report_version).toBe(2)

  // The conflict refetches the investigation so the newer version is visible.
  await expect(page.getByText('Report v3').first()).toBeVisible()
})

test('an ineligible status is reported without saving', async ({ page }) => {
  const state = await installMocks(page, {
    reviewError: {
      status: 409,
      detail: "Investigation is not eligible for review (status 'completed')",
    },
  })
  await page.goto('/reviews/inv-await-1')

  await page.getByLabel('Rationale').fill('Try anyway.')
  await page.getByRole('button', { name: 'Approve report' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(
    'This investigation is not eligible for review',
  )
  await expect(alert).toContainText("status 'completed'")
  expect(state.reviewRequests).toHaveLength(1)
})

test('superseded decisions stay in the audit timeline', async ({ page }) => {
  await installMocks(page)
  await page.goto('/reviews/inv-super-1')

  await expect(page.getByText('Superseded').first()).toBeVisible()
  await expect(page.getByText('Approved an earlier report version.')).toBeVisible()
  await expect(page.getByText('Report v1')).toBeVisible()
})

test('shows the loading state while the queue is in flight', async ({ page }) => {
  await installMocks(page, { listDelayMs: 1500 })
  await page.goto('/reviews')

  await expect(page.getByText('Loading review queue')).toBeVisible()
})

test('shows the empty state when nothing awaits review', async ({ page }) => {
  await installMocks(page, { items: [] })
  await page.goto('/reviews')

  await expect(page.getByText('Nothing awaiting review')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows an error state with retry', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/reviews')

  await expect(page.getByText('Could not load the review queue')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('shows a not-found state for an unknown investigation', async ({ page }) => {
  await installMocks(page)
  await page.goto('/reviews/does-not-exist')

  await expect(page.getByText('Investigation not found').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Back to report review/ }),
  ).toBeVisible()
})

test('narrow layout keeps the page and inspector reachable', async ({ page }) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/reviews/inv-await-1')

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
