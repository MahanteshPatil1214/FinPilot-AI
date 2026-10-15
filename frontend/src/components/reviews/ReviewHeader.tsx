import { formatDateTime, shortId } from '../../lib/format'
import {
  currentReviewMeta,
  investigationStatusMeta,
  isReviewable,
} from '../../lib/investigations'
import type { Investigation } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface ReviewHeaderProps {
  investigation: Investigation
  onBack: () => void
}

export function ReviewHeader({ investigation, onBack }: ReviewHeaderProps) {
  const status = investigationStatusMeta(investigation.status)
  const review = currentReviewMeta(investigation)

  return (
    <header className="border-b border-line px-6 py-4">
      <button
        type="button"
        onClick={onBack}
        className="text-2xs uppercase tracking-label text-muted transition-colors hover:text-ink"
      >
        ← Report review
      </button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-serif text-2xl text-ink">Review</h1>
            <span className="num text-2xs uppercase tracking-label text-muted">
              {shortId(investigation.id, 12)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone} label={status.label} />
            <span className="num text-2xs uppercase tracking-label text-muted">
              Report v{investigation.report_version}
            </span>
            <StatusPill tone={review.tone} label={review.label} />
            {isReviewable(investigation.status) ? (
              <span className="text-2xs uppercase tracking-label text-status-info">
                Awaiting decision
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xs uppercase tracking-label text-muted">
            Created {formatDateTime(investigation.created_at)} · Updated{' '}
            {formatDateTime(investigation.updated_at)}
          </p>
        </div>
      </div>
    </header>
  )
}
