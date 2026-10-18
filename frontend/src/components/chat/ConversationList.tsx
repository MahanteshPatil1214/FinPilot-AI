import { useState } from 'react'

import { formatDateTime } from '../../lib/format'
import type { ConversationSummary } from '../../types/api'

interface ConversationListProps {
  conversations: ConversationSummary[]
  activeId: string | null
  isLoading: boolean
  isError: boolean
  isCreating: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

// The conversation rail. A search box filters the history by title; selecting a
// row loads its transcript on the right. The delete affordance confirms inline
// before removing anything so a stray click cannot discard a transcript.
export function ConversationList({
  conversations,
  activeId,
  isLoading,
  isError,
  isCreating,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const term = query.trim().toLowerCase()
  const filtered = term
    ? conversations.filter((conversation) =>
        (conversation.title ?? 'Untitled conversation')
          .toLowerCase()
          .includes(term),
      )
    : conversations

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          disabled={isCreating}
          className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-semibold uppercase tracking-label text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isCreating ? 'Starting…' : 'New conversation'}
        </button>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search conversations"
          placeholder="Search conversations"
          disabled={conversations.length === 0}
          className="mt-3 w-full rounded-sm border border-line-strong bg-paper px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <p className="px-2 py-2 text-xs text-muted">Loading conversations…</p>
        ) : isError ? (
          <p className="px-2 py-2 text-xs text-status-risk">
            Conversations could not be loaded.
          </p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted">
            No conversations yet. Start one to ask about your documents and
            records.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted">
            No conversations match your search.
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((conversation) => {
              const active = conversation.id === activeId
              const confirming = pendingDelete === conversation.id
              return (
                <li key={conversation.id}>
                  <div
                    className={`group flex items-start gap-1 rounded-sm border px-2 py-1.5 transition-colors ${
                      active
                        ? 'border-accent/30 bg-accent-soft'
                        : 'border-transparent hover:bg-paper'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm text-ink">
                        {conversation.title ?? 'Untitled conversation'}
                      </span>
                      <span className="mt-0.5 block text-2xs text-muted">
                        {conversation.message_count} message
                        {conversation.message_count === 1 ? '' : 's'} ·{' '}
                        {formatDateTime(conversation.updated_at)}
                      </span>
                    </button>
                    {confirming ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(conversation.id)
                            setPendingDelete(null)
                          }}
                          className="rounded-sm border border-status-risk/30 px-1.5 py-0.5 text-2xs text-status-risk hover:bg-status-riskSoft"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="rounded-sm px-1 text-2xs text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(conversation.id)}
                        aria-label={`Delete ${conversation.title ?? 'conversation'}`}
                        className="shrink-0 rounded-sm px-1 text-muted opacity-0 transition-opacity hover:text-status-risk group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
