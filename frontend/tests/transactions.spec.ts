import { expect, test, type Page } from '@playwright/test'

// Synthetic transaction data only. Every /api request is intercepted in the
// browser; no backend or database is contacted.

const TX_A = {
  id: 'tx-a-1111',
  organization_id: 'org_1',
  transaction_reference: 'TXN-2026-0001',
  transaction_date: '2026-10-03',
  description: 'Card payment to Acme Supplies',
  amount: '-12500.50',
  currency: 'INR',
  counterparty: 'Acme Supplies',
  source_document_id: 'doc-a-1111',
  import_batch_id: 'batch-2026-10',
  created_at: '2026-10-05T10:00:00Z',
}

const TX_B = {
  id: 'tx-b-2222',
  organization_id: 'org_1',
  transaction_reference: 'TXN-2026-0002',
  transaction_date: '2026-10-04',
  description: 'Incoming bank transfer',
  amount: '48000.00',
  currency: 'INR',
  counterparty: 'Northwind Traders',
  source_document_id: null,
  import_batch_id: 'batch-2026-10',
  created_at: '2026-10-05T10:05:00Z',
}

function makeTransaction(index: number) {
  const n = String(index).padStart(4, '0')
  return {
    id: `tx-gen-${n}`,
    organization_id: 'org_1',
    transaction_reference: `TXN-2026-${n}`,
    transaction_date: '2026-10-02',
    description: `Generated row ${n}`,
    amount: '1.00',
    currency: 'INR',
    counterparty: 'Synthetic Counterparty',
    source_document_id: null,
    import_batch_id: 'batch-gen',
    created_at: '2026-10-05T10:00:00Z',
  }
}

interface MockOptions {
  items?: Array<typeof TX_A>
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
  const items = options.items ?? [TX_A, TX_B]
  const pageSize = options.pageSize ?? 25
  const totalRows = options.totalRows ?? items.length

  await page.route('**/api/v1/transactions**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/transactions')) {
      if (options.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs))
      }
      if (options.listStatus && options.listStatus !== 200) {
        state.listRequests.push(url.search)
        await route.fulfill({
          status: options.listStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Transaction service unavailable' }),
        })
        return
      }

      state.listRequests.push(url.search)
      const skip = Number(url.searchParams.get('skip') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? String(pageSize))

      // When totalRows exceeds the seed list, serve generated rows so pagination
      // can be exercised without a real backend.
      const source =
        totalRows > items.length
          ? Array.from({ length: totalRows }, (_, i) => makeTransaction(i + 1))
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

test('lists transactions and prompts for a selection', async ({ page }) => {
  await installMocks(page)
  await page.goto('/transactions')

  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('TXN-2026-0001')).toBeVisible()
  await expect(page.getByText('Northwind Traders')).toBeVisible()
  await expect(page.getByText('-₹12,500.50')).toBeVisible()

  await expect(
    page.getByText('Select a transaction to inspect'),
  ).toBeVisible()
})

test('selecting a row shows stored fields and source document', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/transactions')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await expect(inspector.getByText('TXN-2026-0001').first()).toBeVisible()
  await expect(inspector.getByText('Card payment to Acme Supplies')).toBeVisible()
  await expect(inspector.getByText('Import batch')).toBeVisible()
  await expect(inspector.getByText('Stored record')).toBeVisible()
  await expect(
    inspector.getByRole('link', { name: 'doc-a-1111' }),
  ).toBeVisible()
})

test('filtering narrows rows and clears a stale selection', async ({ page }) => {
  await installMocks(page)
  await page.goto('/transactions')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await expect(inspector.getByText('TXN-2026-0001').first()).toBeVisible()

  await page.getByRole('searchbox').fill('northwind')

  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('TXN-2026-0002')).toBeVisible()
  await expect(
    inspector.getByText('Select a transaction to inspect'),
  ).toBeVisible()
})

test('pagination requests the next page via skip', async ({ page }) => {
  const state = await installMocks(page, { totalRows: 30 })
  await page.goto('/transactions')

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
  await page.goto('/transactions')

  await expect(page.getByText('Loading transactions')).toBeVisible()
})

test('shows the empty state when there are no transactions', async ({
  page,
}) => {
  await installMocks(page, { items: [] })
  await page.goto('/transactions')

  await expect(page.getByText('No transactions')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows an error state with retry when listing fails', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/transactions')

  await expect(page.getByText('Could not load transactions')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('narrow layout keeps page width on the transactions page', async ({
  page,
}) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/transactions')
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
