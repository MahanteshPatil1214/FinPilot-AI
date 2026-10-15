interface PaginationFooterProps {
  summary: string
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
}

const BUTTON_CLASS =
  'rounded-sm border border-line px-2.5 py-1 text-xs transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50'

export function PaginationFooter({
  summary,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: PaginationFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-line px-6 py-2.5 text-xs text-muted">
      <span className="num">{summary}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={BUTTON_CLASS}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className={BUTTON_CLASS}
        >
          Next
        </button>
      </div>
    </div>
  )
}
