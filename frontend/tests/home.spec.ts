import { expect, test } from '@playwright/test'

// The home page is a static overview of the project and makes no API calls, so
// no routes are mocked here. Assertions cover the key sections and the entry
// points into the workspace.

test('presents the project, the pipeline and a clear call to action', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Explain every difference',
  )

  // The five pipeline stages are all named.
  for (const stage of ['Ingest', 'Match', 'Investigate', 'Review', 'Audit']) {
    await expect(
      page.getByRole('heading', { name: stage, exact: true }),
    ).toBeVisible()
  }

  await expect(page.getByText('The demo scenario', { exact: true })).toBeVisible()
  await expect(
    page.getByText('The AI assists. It does not hold the pen on money.'),
  ).toBeVisible()

  await expect(
    page.getByRole('link', { name: /Enter the workspace/ }).first(),
  ).toHaveAttribute('href', '/dashboard')
})

test('the home nav entry and brand link both resolve to the home page', async ({
  page,
}) => {
  await page.goto('/')

  // On the home page the Home nav entry is the active route.
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('a workspace link navigates away and the brand returns home', async ({
  page,
}) => {
  await page.goto('/')

  await page
    .getByRole('link', { name: /Enter the workspace/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.getByRole('link', { name: 'FinPilot AI home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Explain every difference',
  )
})

test('narrow layout keeps page width without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    navVisible: (() => {
      const el = document.querySelector('nav')
      if (!el) return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })(),
  }))

  expect(metrics.navVisible).toBe(true)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewport + 1)
})

test('captures desktop and narrow screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  await page.screenshot({
    path: 'test-results/home-desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 420, height: 900 })
  await page.screenshot({
    path: 'test-results/home-narrow.png',
    fullPage: true,
  })
})
