import type { UseQueryResult } from '@tanstack/react-query'

import { formatDateTime } from '../../lib/format'
import { reviewDecisionMeta } from '../../lib/investigations'
import type { Investigation, ReviewHistoryResponse } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'
import { StateMessage } from '../ui/StateMessage'

interface ReviewHistoryPanelProps {
  investigation: Investigation
  reviews: UseQueryResult<ReviewHistoryResponse, Error>
}

export function ReviewHistoryPanel({
  investigation,
  reviews,
}: ReviewHistoryPanelProps) {
  if (reviews.isLoading) {
    return <StateMessage kind="loading" title="Loading review history" />
  }

  if (reviews.isError) {
    return (
      <StateMessage
        kind="error"
        title="Could not load review history"
        message={(reviews.error as Error).message}
        onRetry={() => void reviews.refetch()}
      />
    )
  }

  const items = reviews.data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-line px-4 py-6 text-center">
        <p className="text-sm text-graphite">No reviews recorded.</p>
        <p className="mt-1 text-xs text-muted">
          {investigation.report_version > 0
            ? 'This report has not received a human decision yet.'
            : 'Run the investigation to produce a report before review.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((review) => {
          const meta = reviewDecisionMeta(review.decision)
          return (
            <li
              key={review.id}
              className="rounded-sm border border-line bg-surface p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={meta.tone} label={meta.label} />
                <span className="num text-2xs uppercase tracking-label text-muted">
                  Report v{review.report_version}
                </span>
                {review.is_current ? (
                  <span className="text-2xs uppercase tracking-label text-status-matched">
                    Current
                  </span>
                ) : (
                  <span className="text-2xs uppercase tracking-label text-muted">
                    Superseded
                  </span>
                )}
              </div>
              {review.rationale ? (
                <p className="mt-2 text-sm leading-relaxed text-graphite">
                  {review.rationale}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">No rationale recorded.</p>
              )}
              <p className="mt-2 text-2xs uppercase tracking-label text-muted">
                {review.reviewer_id ?? 'Unknown reviewer'} ·{' '}
                {formatDateTime(review.created_at)}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="text-2xs leading-relaxed text-muted">
        Decisions are append-only. A decision recorded against an older report
        version is kept but marked superseded.
      </p>
    </div>
  )
}
