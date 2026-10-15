import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { InvestigationStatusFilter } from '../components/investigations/InvestigationStatusFilter'
import { InvestigationTable } from '../components/investigations/InvestigationTable'
import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'
import { useInvestigations } from '../hooks/useInvestigations'
import { investigationStatusMeta } from '../lib/investigations'

const PAGE_SIZE = 25

export function InvestigationsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [skip, setSkip] = useState(0)

  const investigations = useInvestigations({
    status,
    skip,
    limit: PAGE_SIZE,
  })

  const items = investigations.data?.items ?? []
  const total = investigations.data?.total ?? 0

  const rangeStart = total === 0 ? 0 : skip + 1
  const rangeEnd = Math.min(skip + PAGE_SIZE, total)

  const changeStatus = (next: string | undefined) => {
    setStatus(next)
    setSkip(0)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Investigations"
          description="Financial investigations opened from reconciliation results. Each case file holds a structured report, its evidence citations and any human decisions."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="space-y-1.5">
            <span className="text-2xs uppercase tracking-label text-muted">
              Status
            </span>
            <InvestigationStatusFilter value={status} onChange={changeStatus} />
          </div>
          <span className="text-2xs uppercase tracking-label text-muted">
            {status ? investigationStatusMeta(status).label : 'All statuses'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        <div className="min-h-0 flex-1 overflow-auto">
          {investigations.isLoading ? (
            <div className="p-6">
              <StateMessage kind="loading" title="Loading investigations" />
            </div>
          ) : investigations.isError ? (
            <div className="p-6">
              <StateMessage
                kind="error"
                title="Could not load investigations"
                message={(investigations.error as Error).message}
                onRetry={() => void investigations.refetch()}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <StateMessage
                kind="empty"
                title={
                  status ? 'No investigations with this status' : 'No investigations'
                }
                message={
                  status
                    ? 'No investigation is currently in this state.'
                    : 'Investigations are opened from a reconciliation result.'
                }
              />
            </div>
          ) : (
            <InvestigationTable
              items={items}
              onOpen={(investigation) => navigate(`/investigations/${investigation.id}`)}
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
