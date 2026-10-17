import { useEffect, useRef, useState } from 'react'

import { shortId } from '../../lib/format'
import { useDocuments } from '../../hooks/useDocuments'

interface ComposerProps {
  onSend: (content: string, attachmentIds: string[]) => void
  disabled?: boolean
  isSending?: boolean
  initialValue?: string
  draftKey?: number
  resetKey?: number
}

// The message composer. Enter sends, Shift+Enter inserts a newline. The optional
// attachment picker lets a question target specific uploaded documents; the
// selected ids are sent as `attachment_document_ids` and the backend decides how
// to use them. Nothing here computes financial values or performs an action.
export function Composer({
  onSend,
  disabled = false,
  isSending = false,
  initialValue,
  draftKey,
  resetKey,
}: ComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const documents = useDocuments({ limit: 50 })

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`
  }, [value])

  // Apply a suggested prompt handed down from the page (for example when a
  // capability card is clicked). `draftKey` changes trigger the refill so the
  // same suggestion can be applied more than once.
  useEffect(() => {
    if (draftKey === undefined || !initialValue) return
    setValue(initialValue)
    textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Clear the composer only after a turn has been accepted by the backend. A
  // failed send keeps the text so the user can retry without retyping.
  useEffect(() => {
    if (!resetKey) return
    setValue('')
    setAttachments([])
  }, [resetKey])

  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !disabled && !isSending

  function submit() {
    if (!canSend) return
    onSend(trimmed, attachments)
    setPickerOpen(false)
  }

  function toggleAttachment(id: string) {
    setAttachments((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const items = documents.data?.items ?? []
  const selectedNames = attachments.map((id) => {
    const match = items.find((doc) => doc.id === id)
    return { id, name: match?.original_filename ?? shortId(id) }
  })

  return (
    <div className="border-t border-line bg-surface px-6 py-3">
      <div className="mx-auto max-w-3xl">
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedNames.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 rounded-sm border border-accent/25 bg-accent-soft px-2 py-0.5 text-2xs text-accent"
            >
              {item.name}
              <button
                type="button"
                onClick={() => toggleAttachment(item.id)}
                className="text-muted transition-colors hover:text-status-risk"
                aria-label={`Remove ${item.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="mb-2 max-h-48 overflow-y-auto rounded-sm border border-line bg-paper">
          {documents.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted">Loading documents…</p>
          ) : documents.isError ? (
            <p className="px-3 py-2 text-xs text-status-risk">
              Documents could not be loaded.
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">
              No documents are available to attach.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((doc) => {
                const checked = attachments.includes(doc.id)
                const ready = doc.processing_status === 'completed'
                return (
                  <li key={doc.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-accent-soft">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAttachment(doc.id)}
                        className="accent-accent"
                      />
                      <span className="truncate text-ink">
                        {doc.original_filename}
                      </span>
                      <span className="ml-auto shrink-0 text-2xs uppercase tracking-label text-muted">
                        {ready ? 'ready' : doc.processing_status}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-pressed={pickerOpen}
          className={`shrink-0 rounded-sm border px-2 py-1.5 text-xs transition-colors ${
            pickerOpen
              ? 'border-accent/40 bg-accent-soft text-accent'
              : 'border-line-strong text-graphite hover:bg-accent-soft'
          }`}
        >
          Attach
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder="Ask about a document, an invoice, or a reconciliation result…"
          className="max-h-48 min-h-[2.25rem] flex-1 resize-none rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 rounded-sm border border-accent bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-label text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p className="mt-1.5 text-2xs text-muted">
        Enter to send · Shift+Enter for a new line. Answers cite the records they
        use; the assistant never moves money, changes bank details, or edits
        financial records.
      </p>
      </div>
    </div>
  )
}
