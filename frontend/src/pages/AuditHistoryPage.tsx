import { useState } from 'react'

import { AuditActionFilter } from '../components/audit/AuditActionFilter'
import { AuditEventTable } from '../components/audit/AuditEventTable'
import { PageHeader } from '../components/ui/PageHeader'
import { PaginationFooter } from '../components/ui/PaginationFooter'
import { StateMessage } from '../components/ui/StateMessage'
import { useAuditEvents } from '../hooks/useAuditEvents'
import { auditActionMeta } from '../lib/audit'

const PAGE_SIZE = 25

export function AuditHistoryPage() {
  const [action, setAction] = useState<string | undefined>(undefined)
  const [skip, setSkip] = useState(0)

  const audit = useAuditEvents({ action, skip, limit: PAGE_SIZE })

  const items = audit.data?.items ?? []
  const total = audit.data?.total ?? 0

  const rangeStart = total === 0 ? 0 : skip + 1
  const rangeEnd = Math.min(skip + PAGE_SIZE, total)

  const changeAction = (next: string | undefined) => {
    setAction(next)
    setSkip(0)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Audit history"
          description="Append-only record of reviews and status changes. Each entry records who did what to which entity and when; rows are never edited or deleted."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="space-y-1.5">
            <span className="text-2xs uppercase tracking-label text-muted">
              Action
            </span>
            <AuditActionFilter value={action} onChange={changeAction} />
          </div>
          <span className="text-2xs uppercase tracking-label text-muted">
            {action ? auditActionMeta(action).label : 'All actions'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        <div className="min-h-0 flex-1 overflow-auto">
          {audit.isLoading ? (
            <div className="p-6">
              <StateMessage kind="loading" title="Loading audit history" />
            </div>
          ) : audit.isError ? (
            <div className="p-6">
              <StateMessage
                kind="error"
                title="Could not load audit history"
                message={(audit.error as Error).message}
                onRetry={() => void audit.refetch()}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <StateMessage
                kind="empty"
                title={
                  action ? 'No events with this action' : 'No audit events'
                }
                message={
                  action
                    ? 'No audit event matches the selected action.'
                    : 'Audit events are recorded as investigations are created, run and reviewed.'
                }
              />
            </div>
          ) : (
            <AuditEventTable items={items} />
          )}
        </div>

        <PaginationFooter
          summary={`${rangeStart}–${rangeEnd} of ${total}`}
          hasPrevious={skip > 0}
          hasNext={skip + PAGE_SIZE < total}
          onPrevious={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
          onNext={() => setSkip(skip + PAGE_SIZE)}
        />
      </div>
    </div>
  )
}
