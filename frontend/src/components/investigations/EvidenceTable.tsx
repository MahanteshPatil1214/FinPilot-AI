import { formatNumber, shortId } from '../../lib/format'
import { citationKindMeta, recordTypeLabel } from '../../lib/investigations'
import type { Citation } from '../../types/api'
import { SourceTag } from '../ui/SourceTag'

interface EvidenceTableProps {
  citations: Citation[]
  selectedCitation: number | null
  onSelect: (index: number) => void
}

function sourceLabel(citation: Citation): string {
  if (citation.kind === 'database_record') {
    return recordTypeLabel(citation.record_type)
  }
  return citation.filename ?? 'Document'
}

function locatorLabel(citation: Citation): string {
  if (citation.kind === 'database_record') {
    return citation.record_id ? shortId(citation.record_id, 12) : '—'
  }
  return citation.page_number !== null ? `Page ${citation.page_number}` : '—'
}

export function EvidenceTable({
  citations,
  selectedCitation,
  onSelect,
}: EvidenceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">Ref</th>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Locator</th>
            <th className="px-3 py-2 font-semibold">Kind</th>
            <th className="px-3 py-2 text-right font-semibold">Score</th>
          </tr>
        </thead>
        <tbody>
          {citations.map((citation) => {
            const kind = citationKindMeta(citation.kind)
            const selected = citation.index === selectedCitation
            return (
              <tr
                key={`${citation.index}-${citation.kind}-${citation.chunk_id ?? citation.record_id ?? ''}`}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(citation.index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(citation.index)
                  }
                }}
                className={[
                  'cursor-pointer border-b border-line/70 align-top transition-colors',
                  selected
                    ? 'border-l-2 border-l-accent bg-accent-soft/50'
                    : 'border-l-2 border-l-transparent hover:bg-paper',
                ].join(' ')}
              >
                <td className="px-3 py-2.5 num text-xs font-semibold text-ink">
                  E{citation.index}
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-soft">
                  {sourceLabel(citation)}
                </td>
                <td className="px-3 py-2.5 num text-xs text-graphite">
                  {locatorLabel(citation)}
                </td>
                <td className="px-3 py-2.5">
                  <SourceTag kind={kind.provenance} />
                </td>
                <td className="px-3 py-2.5 text-right num text-xs text-graphite">
                  {citation.score === null
                    ? '—'
                    : formatNumber(citation.score, 3)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
