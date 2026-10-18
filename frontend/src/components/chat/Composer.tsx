import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { ApiError, indexDocument, uploadDocument } from '../../services/api'
import { shortId } from '../../lib/format'
import { SLASH_COMMANDS } from '../../lib/slashCommands'
import { useDocuments } from '../../hooks/useDocuments'

interface ComposerProps {
  onSend: (content: string, attachmentIds: string[]) => void
  disabled?: boolean
  isSending?: boolean
  initialValue?: string
  draftKey?: number
  resetKey?: number
}

type UploadStatus = 'uploading' | 'indexing' | 'ready' | 'error'

interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  documentId?: string
  error?: string
}

// Mirrors the backend upload limit (MAX_PDF_SIZE_MB in app/core/config.py); the
// backend remains authoritative and re-validates every uploaded file.
const MAX_UPLOAD_MB = 10
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// The message composer. Enter sends, Shift+Enter inserts a newline. A single
// "Attach files" button opens a menu with two flows — uploading new PDF files
// and selecting documents already stored in the workspace — and slash-command
// hints appear only while the user is typing a command. The selected and newly
// uploaded ids are sent as `attachment_document_ids`; the backend decides how
// to use them and re-checks organization scope. Nothing here computes financial
// values or performs an action.
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
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const documents = useDocuments({ limit: 50 })
  const items = documents.data?.items ?? []

  // Open the slash-command menu only while the first token is still a command
  // (starts with "/", no whitespace typed yet).
  const commandToken =
    value.startsWith('/') && !/\s/.test(value) ? value.toLowerCase() : null
  const filteredCommands = useMemo(
    () =>
      commandToken
        ? SLASH_COMMANDS.filter((command) =>
            command.name.toLowerCase().startsWith(commandToken),
          )
        : [],
    [commandToken],
  )
  const commandOpen =
    !disabled && commandToken !== null && filteredCommands.length > 0

  useEffect(() => {
    setHighlighted(0)
  }, [commandToken])

  // Close the attachment menu on Escape (it also closes on a click outside or
  // once an option is chosen).
  useEffect(() => {
    if (!menuOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`
  }, [value])

  // Apply a suggested prompt once per draft key (for example when a capability
  // card is chosen), without clobbering text the user has since typed.
  useEffect(() => {
    if (draftKey === undefined || initialValue === undefined) return
    setValue(initialValue)
    textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Clear the composer only after a turn has been accepted by the backend. A
  // failed send keeps the text and any ready uploads so the user can retry.
  useEffect(() => {
    if (!resetKey) return
    setValue('')
    setAttachments([])
    setUploads([])
  }, [resetKey])

  const trimmed = value.trim()
  const hasPendingUploads = uploads.some(
    (upload) => upload.status === 'uploading' || upload.status === 'indexing',
  )
  const canSend = trimmed.length > 0 && !disabled && !isSending && !hasPendingUploads

  function collectAttachmentIds(): string[] {
    const readyUploadIds = uploads
      .filter((upload) => upload.status === 'ready' && upload.documentId)
      .map((upload) => upload.documentId as string)
    return Array.from(new Set([...attachments, ...readyUploadIds]))
  }

  function submitWith(text: string) {
    const content = text.trim()
    if (!content || disabled || isSending || hasPendingUploads) return
    onSend(content, collectAttachmentIds())
    setPickerOpen(false)
  }

  function submit() {
    if (!canSend) return
    submitWith(value)
  }

  function toggleAttachment(id: string) {
    setAttachments((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  async function processUpload(id: string, file: File) {
    try {
      const uploaded = await uploadDocument(file)
      setUploads((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: 'indexing', documentId: uploaded.document_id }
            : item,
        ),
      )
      await indexDocument(uploaded.document_id)
      setUploads((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'ready' } : item,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: ['documents', 'list'] })
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Upload failed.'
      setUploads((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: 'error', error: message }
            : item,
        ),
      )
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const existing = new Set(
      uploads
        .filter((upload) => upload.status !== 'error')
        .map((upload) => `${upload.file.name}:${upload.file.size}`),
    )
    const additions: UploadItem[] = []
    for (const file of Array.from(fileList)) {
      const key = `${file.name}:${file.size}`
      if (existing.has(key)) continue
      existing.add(key)
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
      if (!isPdf(file)) {
        additions.push({
          id,
          file,
          status: 'error',
          error: 'Only PDF files are supported.',
        })
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        additions.push({
          id,
          file,
          status: 'error',
          error: `File is larger than ${MAX_UPLOAD_MB} MB.`,
        })
        continue
      }
      additions.push({ id, file, status: 'uploading' })
    }
    if (additions.length === 0) return
    setUploads((current) => [...current, ...additions])
    for (const addition of additions) {
      if (addition.status === 'uploading') {
        void processUpload(addition.id, addition.file)
      }
    }
  }

  function removeUpload(id: string) {
    setUploads((current) => current.filter((item) => item.id !== id))
  }

  function retryUpload(item: UploadItem) {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === item.id
          ? { ...upload, status: 'uploading', error: undefined }
          : upload,
      ),
    )
    void processUpload(item.id, item.file)
  }

  function applyCommand(prompt: string) {
    submitWith(prompt)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (commandOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((current) => (current + 1) % filteredCommands.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted(
          (current) =>
            (current - 1 + filteredCommands.length) % filteredCommands.length,
        )
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const command = filteredCommands[highlighted]
        if (command) applyCommand(command.prompt)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setValue('')
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const selectedNames = attachments.map((id) => {
    const match = items.find((doc) => doc.id === id)
    return { id, name: match?.original_filename ?? shortId(id) }
  })

  const uploadLabel: Record<UploadStatus, string> = {
    uploading: 'Uploading…',
    indexing: 'Indexing…',
    ready: 'Ready',
    error: 'Failed',
  }

  return (
    <div className="border-t border-line bg-paper px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {uploads.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Uploaded files">
            {uploads.map((upload) => (
              <li
                key={upload.id}
                title={upload.error}
                className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-0.5 text-2xs"
              >
                <span className="max-w-[12rem] truncate text-graphite">
                  {upload.file.name}
                </span>
                <span className="shrink-0 text-muted">
                  {humanSize(upload.file.size)}
                </span>
                <span
                  className={
                    upload.status === 'error'
                      ? 'shrink-0 text-status-risk'
                      : upload.status === 'ready'
                        ? 'shrink-0 text-status-matched'
                        : 'shrink-0 text-muted'
                  }
                >
                  {uploadLabel[upload.status]}
                </span>
                {upload.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => retryUpload(upload)}
                    className="shrink-0 text-muted underline transition-colors hover:text-accent"
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeUpload(upload.id)}
                  aria-label={`Remove ${upload.file.name}`}
                  className="shrink-0 text-muted transition-colors hover:text-status-risk"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {selectedNames.length > 0 ? (
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
          <div className="mb-2 max-h-48 overflow-y-auto rounded-sm border border-line bg-surface">
            <p className="border-b border-line px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted">
              Attach existing documents
            </p>
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
                {items.map((doc) => (
                  <li key={doc.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-accent-soft">
                      <input
                        type="checkbox"
                        checked={attachments.includes(doc.id)}
                        onChange={() => toggleAttachment(doc.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {doc.original_filename}
                      </span>
                      <span className="shrink-0 text-2xs text-muted">
                        {doc.document_type ?? 'document'}
                      </span>
                      <span
                        className={
                          doc.processing_status === 'completed'
                            ? 'shrink-0 text-2xs text-status-matched'
                            : 'shrink-0 text-2xs text-muted'
                        }
                      >
                        {doc.processing_status}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {commandOpen ? (
          <div
            role="listbox"
            aria-label="Slash commands"
            className="mb-2 overflow-hidden rounded-sm border border-line bg-surface"
          >
            {filteredCommands.map((command, index) => (
              <button
                key={command.name}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => applyCommand(command.prompt)}
                className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-xs transition-colors ${
                  index === highlighted ? 'bg-accent-soft' : 'hover:bg-paper'
                }`}
              >
                <span className="font-semibold text-accent">{command.name}</span>
                <span className="min-w-0 flex-1 truncate text-graphite">
                  {command.description}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-sm border border-line-strong bg-surface px-1.5 py-2 transition-colors focus-within:border-accent">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={disabled}
              aria-label="Attach files"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Attach files"
              className="rounded-sm border border-line-strong px-2.5 py-1.5 text-xs text-graphite transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-60"
            >
              Attach files
            </button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div
                  role="menu"
                  aria-label="Attachment options"
                  className="absolute bottom-full left-0 z-20 mb-2 w-60 overflow-hidden rounded-sm border border-line bg-surface shadow-overlay"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                    className="flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2 text-left transition-colors hover:bg-accent-soft"
                  >
                    <span className="text-xs font-medium text-ink">
                      Upload new PDFs
                    </span>
                    <span className="text-2xs text-muted">
                      Choose one or more PDF files
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setPickerOpen(true)
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent-soft"
                  >
                    <span className="text-xs font-medium text-ink">
                      Attach existing documents
                    </span>
                    <span className="text-2xs text-muted">
                      Pick from your document center
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            aria-label="Message"
            aria-autocomplete="list"
            aria-expanded={commandOpen}
            placeholder="Ask about a document, an invoice, or a reconciliation result… Type / for commands"
            className="max-h-48 min-h-[2.25rem] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:opacity-60"
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <p className="mt-1.5 text-2xs text-muted">
          {hasPendingUploads
            ? 'Wait for uploads to finish indexing before sending.'
            : 'Enter to send · Shift+Enter for a new line · / for commands'}
        </p>
      </div>
    </div>
  )
}
