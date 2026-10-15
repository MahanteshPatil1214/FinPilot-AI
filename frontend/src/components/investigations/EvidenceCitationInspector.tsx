import { Link } from 'react-router-dom'

import { useDocument } from '../../hooks/useDocuments'
import { formatNumber, shortId } from '../../lib/format'
import {
  citationKindMeta,
  recordTypeLabel,
  recordWorkspace,
} from '../../lib/investigations'
import type { Citation, Finding } from '../../types/api'
import { FieldRow } from '../ui/FieldRow'
import { SourceTag } from '../ui/SourceTag'
import { StateMessage } from '../ui/StateMessage'

interface EvidenceCitationInspectorProps {
  citations: Citation[]
  findings: Finding[]
  selectedCitation: number | null
}

export function EvidenceCitationInspector({
  citations,
  findings,
  selectedCitation,
}: EvidenceCitationInspectorProps) {
  const citation =
    selectedCitation !== null
      ? (citations.find((item) => item.index === selectedCitation) ?? null)
      : null

  const documentId =
    citation && citation.kind === 'document_chunk' ? citation.document_id : null
  const document = useDocument(documentId)

  if (citations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          This report recorded no evidence citations.
        </p>
      </div>
    )
  }

  if (!citation) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Select a citation (E1, E2, …) to inspect the evidence it points to.
        </p>
      </div>
    )
  }

  const kind = citationKindMeta(citation.kind)
  const citedBy = findings.filter((finding) =>
    finding.citations.includes(citation.index),
  )

  const page =
    citation.kind === 'document_chunk'
      ? document.data?.pages.find(
          (item) => item.page_number === citation.page_number,
        )
      : undefined
  const workspace = recordWorkspace(citation.record_type)

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <SourceTag kind={kind.provenance} />
          <span className="num text-2xs uppercase tracking-label text-muted">
            E{citation.index}
          </span>
        </div>
        <p className="mt-2 truncate text-sm text-ink" title={kind.label}>
          {kind.label}
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <div>
            {citation.kind === 'database_record' ? (
              <>
                <FieldRow label="Record type">
                  {recordTypeLabel(citation.record_type)}
                </FieldRow>
                <FieldRow label="Record id">
                  <span className="num text-xs">
                    {citation.record_id ? shortId(citation.record_id, 18) : '—'}
                  </span>
                </FieldRow>
              </>
            ) : (
              <>
                <FieldRow label="Filename">
                  {citation.filename ?? '—'}
                </FieldRow>
                <FieldRow label="Document type">
                  {citation.document_type ?? '—'}
                </FieldRow>
                <FieldRow label="Page">
                  <span className="num">
                    {citation.page_number ?? '—'}
                  </span>
                </FieldRow>
                <FieldRow label="Chunk">
                  <span className="num text-xs">
                    {citation.chunk_id ? shortId(citation.chunk_id, 18) : '—'}
                  </span>
                </FieldRow>
                <FieldRow label="Similarity">
                  {citation.score === null
                    ? '—'
                    : formatNumber(citation.score, 3)}
                </FieldRow>
              </>
            )}
          </div>
        </section>

        {citation.kind === 'document_chunk' ? (
          <section>
            <p className="text-2xs uppercase tracking-label text-muted">
              Stored page text
            </p>
            {!citation.document_id ? (
              <p className="mt-2 text-sm text-muted">
                The source document is no longer available.
              </p>
            ) : document.isLoading ? (
              <div className="mt-2">
                <StateMessage kind="loading" title="Loading source page" />
              </div>
            ) : document.isError ? (
              <div className="mt-2">
                <StateMessage
                  kind="error"
                  title="Could not load source page"
                  message={(document.error as Error).message}
                  onRetry={() => void document.refetch()}
                />
              </div>
            ) : page?.content?.trim() ? (
              <p className="mt-2 whitespace-pre-line rounded-sm border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-graphite">
                {page.content}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No extractable text was stored for this page.
              </p>
            )}
            <p className="mt-2 text-2xs leading-relaxed text-muted">
              The exact retrieved passage is not stored; this shows the full
              page the citation points to.
            </p>
          </section>
        ) : (
          <section>
            <p className="text-xs leading-relaxed text-graphite">
              This citation points to a stored database record. Open the
              workspace that owns it to inspect the underlying values.
            </p>
            {workspace ? (
              <Link
                to={workspace.to}
                className="mt-2 inline-block text-2xs uppercase tracking-label text-accent underline-offset-2 hover:underline"
              >
                {workspace.label} →
              </Link>
            ) : null}
          </section>
        )}

        <section>
          <p className="text-2xs uppercase tracking-label text-muted">
            Cited by
          </p>
          {citedBy.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No finding cites this evidence.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {citedBy.map((finding, position) => (
                <li
                  key={`${finding.kind}-${position}`}
                  className="rounded-sm border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-graphite"
                >
                  <span className="mr-1 text-2xs uppercase tracking-label text-muted">
                    {finding.kind}
                  </span>
                  {finding.statement}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
