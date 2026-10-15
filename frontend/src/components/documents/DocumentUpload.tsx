import { useRef, useState, type ChangeEvent } from 'react'

import { useUploadDocument } from '../../hooks/useDocuments'

interface DocumentUploadProps {
  onUploaded?: (documentId: string) => void
}

export function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const upload = useUploadDocument()

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    setLocalError(null)
    upload.reset()
    setFile(event.target.files?.[0] ?? null)
  }

  const submit = () => {
    setLocalError(null)
    upload.reset()
    if (!file) {
      setLocalError('Choose a PDF file to upload.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setLocalError('Only PDF documents are supported.')
      return
    }
    upload.mutate(file, {
      onSuccess: (result) => {
        setFile(null)
        if (inputRef.current) inputRef.current.value = ''
        onUploaded?.(result.document_id)
      },
    })
  }

  const errorMessage =
    localError ?? (upload.isError ? (upload.error as Error).message : null)

  return (
    <section className="rounded-sm border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-sm text-ink">Upload a document</h2>
          <p className="mt-0.5 max-w-md text-xs leading-relaxed text-graphite">
            Text-based invoice PDFs only. Scanned or image-only PDFs are rejected
            because OCR is not implemented.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={pick}
            aria-label="Invoice PDF file"
            className="block w-full max-w-xs text-xs text-graphite file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-paper file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-accent-soft"
          />
          <button
            type="button"
            onClick={submit}
            disabled={upload.isPending || !file}
            className="rounded-sm border border-accent bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-3 text-xs text-status-risk" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {upload.data ? (
        <p className="mt-3 text-xs text-status-matched">
          Stored {upload.data.filename} · {upload.data.page_count} page(s)
          {upload.data.invoice_id ? ' · invoice record created' : ''}.
        </p>
      ) : null}
    </section>
  )
}
