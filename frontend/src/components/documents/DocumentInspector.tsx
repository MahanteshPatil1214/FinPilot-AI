import { useDocument, useDocumentStatus, useIndexDocument } from '../../hooks/useDocuments'
import {
  documentTypeLabel,
  formatFileSize,
  indexingMeta,
  processingMeta,
} from '../../lib/documents'
import { formatDateTime, shortId } from '../../lib/format'
import { ApiError } from '../../services/api'
import { FieldRow } from '../ui/FieldRow'
import { ProvenanceList, type ProvenanceEntry } from '../ui/ProvenanceList'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'

function SectionTitle({
  children,
  hint,
}: {
  children: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-serif text-sm text-ink">{children}</h2>
      {hint ? (
        <span className="text-2xs uppercase tracking-label text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export function DocumentInspector({
  documentId,
}: {
  documentId: string | null
}) {
  const document = useDocument(documentId)
  const status = useDocumentStatus(documentId)
  const index = useIndexDocument()

  if (!documentId) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Select a document to inspect its stored metadata, source pages and
          indexing status.
        </p>
      </div>
    )
  }

  if (document.isLoading) {
    return (
      <div className="p-5">
        <StateMessage kind="loading" title="Loading document" />
      </div>
    )
  }

  if (document.isError) {
    const notFound =
      document.error instanceof ApiError && document.error.status === 404
    return (
      <div className="p-5">
        <StateMessage
          kind="error"
          title={notFound ? 'Document not found' : 'Could not load document'}
          message={(document.error as Error).message}
          onRetry={() => void document.refetch()}
        />
      </div>
    )
  }

  const doc = document.data
  if (!doc) return null

  const processing = processingMeta(doc.processing_status)
  const indexed = status.data?.indexed ?? false
  const indexing = indexingMeta(indexed)
  const indexError = index.isError ? (index.error as Error).message : null

  const provenance: ProvenanceEntry[] = [
    {
      kind: 'fact',
      title: 'Stored metadata',
      detail:
        'Filename, type, size, page count and hash are read back from the database; nothing is recomputed in the interface.',
      state: 'present',
    },
    {
      kind: 'deterministic',
      title: 'Deterministic indexing',
      detail:
        'Chunking and embeddings are computed locally from the stored page text. The chunk count is a stored fact, not an estimate.',
      state: 'present',
    },
    {
      kind: 'evidence',
      title: 'Retrieved evidence',
      detail:
        'Passage retrieval and page citations are produced in the Investigation workspace.',
      state: 'not-applicable',
    },
    {
      kind: 'ai',
      title: 'AI hypothesis',
      detail:
        'Not applicable — this screen reports stored fields and deterministic indexing only.',
      state: 'not-applicable',
    },
    {
      kind: 'human',
      title: 'Human decision',
      detail:
        'Not applicable — documents are not approved or rejected here.',
      state: 'not-applicable',
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={processing.tone} label={processing.label} />
          {status.data ? (
            <StatusPill tone={indexing.tone} label={indexing.label} />
          ) : null}
        </div>
        <p
          className="mt-2.5 truncate text-sm text-ink"
          title={doc.original_filename}
        >
          {doc.original_filename}
        </p>
        <p className="mt-1 text-2xs uppercase tracking-label text-muted">
          Uploaded {formatDateTime(doc.created_at)}
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <SectionTitle hint="Database">File</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Document type">
              {documentTypeLabel(doc.document_type)}
            </FieldRow>
            <FieldRow label="Content type">
              {doc.content_type ?? '—'}
            </FieldRow>
            <FieldRow label="File size">{formatFileSize(doc.file_size)}</FieldRow>
            <FieldRow label="Pages">
              <span className="num">{doc.page_count ?? '—'}</span>
            </FieldRow>
            <FieldRow label="File hash">
              <span className="num text-xs" title={doc.file_hash ?? undefined}>
                {shortId(doc.file_hash, 16)}
              </span>
            </FieldRow>
            <FieldRow label="Document id">
              <span className="num text-xs">{shortId(doc.id, 18)}</span>
            </FieldRow>
          </div>
        </section>

        <section>
          <SectionTitle hint="Deterministic">Indexing</SectionTitle>
          <div className="mt-2">
            {status.isLoading ? (
              <p className="py-4 text-sm text-muted">
                Checking indexing status…
              </p>
            ) : status.isError ? (
              <p className="py-4 text-sm text-status-risk">
                {(status.error as Error).message}
              </p>
            ) : (
              <>
                <FieldRow label="Index status">
                  <StatusPill tone={indexing.tone} label={indexing.label} />
                </FieldRow>
                <FieldRow label="Chunks stored">
                  <span className="num">{status.data?.chunk_count ?? 0}</span>
                </FieldRow>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => index.mutate(doc.id)}
              disabled={index.isPending}
              className="rounded-sm border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {index.isPending
                ? 'Indexing…'
                : indexed
                  ? 'Re-index document'
                  : 'Index document'}
            </button>
            {index.data ? (
              <span className="text-xs text-status-matched">
                Indexed {index.data.chunks_indexed} chunk(s).
              </span>
            ) : null}
          </div>
          {indexError ? (
            <p className="mt-2 text-xs text-status-risk" role="alert">
              {indexError}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-graphite">
            Indexing runs the local embedding model on demand and is separate
            from upload. It is unavailable when the embedding model is not
            installed.
          </p>
        </section>

        <section>
          <SectionTitle hint="Database">Source pages</SectionTitle>
          {doc.pages.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              No page text was stored for this document.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {doc.pages.map((page) => (
                <article
                  key={page.page_number}
                  className="rounded-sm border border-line"
                >
                  <header className="flex items-center justify-between border-b border-line bg-paper px-3 py-1.5">
                    <span className="text-2xs font-semibold uppercase tracking-label text-muted">
                      Page {page.page_number}
                    </span>
                    <span className="num text-2xs text-muted">
                      {page.char_count ?? 0} chars
                    </span>
                  </header>
                  <p className="line-clamp-6 whitespace-pre-line px-3 py-2 text-xs leading-relaxed text-graphite">
                    {page.content?.trim()
                      ? page.content
                      : 'No extractable text on this page.'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Provenance</SectionTitle>
          <div className="mt-3">
            <ProvenanceList entries={provenance} />
          </div>
        </section>
      </div>
    </div>
  )
}
