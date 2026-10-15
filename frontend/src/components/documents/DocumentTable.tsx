import { documentTypeLabel, formatFileSize, processingMeta } from '../../lib/documents'
import { formatDate } from '../../lib/format'
import type { DocumentSummary } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface DocumentTableProps {
  items: DocumentSummary[]
  selectedId: string | null
  onSelect: (document: DocumentSummary) => void
}

export function DocumentTable({
  items,
  selectedId,
  onSelect,
}: DocumentTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">File</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 text-right font-semibold">Pages</th>
            <th className="px-3 py-2 text-right font-semibold">Size</th>
            <th className="px-3 py-2 font-semibold">Uploaded</th>
            <th className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((document) => {
            const meta = processingMeta(document.processing_status)
            const selected = document.id === selectedId
            return (
              <tr
                key={document.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(document)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(document)
                  }
                }}
                className={[
                  'cursor-pointer border-b border-line/70 align-top transition-colors',
                  selected
                    ? 'border-l-2 border-l-accent bg-accent-soft/50'
                    : 'border-l-2 border-l-transparent hover:bg-paper',
                ].join(' ')}
              >
                <td className="px-3 py-2.5">
                  <span
                    className="block max-w-[280px] truncate text-sm text-ink"
                    title={document.original_filename}
                  >
                    {document.original_filename}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-graphite">
                  {documentTypeLabel(document.document_type)}
                </td>
                <td className="px-3 py-2.5 text-right num text-xs text-ink-soft">
                  {document.page_count ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right num text-xs text-ink-soft">
                  {formatFileSize(document.file_size)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(document.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={meta.tone} label={meta.label} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
