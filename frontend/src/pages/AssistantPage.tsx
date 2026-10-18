import { useEffect, useRef, useState } from 'react'

import { AssistantWelcome } from '../components/chat/AssistantWelcome'
import { ConversationList } from '../components/chat/ConversationList'
import { ConversationThread } from '../components/chat/ConversationThread'
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
} from '../hooks/useChat'

// The assistant workspace. It is deliberately separate from the application
// rail: a compact, collapsible conversation-history panel sits beside (or above,
// on narrow screens) the active transcript. Creating a conversation, selecting
// one, deleting one and applying a suggested prompt are all handled here; the
// transcript and composer live in ConversationThread.
export function AssistantPage() {
  const conversations = useConversations()
  const createConversation = useCreateConversation()
  const deleteConversation = useDeleteConversation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [draftKey, setDraftKey] = useState<number | undefined>(undefined)
  const [historyOpen, setHistoryOpen] = useState(true)

  const items = conversations.data?.items ?? []
  const hasAutoSelected = useRef(false)

  // Land on the most recent conversation once, when the list first arrives; the
  // user's later choices (including an empty selection after deleting) win.
  useEffect(() => {
    if (!hasAutoSelected.current && activeId === null && items.length > 0) {
      hasAutoSelected.current = true
      setActiveId(items[0].id)
    }
  }, [activeId, items])

  function startNewConversation() {
    createConversation.mutate(
      {},
      { onSuccess: (conversation) => setActiveId(conversation.id) },
    )
  }

  function handleStartFromExample(prompt: string) {
    createConversation.mutate(
      { title: prompt.slice(0, 60) },
      {
        onSuccess: (conversation) => {
          setActiveId(conversation.id)
          setDraft(prompt)
          setDraftKey((current) => (current ?? 0) + 1)
        },
      },
    )
  }

  function handleDelete(conversationId: string) {
    deleteConversation.mutate(conversationId, {
      onSuccess: () => {
        if (conversationId === activeId) setActiveId(null)
      },
    })
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-label="Toggle conversations"
          aria-expanded={historyOpen}
          className="inline-flex shrink-0 items-center rounded-sm border border-line-strong px-2 py-1 text-2xs text-graphite transition-colors hover:bg-accent-soft hover:text-accent"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-base text-ink">Assistant</h1>
          <p className="hidden truncate text-2xs text-muted sm:block">
            Evidence-grounded answers over your documents and records
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {historyOpen ? (
          <aside className="flex max-h-[45%] shrink-0 flex-col border-b border-line bg-surface lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
            <ConversationList
              conversations={items}
              activeId={activeId}
              isLoading={conversations.isLoading}
              isError={conversations.isError}
              isCreating={createConversation.isPending}
              onSelect={(id) => setActiveId(id)}
              onNew={startNewConversation}
              onDelete={handleDelete}
            />
          </aside>
        ) : null}

        {activeId ? (
          <ConversationThread
            key={activeId}
            conversationId={activeId}
            draft={draft}
            draftKey={draftKey}
          />
        ) : (
          <AssistantWelcome
            onExample={handleStartFromExample}
            disabled={createConversation.isPending}
          />
        )}
      </div>
    </div>
  )
}
