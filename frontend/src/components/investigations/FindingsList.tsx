import type { Finding } from '../../types/api'
import { SourceTag } from '../ui/SourceTag'

interface FindingsListProps {
  findings: Finding[]
  selectedCitation: number | null
  onSelectCitation: (index: number) => void
}

export function FindingsList({
  findings,
  selectedCitation,
  onSelectCitation,
}: FindingsListProps) {
  return (
    <ul className="mt-3 space-y-3">
      {findings.map((finding, position) => (
        <li
          key={`${finding.kind}-${position}`}
          className="rounded-sm border border-line bg-surface p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed text-ink">
              {finding.statement}
            </p>
            <SourceTag
              kind={finding.kind === 'hypothesis' ? 'ai' : 'fact'}
              className="shrink-0"
            />
          </div>
          {finding.citations.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-2xs uppercase tracking-label text-muted">
                Citations
              </span>
              {finding.citations.map((index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectCitation(index)}
                  className={[
                    'num rounded-sm border px-1.5 py-px text-2xs transition-colors',
                    selectedCitation === index
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-line text-graphite hover:border-line-strong hover:text-ink',
                  ].join(' ')}
                >
                  E{index}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-2xs uppercase tracking-label text-muted">
              No citations
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
