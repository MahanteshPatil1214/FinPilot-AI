import { expect, test, type Page } from '@playwright/test'

// Synthetic audit-trail data only. Every /api request is intercepted in the
// browser; no backend, database or model is contacted.

const CREATED_EVENT = {
  id: 'evt-created-1',
  organization_id: 'org_1',
  actor_id: 'demo-user',
  entity_type: 'investigation',
  entity_id: 'inv-0001-aaaa',
  action: 'investigation_created',
  details: {
    invoice_id: 'inv-104',
    reconciliation_match_id: 'match-1',
  },
  created_at: '2026-10-05T10:00:00Z',
}

const RUN_EVENT = {
  id: 'evt-run-1',
  organization_id: 'org_1',
  actor_id: 'demo-user',
  entity_type: 'investigation',
  entity_id: 'inv-0001-aaaa',
  action: 'investigation_run',
  details: {
    status: 'completed',
    workflow_state: 'completed',
    report_version: 1,
    model_name: 'deterministic',
  },
  created_at: '2026-10-05T10:05:00Z',
}

const REVIEW_EVENT = {
  id: 'evt-review-1',
  organization_id: 'org_1',
  actor_id: 'demo-user',
  entity_type: 'investigation',
  entity_id: 'inv-0001-aaaa',
  action: 'review_decision',
  details: {
    decision: 'approved',
    previous_status: 'needs_review',
    resulting_status: 'approved',
    report_version: 1,
    reviewer_id: 'demo-user',
  },
  created_at: '2026-10-05T10:10:00Z',
}

interface MockState {
  requests: string[]
}

interface MockOptions {
  items?: unknown[]
  listDelayMs?: number
  listStatus?: number
}

function baseItems(): unknown[] {
  return structuredClone([REVIEW_EVENT, RUN_EVENT, CREATED_EVENT])
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = { requests: [] }
  const items = options.items ?? baseItems()

  await page.route('**/api/v1/audit/events**', async (route) => {
    const url = new URL(route.request().url())
    state.requests.push(url.search)

    if (options.listDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.listDelayMs))
    }
    if (options.listStatus && options.listStatus !== 200) {
      await route.fulfill({
        status: options.listStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Audit service unavailable' }),
      })
      return
    }

    const action = url.searchParams.get('action')
    const entityType = url.searchParams.get('entity_type')
    const entityId = url.searchParams.get('entity_id')
    const skip = Number(url.searchParams.get('skip') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '25')

    const filtered = items.filter((item) => {
      const event = item as {
        action: string
        entity_type: string
        entity_id: string
      }
      if (action && event.action !== action) return false
      if (entityType && event.entity_type !== entityType) return false
      if (entityId && event.entity_id !== entityId) return false
      return true
    })

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
  })

  return state
}

function manyEvents(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `evt-${String(index).padStart(3, '0')}`,
    organization_id: 'org_1',
    actor_id: 'demo-user',
    entity_type: 'investigation',
    entity_id: `inv-${String(index).padStart(4, '0')}`,
    action: 'investigation_run',
    details: { status: 'completed', report_version: index },
    created_at: `2026-10-05T10:${String(index % 60).padStart(2, '0')}:00Z`,
  }))
}

test('lists the audit trail newest first with labels and details', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/audit')

  await expect(
    page.getByRole('heading', { name: 'Audit history' }),
  ).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)

  const body = page.locator('tbody')
  await expect(body.getByText('Review decision', { exact: true })).toBeVisible()
  await expect(
    body.getByText('Investigation created', { exact: true }),
  ).toBeVisible()
  await expect(
    body.getByText('Investigation run', { exact: true }),
  ).toBeVisible()

  // Entity type is labeled and the id is shortened.
  await expect(body.getByText('Investigation', { exact: true }).first()).toBeVisible()
  await expect(body.getByText('inv-0001-aaa').first()).toBeVisible()

  // Actor is shown for each row.
  await expect(body.getByText('demo-user').first()).toBeVisible()

  // Details payload is humanized into a summary.
  await expect(body.getByText(/Decision: approved/)).toBeVisible()
})

test('the action filter narrows rows and is sent to the backend', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/audit')

  await page
    .getByRole('button', { name: 'Review decision', exact: true })
    .click()

  await expect(page.locator('tbody tr')).toHaveCount(1)
  expect(state.requests.some((q) => q.includes('action=review_decision'))).toBe(
    true,
  )
})

test('shows the loading state while the trail is in flight', async ({ page }) => {
  await installMocks(page, { listDelayMs: 1500 })
  await page.goto('/audit')

  await expect(page.getByText('Loading audit history')).toBeVisible()
})

test('shows the empty state when there are no events', async ({ page }) => {
  await installMocks(page, { items: [] })
  await page.goto('/audit')

  await expect(page.getByText('No audit events')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows an error state with retry', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/audit')

  await expect(page.getByText('Could not load audit history')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('paginates the trail with the pager controls', async ({ page }) => {
  const state = await installMocks(page, { items: manyEvents(30) })
  await page.goto('/audit')

  await expect(page.locator('tbody tr')).toHaveCount(25)
  await expect(page.getByText('1–25 of 30')).toBeVisible()

  const next = page.getByRole('button', { name: 'Next' })
  await expect(next).toBeEnabled()
  await next.click()

  await expect(page.locator('tbody tr')).toHaveCount(5)
  expect(state.requests.some((q) => q.includes('skip=25'))).toBe(true)

  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(25)
})
