import type { UseQueryResult } from '@tanstack/react-query'

import { formatDateTime } from '../../lib/format'
import { reviewDecisionMeta } from '../../lib/investigations'
import type { Tone } from '../../lib/reconciliation'
import type { ReviewHistoryResponse } from '../../types/api'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'

const DOT_CLASSES: Record<Tone, string> = {
  matched: 'bg-status-matched',
  partial: 'bg-status-partial',
  risk: 'bg-status-risk',
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
}

interface AuditTimelineProps {
  reviews: UseQueryResult<ReviewHistoryResponse, Error>
}

// The audit timeline shows the human decisions the backend records for one
// investigation, read from GET /investigations/{id}/reviews. It is ordered by
// the backend (report_version desc, created_at desc, id desc) and nothing here
// is inferred. It is not a complete system audit log — only review decisions
// are exposed by the API.
export function AuditTimeline({ reviews }: AuditTimelineProps) {
  if (reviews.isLoading) {
    return <StateMessage kind="loading" title="Loading review decisions" />
  }

  if (reviews.isError) {
    return (
      <StateMessage
        kind="error"
        title="Could not load review decisions"
        message={(reviews.error as Error).message}
        onRetry={() => void reviews.refetch()}
      />
    )
  }

  const items = reviews.data?.items ?? []

  if (items.length === 0) {
    return (
      <StateMessage
        kind="empty"
        title="No decisions recorded"
        message="No human decision has been recorded for this investigation yet."
      />
    )
  }

  return (
    <div>
      <ol>
        {items.map((review, position) => {
          const meta = reviewDecisionMeta(review.decision)
          const last = position === items.length - 1
          return (
            <li
              key={review.id}
              className={[
                'relative border-l border-line pl-5',
                last ? 'pb-0' : 'pb-5',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper',
                  DOT_CLASSES[meta.tone],
                ].join(' ')}
              />
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
                {formatDateTime(review.created_at)} · {review.previous_status} →
                {' '}
                {review.resulting_status}
              </p>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-2xs leading-relaxed text-muted">
        Recorded human decisions for this investigation, newest report version
        first. Decisions are append-only — a decision on an older version is kept
        but marked superseded. This is not a complete system audit log.
      </p>
    </div>
  )
}
