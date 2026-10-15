import { useEffect, useState } from 'react'

import { EvidenceInspector } from '../components/reconciliation/EvidenceInspector'
import { ReconciliationTable } from '../components/reconciliation/ReconciliationTable'
import { SegmentedStatusFilter } from '../components/reconciliation/SegmentedStatusFilter'
import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'
import {
  useReconciliationResults,
  useRunReconciliation,
} from '../hooks/useReconciliation'

const PAGE_SIZE = 50

export function ReconciliationWorkspace() {
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [skip, setSkip] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const results = useReconciliationResults({ status, skip, limit: PAGE_SIZE })
  const run = useRunReconciliation()

  const items = results.data?.items ?? []
  const total = results.data?.total ?? 0
  const selected = items.find((match) => match.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && !items.some((match) => match.id === selectedId)) {
      setSelectedId(null)
    }
  }, [items, selectedId])

  const changeStatus = (next: string | undefined) => {
    setStatus(next)
    setSkip(0)
    setSelectedId(null)
  }

  const rangeStart = total === 0 ? 0 : skip + 1
  const rangeEnd = Math.min(skip + PAGE_SIZE, total)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-6">
        <PageHeader
          title="Reconciliation"
          description="Deterministic invoice ↔ transaction matching. Every row is produced by stored rules, read back from the database — no AI and no recomputation in the interface."
          actions={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => run.mutate(undefined)}
                  disabled={run.isPending}
                  className="rounded-sm border border-accent bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {run.isPending ? 'Running…' : 'Run reconciliation'}
                </button>
              </div>
              {run.isError ? (
                <span className="text-2xs text-status-risk">
                  {(run.error as Error).message}
                </span>
              ) : null}
              {run.data ? (
                <span className="text-2xs text-graphite">
                  {run.data.total_matches} row(s) · window{' '}
                  {run.data.date_window_days}d
                </span>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <SegmentedStatusFilter
            value={status}
            counts={results.data?.counts}
            total={results.data ? Object.values(results.data.counts).reduce((a, b) => a + b, 0) : undefined}
            onChange={changeStatus}
          />
          <span className="text-2xs uppercase tracking-label text-muted">
            {total} result{total === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {results.isLoading ? (
              <div className="p-6">
                <StateMessage kind="loading" title="Loading results" />
              </div>
            ) : results.isError ? (
              <div className="p-6">
                <StateMessage
                  kind="error"
                  title="Could not load reconciliation results"
                  message={(results.error as Error).message}
                  onRetry={() => void results.refetch()}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <StateMessage
                  kind="empty"
                  title="No reconciliation results"
                  message="Import invoices and bank transactions, then run reconciliation to populate this workspace."
                />
              </div>
            ) : (
              <ReconciliationTable
                items={items}
                selectedId={selectedId}
                onSelect={(match) => setSelectedId(match.id)}
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

        <aside className="h-[50vh] w-full shrink-0 border-t border-line bg-surface lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <EvidenceInspector match={selected} />
        </aside>
      </div>
    </div>
  )
}
