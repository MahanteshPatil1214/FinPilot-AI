import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { InvestigationTable } from '../components/investigations/InvestigationTable'
import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'
import { useInvestigations } from '../hooks/useInvestigations'

const PAGE_SIZE = 25

// The backend only accepts one status per list request, and only these two
// statuses are eligible for a human review decision (repository REVIEWABLE_STATUSES).
const REVIEW_FILTERS: { value: string; label: string }[] = [
  { value: 'needs_review', label: 'Awaiting review' },
  { value: 'completed', label: 'Completed' },
]

export function ReviewsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('needs_review')
  const [skip, setSkip] = useState(0)

  const investigations = useInvestigations({ status, skip, limit: PAGE_SIZE })

  const items = investigations.data?.items ?? []
  const total = investigations.data?.total ?? 0

  const rangeStart = total === 0 ? 0 : skip + 1
  const rangeEnd = Math.min(skip + PAGE_SIZE, total)

  const changeStatus = (next: string) => {
    setStatus(next)
    setSkip(0)
  }

  const awaiting = status === 'needs_review'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Report review"
          description="Investigations whose report is awaiting a human decision, plus completed reports that can still be reviewed. Each decision is recorded against a specific report version."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="space-y-1.5">
            <span className="text-2xs uppercase tracking-label text-muted">
              Queue
            </span>
            <div className="flex gap-2">
              {REVIEW_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => changeStatus(filter.value)}
                  className={[
                    'rounded-sm border px-3 py-1 text-xs transition-colors',
                    status === filter.value
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-line text-graphite hover:border-line-strong hover:text-ink',
                  ].join(' ')}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <span className="text-2xs uppercase tracking-label text-muted">
            {awaiting ? 'Awaiting review' : 'Completed'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        <div className="min-h-0 flex-1 overflow-auto">
          {investigations.isLoading ? (
            <div className="p-6">
              <StateMessage kind="loading" title="Loading review queue" />
            </div>
          ) : investigations.isError ? (
            <div className="p-6">
              <StateMessage
                kind="error"
                title="Could not load the review queue"
                message={(investigations.error as Error).message}
                onRetry={() => void investigations.refetch()}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <StateMessage
                kind="empty"
                title={awaiting ? 'Nothing awaiting review' : 'No completed reports'}
                message={
                  awaiting
                    ? 'No investigation currently needs a human decision.'
                    : 'No completed investigation is available to review.'
                }
              />
            </div>
          ) : (
            <InvestigationTable
              items={items}
              onOpen={(investigation) => navigate(`/reviews/${investigation.id}`)}
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
    </div>
  )
}
