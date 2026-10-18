import { expect, test, type Page } from '@playwright/test'

// Synthetic knowledge answers only. Every /api request is intercepted in the
// browser; no backend, database or model is contacted.

const ANSWERED = {
  query: 'What payment terms are stated on the invoice?',
  status: 'answered',
  answer: 'The invoice states payment terms of net 30 days [1].',
  citations: [
    {
      index: 1,
      document_id: 'doc-1',
      filename: 'INV-104.pdf',
      page_number: 2,
      chunk_id: 'chunk-1',
      score: 0.812,
    },
  ],
  evidence: [
    {
      chunk_id: 'chunk-1',
      document_id: 'doc-1',
      filename: 'INV-104.pdf',
      document_type: 'invoice',
      page_number: 2,
      content: 'Payment terms: net 30 days from invoice date.',
      score: 0.812,
    },
  ],
}

const INSUFFICIENT = {
  query: 'What is the vendor phone number?',
  status: 'insufficient_evidence',
  answer: 'Insufficient evidence in the uploaded documents to answer this question.',
  citations: [],
  evidence: [],
}

const INSUFFICIENT_WITH_EVIDENCE = {
  ...INSUFFICIENT,
  query: 'What is the vendor phone number?',
  evidence: [
    {
      chunk_id: 'chunk-9',
      document_id: 'doc-2',
      filename: 'statement.pdf',
      document_type: 'bank_statement',
      page_number: null,
      content: 'Account summary for the period.',
      score: 0.21,
    },
  ],
}

interface MockState {
  bodies: unknown[]
}

interface MockOptions {
  response?: unknown
  status?: number
  delayMs?: number
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = { bodies: [] }

  await page.route('**/api/v1/knowledge/ask', async (route) => {
    state.bodies.push(route.request().postDataJSON())
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }
    if (options.status && options.status !== 200) {
      await route.fulfill({
        status: options.status,
        contentType: 'application/json',
        body: JSON.stringify({
          detail:
            options.status === 503
              ? 'Answer generation is unavailable (LLM not configured)'
              : 'Knowledge service unavailable',
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.response ?? ANSWERED),
    })
  })

  return state
}

async function ask(page: Page, question: string) {
  await page.getByLabel('Question').fill(question)
  await page.getByRole('button', { name: 'Ask' }).click()
}

test('submits a question and shows the grounded answer with its citations', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/knowledge')

  await expect(
    page.getByRole('heading', { name: 'Knowledge & Ask' }),
  ).toBeVisible()

  await ask(page, ANSWERED.query)

  // The answer text is shown.
  await expect(page.getByText(/payment terms of net 30/i)).toBeVisible()

  // The citation names the document and the page.
  await expect(page.getByText('INV-104.pdf').first()).toBeVisible()
  await expect(page.getByText('page 2').first()).toBeVisible()

  // The retrieved source passage is shown as evidence.
  await expect(
    page.getByText(/Payment terms: net 30 days from invoice date\./),
  ).toBeVisible()

  // The question was actually sent to the backend endpoint.
  expect(state.bodies).toHaveLength(1)
  expect(state.bodies[0]).toEqual({ query: ANSWERED.query })
})

test('shows a loading state while an answer is in flight', async ({ page }) => {
  await installMocks(page, { delayMs: 1500 })
  await page.goto('/knowledge')

  await ask(page, ANSWERED.query)

  await expect(page.getByRole('button', { name: 'Asking…' })).toBeVisible()
})

test('presents an insufficient-evidence result honestly, without citations', async ({
  page,
}) => {
  await installMocks(page, { response: INSUFFICIENT })
  await page.goto('/knowledge')

  await ask(page, INSUFFICIENT.query)

  await expect(
    page.getByText(
      'Insufficient evidence in the uploaded documents to answer this question.',
    ),
  ).toBeVisible()

  // No citations were invented.
  await expect(page.getByRole('heading', { name: 'Citations' })).toHaveCount(0)
  await expect(page.getByText('INV-104.pdf')).toHaveCount(0)
})

test('lists retrieved passages but no answer when evidence is below threshold', async ({
  page,
}) => {
  await installMocks(page, { response: INSUFFICIENT_WITH_EVIDENCE })
  await page.goto('/knowledge')

  await ask(page, INSUFFICIENT_WITH_EVIDENCE.query)

  await expect(page.getByText('Retrieved passages')).toBeVisible()
  await expect(page.getByText('statement.pdf')).toBeVisible()
  await expect(
    page.getByText(/were not sufficient to answer the question/i),
  ).toBeVisible()
})

test('reports when answer generation is unavailable (no model configured)', async ({
  page,
}) => {
  await installMocks(page, { status: 503 })
  await page.goto('/knowledge')

  await ask(page, ANSWERED.query)

  await expect(page.getByText('Answer generation is unavailable')).toBeVisible()
  await expect(
    page.getByText(/No language model is configured/i),
  ).toBeVisible()
})

test('shows an error state when the request fails', async ({ page }) => {
  await installMocks(page, { status: 500 })
  await page.goto('/knowledge')

  await ask(page, ANSWERED.query)

  await expect(page.getByRole('alert')).toContainText(
    'Knowledge service unavailable',
  )
})

test('requires a non-empty question', async ({ page }) => {
  await installMocks(page)
  await page.goto('/knowledge')

  await page.getByRole('button', { name: 'Ask' }).click()

  await expect(page.getByText('Enter a question before asking.')).toBeVisible()
})

test('Knowledge & Ask is no longer a primary navigation item but the route stays reachable', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/dashboard')

  // The duplicate primary navigation entry was removed in favour of the
  // Assistant workspace.
  await expect(
    page.getByRole('link', { name: 'Knowledge & Ask' }),
  ).toHaveCount(0)

  // Direct navigation to the legacy route remains safe and offers a migration
  // link into the Assistant.
  await page.goto('/knowledge')
  await expect(
    page.getByRole('heading', { name: 'Knowledge & Ask' }),
  ).toBeVisible()
  await expect(
    page.getByText(/Document Q&A now lives in the/),
  ).toBeVisible()
})

test('narrow layout keeps the page within the viewport', async ({ page }) => {
  await installMocks(page)
  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/knowledge')

  await expect(
    page.getByRole('heading', { name: 'Knowledge & Ask' }),
  ).toBeVisible()

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(scrollWidth).toBeLessThanOrEqual(421)
})
