import { expect, test, type Page } from '@playwright/test'

// The home page reads real data from the dashboard summary and health endpoints
// and reuses the shared components. Every /api request is intercepted in the
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

const HEALTH = { status: 'ok', service: 'finpilot-ai-api' }

interface MockOptions {
  summary?: unknown
  summaryStatus?: number
  delayMs?: number
}

async function mockBackend(page: Page, options: MockOptions = {}) {
  await page.route('**/api/v1/dashboard/summary', async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }
    if (options.summaryStatus && options.summaryStatus !== 200) {
      await route.fulfill({
        status: options.summaryStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Dashboard service unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.summary ?? SUMMARY),
    })
  })

  await page.route('**/api/v1/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HEALTH),
    })
  })
}

test('the document grows and its background covers the full content area', async ({
  page,
}) => {
  await mockBackend(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1 }),
  ).toBeVisible()

  const geom = await page.evaluate(() => {
    const main = document.querySelector('main')
    const mainStyle = main ? getComputedStyle(main) : null
    return {
      viewport: window.innerHeight,
      viewportWidth: window.innerWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      mainBg: mainStyle?.backgroundColor ?? null,
      mainOverflowY: mainStyle?.overflowY ?? null,
    }
  })

  // The document is the scroll container: it grows past the viewport instead of
  // being pinned to a fixed height with a nested scroller.
  expect(geom.docScrollHeight).toBeGreaterThan(geom.viewport)
  expect(geom.mainOverflowY).not.toBe('auto')
  expect(geom.mainOverflowY).not.toBe('scroll')

  // Both the page and the content column paint a background, so the content
  // area is never left uncovered.
  expect(geom.bodyBg).not.toBe('rgba(0, 0, 0, 0)')
  expect(geom.mainBg).not.toBe('rgba(0, 0, 0, 0)')

  // No horizontal overflow.
  expect(geom.docScrollWidth).toBeLessThanOrEqual(geom.viewportWidth + 1)
})

test('hero states the promise and both actions navigate into the workspace', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Every discrepancy has evidence',
  )

  const enter = page.getByRole('link', { name: /Enter workspace/ })
  const explore = page.getByRole('link', { name: /Explore the demo/ })
  await expect(enter).toHaveAttribute('href', '/dashboard')
  await expect(explore).toHaveAttribute('href', '/reconciliation')

  await enter.click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goBack()
  await page.getByRole('link', { name: /Explore the demo/ }).click()
  await expect(page).toHaveURL(/\/reconciliation$/)
})

test('renders live operational metrics from the summary', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')

  const awaiting = page.getByRole('link', { name: /Awaiting review/ })
  await expect(awaiting).toContainText('4')
  await expect(awaiting).toHaveAttribute('href', '/reviews')

  const documents = page.getByRole('link', { name: /Documents indexed/ })
  await expect(documents).toContainText('17')
  await expect(documents).toContainText('3 pending · 20 total')

  await expect(
    page.getByRole('link', { name: /Reconciliations/ }),
  ).toContainText('30')

  // Real reconciliation breakdown from the same summary.
  await expect(page.getByText('Exact match', { exact: true })).toBeVisible()
  await expect(page.getByText(/Derived from persisted records/)).toBeVisible()
})

test('shows loading and error states instead of fabricated metrics', async ({
  page,
}) => {
  await mockBackend(page, { delayMs: 1500 })
  await page.goto('/')
  await expect(page.getByText('Loading live metrics')).toBeVisible()

  await mockBackend(page, { summaryStatus: 500 })
  await page.reload()
  await expect(page.getByText('Could not load live metrics')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('labels every provenance layer and keeps them distinct', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/')

  for (const label of ['DB FACT', 'DETERMINISTIC', 'EVIDENCE', 'AI', 'HUMAN']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }

  for (const stage of [
    'Deterministic reconciliation',
    'Document retrieval',
    'Agent investigation',
    'Human review',
  ]) {
    await expect(
      page.getByRole('heading', { name: stage, exact: true }),
    ).toBeVisible()
  }
})

test('the workflow is marked illustrative and shows no fabricated figures', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/')

  await expect(
    page.getByText('Illustrative workflow', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Not a real record', { exact: true }),
  ).toBeVisible()

  const body = page.locator('body')
  await expect(body).not.toContainText('₹')
  await expect(body).not.toContainText(/running now|live activity/i)
})

test('resets the scroll position when navigating away', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')

  await page.evaluate(() => window.scrollTo(0, 1600))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('link', { name: /Enter workspace/ }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(0)
})

test('keeps the layout within the viewport on desktop, tablet and mobile', async ({
  page,
}) => {
  await mockBackend(page)

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 834, height: 1000 },
    { width: 420, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )

    expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1)
  }
})

test('the home page shows no sidebar, while workspace routes keep it', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/')
  await expect(page.locator('nav')).toHaveCount(0)

  await page.goto('/dashboard')
  await expect(page.locator('nav')).toBeVisible()
})

test('captures a full-height desktop and narrow screenshot', async ({ page }) => {
  await mockBackend(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: /Awaiting review/ }),
  ).toBeVisible()

  const desktop = await page.screenshot({
    path: 'test-results/home-desktop.png',
    fullPage: true,
  })
  // PNG dimensions: width at byte 16, height at byte 20 (big-endian). The
  // full-page capture must exceed the viewport height now that the document
  // scrolls (the defect produced a fixed 900px capture).
  expect(desktop.readUInt32BE(20)).toBeGreaterThan(900)

  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/')
  await page.screenshot({
    path: 'test-results/home-narrow.png',
    fullPage: true,
  })
})
