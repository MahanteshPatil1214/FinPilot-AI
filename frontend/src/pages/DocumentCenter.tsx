import { useState } from 'react'

import { DocumentInspector } from '../components/documents/DocumentInspector'
import { DocumentTable } from '../components/documents/DocumentTable'
import { DocumentUpload } from '../components/documents/DocumentUpload'
import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'
import { useDocuments } from '../hooks/useDocuments'
import type { DocumentSummary } from '../types/api'

const PAGE_SIZE = 50

export function DocumentCenter() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [skip, setSkip] = useState(0)

  const documents = useDocuments({ skip, limit: PAGE_SIZE })

  const items = documents.data?.items ?? []
  const total = documents.data?.total ?? 0

  const rangeStart = total === 0 ? 0 : skip + 1
  const rangeEnd = Math.min(skip + PAGE_SIZE, total)

  const handleUploaded = (documentId: string) => {
    setSkip(0)
    setSelectedId(documentId)
  }

  const select = (document: DocumentSummary) => setSelectedId(document.id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Document center"
          description="Upload invoice PDFs, inspect stored metadata and source pages, and run deterministic indexing that makes a document available as evidence."
        />
        <div className="py-4">
          <DocumentUpload onUploaded={handleUploaded} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 px-6 py-3">
            <span className="text-2xs uppercase tracking-label text-muted">
              {total} document{total === 1 ? '' : 's'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {documents.isLoading ? (
              <div className="p-6">
                <StateMessage kind="loading" title="Loading documents" />
              </div>
            ) : documents.isError ? (
              <div className="p-6">
                <StateMessage
                  kind="error"
                  title="Could not load documents"
                  message={(documents.error as Error).message}
                  onRetry={() => void documents.refetch()}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No documents yet"
                  message="Upload a text-based invoice PDF to populate the document center."
                />
              </div>
            ) : (
              <DocumentTable
                items={items}
                selectedId={selectedId}
                onSelect={select}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line px-6 py-2.5 text-xs text-muted">
            <span className="num">
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                disabled={skip === 0}
                className="rounded-sm border border-line px-2.5 py-1 text-xs transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setSkip(skip + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total}
                className="rounded-sm border border-line px-2.5 py-1 text-xs transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="h-[50vh] w-full shrink-0 border-t border-line bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <DocumentInspector documentId={selectedId} />
        </aside>
      </div>
    </div>
  )
}
