import { expect, test, type Page, type Route } from '@playwright/test'

// Synthetic assistant data only. Every /api request is intercepted in the
// browser; no backend, database or model is contacted. The mock keeps an
// in-memory conversation store so the full lifecycle (create, load, send,
// delete) behaves coherently.

interface MockMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  outcome: string | null
  tool_calls: unknown[]
  citations: unknown[]
  result_refs: unknown[]
  created_at: string
}

interface MockConversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  messages: MockMessage[]
}

interface MockDocument {
  id: string
  original_filename: string
  processing_status: string
  document_type: string
}

const ANSWERED_ASSISTANT: MockMessage = {
  id: 'msg-assistant-1',
  role: 'assistant',
  content: 'The vendor agreement states **net 30** payment terms [1].',
  outcome: 'answered',
  tool_calls: [
    {
      name: 'search_documents',
      label: 'Search documents',
      status: 'ok',
      summary: 'Searched vendor-agreement.pdf',
      duration_ms: 42,
    },
  ],
  citations: [
    {
      index: 1,
      document_id: 'doc-1',
      filename: 'vendor-agreement.pdf',
      page_number: 2,
      chunk_id: 'chunk-1',
      score: 0.83,
    },
  ],
  result_refs: [
    {
      kind: 'document',
      id: 'doc-1',
      label: 'vendor-agreement.pdf',
      href: '/documents',
      status: null,
    },
  ],
  created_at: '2026-10-17T10:00:05Z',
}

interface MockState {
  conversations: MockConversation[]
  messageBodies: unknown[]
  createBodies: unknown[]
  nextAssistant: MockMessage
  messageStatus: number
  counter: number
  documents: MockDocument[]
}

interface MockOptions {
  seed?: MockConversation[]
  nextAssistant?: MockMessage
  messageStatus?: number
  messageDelayMs?: number
  documents?: MockDocument[]
  failUploads?: string[]
}

function uploadedFilename(route: Route): string {
  const buffer = route.request().postDataBuffer()
  if (!buffer) return ''
  const match = /filename="([^"]*)"/.exec(buffer.toString('latin1'))
  return match ? match[1] : ''
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const state: MockState = {
    conversations: options.seed ?? [],
    messageBodies: [],
    createBodies: [],
    nextAssistant: options.nextAssistant ?? ANSWERED_ASSISTANT,
    messageStatus: options.messageStatus ?? 200,
    counter: 0,
    documents: [...(options.documents ?? [])],
  }

  let uploadSeq = 0

  await page.route(/\/api\/v1\/chat\/conversations\/[^/]+\/messages$/, async (route) => {
    const body = route.request().postDataJSON() as { content: string }
    state.messageBodies.push(body)
    if (options.messageDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.messageDelayMs))
    }
    if (state.messageStatus !== 200) {
      await json(route, state.messageStatus, { detail: 'Assistant unavailable' })
      return
    }
    const match = /conversations\/([^/]+)\/messages$/.exec(route.request().url())
    const conversationId = match ? match[1] : 'unknown'
    const conversation = state.conversations.find((c) => c.id === conversationId)
    state.counter += 1
    const userMessage: MockMessage = {
      id: `msg-user-${state.counter}`,
      role: 'user',
      content: body.content,
      outcome: null,
      tool_calls: [],
      citations: [],
      result_refs: [],
      created_at: '2026-10-17T10:00:00Z',
    }
    const assistantMessage: MockMessage = {
      ...state.nextAssistant,
      id: `msg-assistant-${state.counter}`,
      created_at: '2026-10-17T10:00:01Z',
    }
    if (conversation) {
      conversation.messages.push(userMessage, assistantMessage)
      conversation.updated_at = '2026-10-17T10:00:01Z'
    }
    await json(route, 200, {
      conversation_id: conversationId,
      user_message: userMessage,
      assistant_message: assistantMessage,
    })
  })

  await page.route(/\/api\/v1\/chat\/conversations\/[^/]+$/, async (route) => {
    const method = route.request().method()
    const match = /conversations\/([^/]+)$/.exec(route.request().url())
    const conversationId = match ? match[1] : ''
    if (method === 'DELETE') {
      state.conversations = state.conversations.filter(
        (c) => c.id !== conversationId,
      )
      await route.fulfill({ status: 204, body: '' })
      return
    }
    const conversation = state.conversations.find((c) => c.id === conversationId)
    if (!conversation) {
      await json(route, 404, { detail: 'Conversation not found' })
      return
    }
    await json(route, 200, {
      id: conversation.id,
      organization_id: 'org_1',
      title: conversation.title,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      messages: conversation.messages,
    })
  })

  await page.route(/\/api\/v1\/chat\/conversations(\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      state.createBodies.push(route.request().postDataJSON())
      state.counter += 1
      const created: MockConversation = {
        id: `conv-${state.counter}`,
        title: null,
        created_at: '2026-10-17T09:00:00Z',
        updated_at: '2026-10-17T09:00:00Z',
        messages: [],
      }
      state.conversations.unshift(created)
      await json(route, 200, {
        id: created.id,
        title: created.title,
        message_count: 0,
        created_at: created.created_at,
        updated_at: created.updated_at,
      })
      return
    }
    await json(route, 200, {
      total: state.conversations.length,
      items: state.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        message_count: c.messages.length,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    })
  })

  await page.route(/\/api\/v1\/documents(\?.*)?$/, async (route) => {
    await json(route, 200, {
      total: state.documents.length,
      skip: 0,
      limit: 50,
      items: state.documents,
    })
  })

  await page.route(/\/api\/v1\/documents\/upload$/, async (route) => {
    const filename = uploadedFilename(route)
    if ((options.failUploads ?? []).includes(filename)) {
      await json(route, 500, { detail: 'Upload rejected' })
      return
    }
    uploadSeq += 1
    const documentId = `doc-upload-${uploadSeq}`
    state.documents.push({
      id: documentId,
      original_filename: filename || 'upload.pdf',
      processing_status: 'completed',
      document_type: 'policy',
    })
    await json(route, 200, {
      document_id: documentId,
      invoice_id: null,
      page_count: 1,
      filename: filename || 'upload.pdf',
      status: 'completed',
    })
  })

  await page.route(/\/api\/v1\/knowledge\/index\/[^/]+$/, async (route) => {
    await json(route, 200, { document_id: 'indexed', chunks_indexed: 1 })
  })

  return state
}

function seededConversation(): MockConversation {
  return {
    id: 'conv-seeded',
    title: 'Existing conversation',
    created_at: '2026-10-16T09:00:00Z',
    updated_at: '2026-10-16T09:00:00Z',
    messages: [
      {
        id: 'seed-user',
        role: 'user',
        content: 'What are the payment terms?',
        outcome: null,
        tool_calls: [],
        citations: [],
        result_refs: [],
        created_at: '2026-10-16T09:00:00Z',
      },
      ANSWERED_ASSISTANT,
    ],
  }
}

test('welcome state shows the capability cards when no conversations exist', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/assistant')

  await expect(
    page.getByRole('heading', { name: 'Assistant' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Ask across your documents and records' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Document Q&A' }),
  ).toBeVisible()
  await expect(
    page.getByText('No conversations yet', { exact: false }),
  ).toBeVisible()
})

test('starting a new conversation enables the composer', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()

  await expect(page.getByPlaceholder(/Ask about a document/)).toBeEnabled()
  expect(state.createBodies).toHaveLength(1)
})

test('a capability card creates a conversation and prefills the prompt', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'Explain a discrepancy' }).click()

  await expect(page.getByPlaceholder(/Ask about a document/)).toHaveValue(
    'Why was invoice INV-2026-0001 underpaid?',
  )
  expect(state.createBodies).toHaveLength(1)
  expect(state.createBodies[0]).toEqual({
    title: 'Why was invoice INV-2026-0001 underpaid?',
  })
})

test('sending a message shows the answer, provenance and tool activity', async ({
  page,
}) => {
  const state = await installMocks(page)
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await composer.fill('What are the payment terms?')
  await page.getByRole('button', { name: 'Send' }).click()

  // The answer text and outcome pill render.
  await expect(page.getByText(/net 30/)).toBeVisible()
  await expect(page.getByText('Answered')).toBeVisible()

  // Citations name the document and page; the result ref links to the record.
  await expect(page.getByText('vendor-agreement.pdf').first()).toBeVisible()
  await expect(page.getByText('page 2')).toBeVisible()
  await expect(page.getByRole('link', { name: /Document vendor-agreement/ })).toBeVisible()

  // The tool trace summary is honest about what ran.
  await expect(page.getByText('1 step')).toBeVisible()
  await page.getByText('Activity').click()
  await expect(page.getByText('Search documents')).toBeVisible()
  await expect(page.getByText('Ran', { exact: true })).toBeVisible()

  // The message was actually sent with the typed content.
  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({ content: 'What are the payment terms?' })

  // On success the composer is cleared for the next turn.
  await expect(composer).toHaveValue('')
})

test('renders an insufficient-evidence outcome without inventing citations', async ({
  page,
}) => {
  await installMocks(page, {
    nextAssistant: {
      ...ANSWERED_ASSISTANT,
      content:
        'The available documents do not state the vendor phone number.',
      outcome: 'insufficient_evidence',
      tool_calls: [
        {
          name: 'search_documents',
          label: 'Search documents',
          status: 'empty',
          summary: 'No passages above the evidence threshold',
          duration_ms: 31,
        },
      ],
      citations: [],
      result_refs: [],
    },
  })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()
  await composer.fill('What is the vendor phone number?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Insufficient evidence')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Citations' })).toHaveCount(0)
  await expect(page.getByText('vendor-agreement.pdf')).toHaveCount(0)
})

test('a failed send surfaces an error and rolls back the optimistic message', async ({
  page,
}) => {
  await installMocks(page, { messageStatus: 500 })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()
  await composer.fill('Will this fail?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText(/could not be completed/)).toBeVisible()
  // The optimistic user message is removed (empty transcript), and the text is
  // preserved in the composer so the user can retry without retyping.
  await expect(
    page.getByText('This conversation is empty. Ask a question below to get started.'),
  ).toBeVisible()
  await expect(composer).toHaveValue('Will this fail?')
})

test('loads a seeded conversation and shows its transcript', async ({ page }) => {
  await installMocks(page, { seed: [seededConversation()] })
  await page.goto('/assistant')

  await expect(page.getByText('What are the payment terms?')).toBeVisible()
  await expect(page.getByText(/net 30/)).toBeVisible()
})

test('deleting a conversation requires an inline confirmation', async ({ page }) => {
  await installMocks(page, { seed: [seededConversation()] })
  await page.goto('/assistant')

  await expect(
    page.getByRole('button', { name: 'Delete Existing conversation' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Delete Existing conversation' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Ask across your documents and records' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Delete Existing conversation' }),
  ).toHaveCount(0)
})

test('the workspace rail links to the Assistant, which opens standalone', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/dashboard')

  // Ordinary workspace routes keep the application navigation.
  const link = page.getByRole('link', { name: 'Assistant' })
  await expect(link).toBeVisible()
  await link.click()

  await expect(page).toHaveURL(/\/assistant$/)
  // The assistant is a standalone workspace: the application rail is gone and
  // the conversation history lives in its own panel.
  await expect(page.locator('nav')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Assistant' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New conversation' }),
  ).toBeVisible()
})

test('the conversation history panel collapses and reopens', async ({ page }) => {
  await installMocks(page, { seed: [seededConversation()] })
  await page.goto('/assistant')

  const toggle = page.getByRole('button', { name: 'Toggle conversations' })
  await expect(
    page.getByRole('button', { name: 'New conversation' }),
  ).toBeVisible()

  await toggle.click()
  await expect(
    page.getByRole('button', { name: 'New conversation' }),
  ).toHaveCount(0)

  await toggle.click()
  await expect(
    page.getByRole('button', { name: 'New conversation' }),
  ).toBeVisible()
})

test('the attach picker reports when no documents are available', async ({ page }) => {
  await installMocks(page, { seed: [seededConversation()] })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'Attach files' }).click()
  await page.getByRole('menuitem', { name: /Attach existing documents/ }).click()
  await expect(
    page.getByText('No documents are available to attach.'),
  ).toBeVisible()
})

test('the single attach button offers upload and existing-document options', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/assistant')
  await page.getByRole('button', { name: 'New conversation' }).click()

  await page.getByRole('button', { name: 'Attach files' }).click()
  const menu = page.getByRole('menu', { name: 'Attachment options' })
  await expect(menu).toBeVisible()
  await expect(
    menu.getByRole('menuitem', { name: /Upload new PDFs/ }),
  ).toBeVisible()
  await expect(
    menu.getByRole('menuitem', { name: /Attach existing documents/ }),
  ).toBeVisible()
})

test('choosing Upload new PDFs opens the multi-file picker', async ({ page }) => {
  await installMocks(page)
  await page.goto('/assistant')
  await page.getByRole('button', { name: 'New conversation' }).click()

  await page.getByRole('button', { name: 'Attach files' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: /Upload new PDFs/ }).click()
  const fileChooser = await chooser
  expect(fileChooser.isMultiple()).toBe(true)
})

test('the command menu stays hidden until the user types a slash', async ({
  page,
}) => {
  await installMocks(page)
  await page.goto('/assistant')
  await page.getByRole('button', { name: 'New conversation' }).click()

  await expect(
    page.getByRole('listbox', { name: 'Slash commands' }),
  ).toHaveCount(0)

  await page.getByPlaceholder(/Ask about a document/).fill('/doc')
  await expect(
    page.getByRole('listbox', { name: 'Slash commands' }),
  ).toBeVisible()
})

test('a slash command executes its real backend operation', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await composer.fill('/dash')
  await expect(
    page.getByRole('listbox', { name: 'Slash commands' }),
  ).toBeVisible()
  await page.getByRole('option', { name: /\/dashboard/ }).click()

  // Choosing the command sends its canonical prompt so the orchestrator runs
  // the real operation rather than the client pretending to.
  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({
    content: 'Show the workspace summary.',
  })
})

test('uploading a PDF attaches it to the next turn', async ({ page }) => {
  const state = await installMocks(page)
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'vendor-policy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 synthetic'),
  })

  await expect(page.getByText('Ready')).toBeVisible()

  await composer.fill('What are the payment terms?')
  await page.getByRole('button', { name: 'Send' }).click()

  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({
    content: 'What are the payment terms?',
    attachment_document_ids: ['doc-upload-1'],
  })
})

test('a failed upload is reported honestly and never attached', async ({ page }) => {
  const state = await installMocks(page, { failUploads: ['broken.pdf'] })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  })

  await expect(page.getByText('Failed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

  await composer.fill('What is the status?')
  await page.getByRole('button', { name: 'Send' }).click()

  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({ content: 'What is the status?' })
})

test('a partial upload failure keeps the successful file', async ({ page }) => {
  const state = await installMocks(page, { failUploads: ['bad.pdf'] })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'good.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF good'),
    },
    {
      name: 'bad.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF bad'),
    },
  ])

  await expect(page.getByText('Ready')).toBeVisible()
  await expect(page.getByText('Failed')).toBeVisible()

  await composer.fill('Compare these documents')
  await page.getByRole('button', { name: 'Send' }).click()

  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({
    content: 'Compare these documents',
    attachment_document_ids: ['doc-upload-1'],
  })
})

test('attaching an existing document sends its id', async ({ page }) => {
  const state = await installMocks(page, {
    documents: [
      {
        id: 'doc-existing-1',
        original_filename: 'vendor-agreement.pdf',
        processing_status: 'completed',
        document_type: 'policy',
      },
    ],
  })
  await page.goto('/assistant')

  await page.getByRole('button', { name: 'New conversation' }).click()
  const composer = page.getByPlaceholder(/Ask about a document/)
  await expect(composer).toBeEnabled()

  await page.getByRole('button', { name: 'Attach files' }).click()
  await page.getByRole('menuitem', { name: /Attach existing documents/ }).click()
  await page.getByRole('checkbox').check()

  await composer.fill('Compare the payment terms across these policies.')
  await page.getByRole('button', { name: 'Send' }).click()

  expect(state.messageBodies).toHaveLength(1)
  expect(state.messageBodies[0]).toEqual({
    content: 'Compare the payment terms across these policies.',
    attachment_document_ids: ['doc-existing-1'],
  })
})
