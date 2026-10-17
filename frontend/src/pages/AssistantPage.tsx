import { useEffect, useRef, useState } from 'react'

import { AssistantWelcome } from '../components/chat/AssistantWelcome'
import { ConversationList } from '../components/chat/ConversationList'
import { ConversationThread } from '../components/chat/ConversationThread'
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
} from '../hooks/useChat'

// The assistant workspace: a conversation rail on the left and the active
// transcript on the right. Creating a conversation, selecting one, deleting one
// and applying a suggested prompt are all handled here; the transcript itself
// lives in ConversationThread.
export function AssistantPage() {
  const conversations = useConversations()
  const createConversation = useCreateConversation()
  const deleteConversation = useDeleteConversation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [draftKey, setDraftKey] = useState<number | undefined>(undefined)

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
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-6 py-3">
        <div className="min-w-0">
          <h1 className="font-serif text-base text-ink">Assistant</h1>
          <p className="text-2xs text-muted">
            Evidence-grounded answers over your documents and records
          </p>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          {items.length > 0 ? (
            <select
              value={activeId ?? ''}
              onChange={(event) => setActiveId(event.target.value || null)}
              className="max-w-[10rem] rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink"
            >
              <option value="">Select conversation</option>
              {items.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title ?? 'Untitled conversation'}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => createConversation.mutate({}, {
              onSuccess: (conversation) => setActiveId(conversation.id),
            })}
            disabled={createConversation.isPending}
            className="rounded-sm border border-accent bg-accent px-2 py-1 text-2xs font-semibold uppercase tracking-label text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            New
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-surface p-4 lg:flex lg:flex-col">
          <ConversationList
            conversations={items}
            activeId={activeId}
            isLoading={conversations.isLoading}
            isError={conversations.isError}
            isCreating={createConversation.isPending}
            onSelect={(id) => setActiveId(id)}
            onNew={() =>
              createConversation.mutate({}, {
                onSuccess: (conversation) => setActiveId(conversation.id),
              })
            }
            onDelete={handleDelete}
          />
        </aside>

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
