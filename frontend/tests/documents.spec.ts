import { expect, test, type Page } from '@playwright/test'

// Synthetic document data only. Every /api request is intercepted in the
// browser; no backend, storage or embedding model is contacted.

const DOC_A = {
  id: 'doc-a-1111',
  organization_id: 'org_1',
  original_filename: 'invoice-acme-oct.pdf',
  content_type: 'application/pdf',
  document_type: 'invoice',
  file_hash: 'abcdef0123456789abcdef0123456789',
  file_size: 20480,
  page_count: 1,
  processing_status: 'completed',
  created_at: '2026-10-05T10:00:00Z',
}

const DOC_B = {
  id: 'doc-b-2222',
  organization_id: 'org_1',
  original_filename: 'statement-sep.pdf',
  content_type: 'application/pdf',
  document_type: 'statement',
  file_hash: 'ffffffffffffffffffffffffffffffff',
  file_size: 51200,
  page_count: 3,
  processing_status: 'pending',
  created_at: '2026-10-04T09:00:00Z',
}

function detailFor(id: string) {
  if (id === DOC_A.id) {
    return {
      ...DOC_A,
      pages: [
        {
          page_number: 1,
          content: 'ACME SUPPLIES\nInvoice INV-104\nTotal 12,000.00',
          char_count: 42,
        },
      ],
    }
  }
  if (id === DOC_B.id) {
    return { ...DOC_B, pages: [] }
  }
  // Documents created through the mocked upload endpoint.
  return {
    id,
    organization_id: 'org_1',
    original_filename: 'uploaded.pdf',
    content_type: 'application/pdf',
    document_type: 'invoice',
    file_hash: null,
    file_size: 1024,
    page_count: 2,
    processing_status: 'completed',
    created_at: '2026-10-15T10:00:00Z',
    pages: [
      { page_number: 1, content: 'Uploaded page text', char_count: 18 },
    ],
  }
}

function statusFor(id: string, indexed: boolean) {
  return {
    document_id: id,
    processing_status: id === DOC_B.id ? 'pending' : 'completed',
    indexing_status: indexed ? 'indexed' : 'not_indexed',
    indexed,
    chunk_count: indexed ? 7 : 0,
    page_count: id === DOC_B.id ? 3 : id === DOC_A.id ? 1 : 2,
  }
}

interface MockOptions {
  items?: Array<typeof DOC_A>
  total?: number
  listStatus?: number
  uploadResponse?: { status: number; body: unknown }
  indexStatus?: number
  indexedInitially?: boolean
}

interface MockState {
  uploadCalls: number
  indexCalls: number
  indexed: boolean
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = {
    uploadCalls: 0,
    indexCalls: 0,
    indexed: options.indexedInitially ?? false,
  }
  const items = options.items ?? [DOC_A, DOC_B]
  const total = options.total ?? items.length

  await page.route('**/api/v1/documents**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path.endsWith('/documents/upload')) {
      state.uploadCalls += 1
      const response = options.uploadResponse ?? {
        status: 200,
        body: {
          document_id: 'doc-new',
          invoice_id: 'inv-9',
          page_count: 2,
          filename: 'new-invoice.pdf',
          status: 'processed',
        },
      }
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      })
      return
    }

    if (/\/documents\/[^/]+\/status$/.test(path)) {
      const id = path.split('/').slice(-2)[0]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(statusFor(id, state.indexed)),
      })
      return
    }

    if (/\/documents\/[^/]+$/.test(path)) {
      const id = path.split('/').pop() as string
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(id)),
      })
      return
    }

    if (path.endsWith('/documents')) {
      if (options.listStatus && options.listStatus !== 200) {
        await route.fulfill({
          status: options.listStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Document service unavailable' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total, skip: 0, limit: 50, items }),
      })
      return
    }

    await route.fulfill({ status: 404, body: 'Not found' })
  })

  await page.route('**/api/v1/knowledge/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/knowledge/index/')) {
      state.indexCalls += 1
      if (options.indexStatus && options.indexStatus !== 200) {
        await route.fulfill({
          status: options.indexStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Failed to index document' }),
        })
        return
      }
      state.indexed = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ document_id: DOC_A.id, chunks_indexed: 7 }),
      })
      return
    }
    await route.fulfill({ status: 404, body: 'Not found' })
  })

  return state
}

test('lists organization documents and prompts for a selection', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/documents')

  await expect(
    page.getByRole('heading', { name: 'Document center' }),
  ).toBeVisible()

  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('invoice-acme-oct.pdf')).toBeVisible()
  await expect(page.getByText('statement-sep.pdf')).toBeVisible()

  const body = page.locator('tbody')
  await expect(body.getByText('Processed')).toBeVisible()
  await expect(body.getByText('Pending')).toBeVisible()
  await expect(body.getByText('Invoice', { exact: true })).toBeVisible()

  await expect(page.getByText('Select a document')).toBeVisible()
})

test('shows stored metadata, source pages and indexing status', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/documents')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await expect(inspector.getByText('invoice-acme-oct.pdf')).toBeVisible()
  await expect(inspector.getByText('File size')).toBeVisible()
  await expect(inspector.getByText('20.0 KB')).toBeVisible()
  await expect(inspector.getByText('File hash')).toBeVisible()

  await expect(inspector.getByText('Source pages')).toBeVisible()
  await expect(inspector.getByText('Page 1')).toBeVisible()
  await expect(inspector.getByText(/ACME SUPPLIES/)).toBeVisible()

  await expect(
    inspector.getByText('Not indexed', { exact: true }).first(),
  ).toBeVisible()
  await expect(inspector.getByText('Chunks stored')).toBeVisible()
  await expect(
    inspector.getByRole('button', { name: 'Index document' }),
  ).toBeVisible()
})

test('indexing a document calls the API and reflects real status', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/documents')
  await page.locator('tbody tr').first().click()

  const inspector = page.locator('aside')
  await inspector.getByRole('button', { name: 'Index document' }).click()

  await expect(inspector.getByText('Indexed 7 chunk(s).')).toBeVisible()
  await expect(
    inspector.getByText('Indexed', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    inspector.getByRole('button', { name: 'Re-index document' }),
  ).toBeVisible()
  expect(state.indexCalls).toBe(1)
})

test('uploads a PDF and reports success', async ({ page }) => {
  await installMocks(page)
  await page.goto('/documents')

  await page.getByLabel('Invoice PDF file').setInputFiles({
    name: 'new-invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 synthetic test content'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  await expect(
    page.getByText('Stored new-invoice.pdf', { exact: false }),
  ).toBeVisible()
  await expect(page.getByText('invoice record created')).toBeVisible()
})

test('rejects non-PDF selection before any request', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/documents')

  await page.getByLabel('Invoice PDF file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  await expect(page.getByText('Only PDF documents are supported.')).toBeVisible()
  expect(state.uploadCalls).toBe(0)
})

test('surfaces backend upload validation errors', async ({ page }) => {
  await installMocks(page, {
    uploadResponse: {
      status: 422,
      body: {
        detail:
          'No extractable text found; scanned/image-only PDFs are not supported (OCR is not implemented)',
      },
    },
  })
  await page.goto('/documents')

  await page.getByLabel('Invoice PDF file').setInputFiles({
    name: 'scan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 image only'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  await expect(
    page.getByText('No extractable text found', { exact: false }),
  ).toBeVisible()
})

test('shows the empty state when there are no documents', async ({ page }) => {
  await installMocks(page, { items: [], total: 0 })
  await page.goto('/documents')

  await expect(page.getByText('No documents yet')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('shows an error state with retry when listing fails', async ({ page }) => {
  await installMocks(page, { listStatus: 500 })
  await page.goto('/documents')

  await expect(page.getByText('Could not load documents')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('narrow layout keeps page width on the document center', async ({
  page,
}) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/documents')
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
