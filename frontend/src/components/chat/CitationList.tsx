import { formatNumber } from '../../lib/format'
import type { ChatCitation } from '../../types/api'
import { SectionTitle } from '../ui/SectionTitle'

function pageLabel(page: number | null): string {
  return page !== null ? `page ${page}` : 'page unknown'
}

// Citations point at the exact document chunk and page an answer was grounded
// in. The bracketed number matches the marker the answer text uses; the file
// name and page stay visible, while the retrieval detail (similarity, chunk)
// lives behind a small disclosure so the list stays quiet.
export function CitationList({ citations }: { citations: ChatCitation[] }) {
  if (citations.length === 0) return null
  return (
    <div>
      <SectionTitle hint="Retrieved evidence">Citations</SectionTitle>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-sm border border-line">
        {citations.map((citation) => (
          <li key={citation.chunk_id} className="bg-surface px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-2xs text-muted">[{citation.index}]</span>
              <span className="text-sm text-ink">{citation.filename}</span>
              <span className="num text-2xs text-graphite">
                {pageLabel(citation.page_number)}
              </span>
              <details className="ml-auto">
                <summary className="cursor-pointer list-none text-2xs text-muted transition-colors hover:text-accent">
                  source
                </summary>
                <span className="num mt-1 block text-2xs text-muted">
                  similarity {formatNumber(citation.score, 3)} · chunk{' '}
                  {citation.chunk_id.slice(0, 8)}
                </span>
              </details>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
