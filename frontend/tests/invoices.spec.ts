import { expect, test, type Page } from '@playwright/test'

// Synthetic invoice data only. Every /api request is intercepted in the
// browser; no backend or database is contacted.

const INV_A = {
  id: 'inv-a-1111',
  organization_id: 'org_1',
  invoice_number: 'INV-2026-0001',
  invoice_date: '2026-10-01',
  due_date: '2026-10-31',
  currency: 'INR',
  total_amount: '12500.50',
  source_document_id: 'doc-a-1111',
  extraction_status: 'completed',
  created_at: '2026-10-05T10:00:00Z',
}

const INV_B = {
  id: 'inv-b-2222',
  organization_id: 'org_1',
  invoice_number: 'INV-2026-0002',
  invoice_date: '2026-10-02',
  due_date: null,
  currency: 'USD',
  total_amount: '999.00',
  source_document_id: null,
  extraction_status: 'pending',
  created_at: '2026-10-05T10:05:00Z',
}

function makeInvoice(index: number) {
  const n = String(index).padStart(4, '0')
  return {
    id: `inv-gen-${n}`,
    organization_id: 'org_1',
    invoice_number: `INV-2026-${n}`,
    invoice_date: '2026-09-30',
    due_date: null,
    currency: 'INR',
    total_amount: '1.00',
    source_document_id: null,
    extraction_status: 'completed',
    created_at: '2026-10-05T10:00:00Z',
  }
}

interface MockOptions {
  items?: Array<typeof INV_A>
  listStatus?: number
  pageSize?: number
  totalRows?: number
  listDelayMs?: number
}

interface MockState {
  listRequests: string[]
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = { listRequests: [] }
  const items = options.items ?? [INV_A, INV_B]
  const pageSize = options.pageSize ?? 25
  const totalRows = options.totalRows ?? items.length

  await page.route('**/api/v1/invoices**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/invoices')) {
      if (options.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs))
      }
      if (options.listStatus && options.listStatus !== 200) {
        state.listRequests.push(url.search)
        await route.fulfill({
          status: options.listStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Invoice service unavailable' }),
        })
        return
      }

      state.listRequests.push(url.search)
      const skip = Number(url.searchParams.get('skip') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? String(pageSize))

      const source =
        totalRows > items.length
          ? Array.from({ length: totalRows }, (_, i) => makeInvoice(i + 1))
          : items
      const slice = source.slice(skip, skip + limit)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(slice),
      })
      return
    }

    await route.fulfill({ status: 404, body: 'Not found' })
  })

  return state
}

test('lists invoices with extraction status', async ({ page }) => {
  await installMocks(page)
  await page.goto('/invoices')

  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('INV-2026-0001')).toBeVisible()
  await expect(page.getByText('₹12,500.50')).toBeVisible()

  const body = page.locator('tbody')
  await expect(body.getByText('Extracted')).toBeVisible()
  await expect(body.getByText('Pending')).toBeVisible()

  await expect(page.getByText('Select an invoice to inspect')).toBeVisible()
})

test('selecting an invoice shows stored fields and source document', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/invoices')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await expect(inspector.getByText('INV-2026-0001').first()).toBeVisible()
  await expect(inspector.getByText('Invoice date')).toBeVisible()
  await expect(inspector.getByText('Due date')).toBeVisible()
  await expect(inspector.getByText('Total amount')).toBeVisible()
  await expect(inspector.getByText('Stored record')).toBeVisible()
  await expect(
    inspector.getByRole('link', { name: 'doc-a-1111' }),
  ).toBeVisible()
})

test('extraction status filter narrows the rows', async ({ page }) => {
  await installMocks(page)
  await page.goto('/invoices')

  await page.getByRole('button', { name: 'Pending' }).click()

  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('INV-2026-0002')).toBeVisible()
  await expect(page.getByText('INV-2026-0001')).toHaveCount(0)
})

test('search filter narrows the rows and clears a stale selection', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/invoices')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await expect(inspector.getByText('INV-2026-0001').first()).toBeVisible()

  await page.getByRole('searchbox').fill('INV-2026-0002')

  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(
    inspector.getByText('Select an invoice to inspect'),
  ).toBeVisible()
})

test('pagination requests the next page via skip', async ({ page }) => {
  const state = await installMocks(page, { totalRows: 30 })
  await page.goto('/invoices')

  await expect(page.locator('tbody tr')).toHaveCount(25)
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()

  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.locator('tbody tr')).toHaveCount(5)
  await expect(page.getByText('Records 26–30')).toBeVisible()
  expect(state.listRequests.some((q) => q.includes('skip=25'))).toBe(true)
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('shows the loading state while records are in flight', async ({
  page,
}) => {
  await installMocks(page, { listDelayMs: 1500 })
  await page.goto('/invoices')

  await expect(page.getByText('Loading invoices')).toBeVisible()
})

test('shows the empty state when there are no invoices', async ({ page }) => {
  await installMocks(page, { items: [] })
  await page.goto('/invoices')

  await expect(page.getByText('No invoices')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows an error state with retry when listing fails', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/invoices')

  await expect(page.getByText('Could not load invoices')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('narrow layout keeps page width on the invoices page', async ({
  page,
}) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/invoices')
  await expect(page.locator('tbody tr')).toHaveCount(2)

  const metrics = await page.evaluate(() => {
    const table = document.querySelector('table')
    const scroller = table?.parentElement as HTMLElement | null
    const nav = document.querySelector('nav')
    const navRect = nav?.getBoundingClientRect()
    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      tableScrollWidth: scroller?.scrollWidth ?? 0,
      tableClientWidth: scroller?.clientWidth ?? 0,
      navVisible: !!navRect && navRect.width > 0 && navRect.height > 0,
    }
  })

  expect(metrics.navVisible).toBe(true)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewport + 1)
  expect(metrics.tableScrollWidth).toBeGreaterThan(metrics.tableClientWidth)
})
