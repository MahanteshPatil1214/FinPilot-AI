import { Link } from 'react-router-dom'

import {
  MetricCard,
  type MetricCardProps,
} from '../components/dashboard/MetricCard'
import {
  StatusBreakdown,
  type StatusBreakdownEntry,
} from '../components/dashboard/StatusBreakdown'
import { PageHeader } from '../components/ui/PageHeader'
import { StateMessage } from '../components/ui/StateMessage'
import { useDashboardSummary } from '../hooks/useDashboard'
import { formatDateTime } from '../lib/format'
import {
  INVESTIGATION_STATUS_ORDER,
  investigationStatusMeta,
  reviewDecisionMeta,
} from '../lib/investigations'
import { MATCH_STATUS_ORDER, statusMeta } from '../lib/reconciliation'
import type { StatusCounts } from '../types/api'

const REVIEW_DECISION_ORDER = [
  'approved',
  'rejected',
  'needs_more_information',
] as const

const WORKSPACE_LINKS = [
  { to: '/documents', label: 'Document center' },
  { to: '/reconciliation', label: 'Reconciliation' },
  { to: '/investigations', label: 'Investigations' },
  { to: '/reviews', label: 'Report review' },
]

export function DashboardPage() {
  const summary = useDashboardSummary()

  if (summary.isLoading) {
    return (
      <div className="p-6">
        <StateMessage kind="loading" title="Loading dashboard" />
      </div>
    )
  }

  if (summary.isError) {
    return (
      <div className="p-6">
        <StateMessage
          kind="error"
          title="Could not load the dashboard"
          message={(summary.error as Error).message}
          onRetry={() => void summary.refetch()}
        />
      </div>
    )
  }

  const data = summary.data
  if (!data) return null

  const nothingRecorded =
    data.documents_total === 0 &&
    data.invoices_imported === 0 &&
    data.transactions_imported === 0 &&
    data.reconciliation.total === 0 &&
    data.investigations.total === 0 &&
    data.reviews.total === 0

  if (nothingRecorded) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-6">
        <PageHeader
          title="Dashboard"
          description="An operational summary derived from persisted records. Read-only; no metric is invented."
        />
        <div className="mt-6">
          <StateMessage
            kind="empty"
            title="Nothing recorded yet"
            message="No documents, invoices, transactions, reconciliations or investigations exist for this organization yet. Import documents to begin."
          />
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {WORKSPACE_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-sm border border-line px-3 py-1 text-xs text-graphite transition-colors hover:border-line-strong hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const metrics: MetricCardProps[] = [
    {
      label: 'Awaiting review',
      value: data.investigations_awaiting_review,
      hint: 'Completed or needs-review reports eligible for a decision.',
      to: '/reviews',
    },
    {
      label: 'Documents',
      value: data.documents_total,
      hint: `${data.documents_indexed} indexed · ${data.documents_pending_indexing} pending indexing`,
      to: '/documents',
    },
    {
      label: 'Invoices imported',
      value: data.invoices_imported,
      hint: 'Invoices extracted from source documents.',
      to: '/invoices',
    },
    {
      label: 'Transactions imported',
      value: data.transactions_imported,
      hint: 'Bank transactions on record.',
      to: '/transactions',
    },
  ]

  const reconciliationEntries: StatusBreakdownEntry[] = MATCH_STATUS_ORDER.map(
    (status) => {
      const meta = statusMeta(status)
      return {
        key: status,
        label: meta.label,
        tone: meta.tone,
        count: data.reconciliation.counts[status] ?? 0,
      }
    },
  )

  const investigationEntries: StatusBreakdownEntry[] =
    INVESTIGATION_STATUS_ORDER.map((status) => {
      const meta = investigationStatusMeta(status)
      return {
        key: status,
        label: meta.label,
        tone: meta.tone,
        count: data.investigations.counts[status] ?? 0,
      }
    })

  const reviewEntries: StatusBreakdownEntry[] = REVIEW_DECISION_ORDER.map(
    (decision) => {
      const meta = reviewDecisionMeta(decision)
      return {
        key: decision,
        label: meta.label,
        tone: meta.tone,
        count: data.reviews.counts[decision] ?? 0,
      }
    },
  )

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <PageHeader
        title="Dashboard"
        description="An operational summary derived from persisted records. Read-only; no metric is invented."
        actions={
          <span className="num text-2xs uppercase tracking-label text-muted">
            Generated {formatDateTime(data.generated_at)}
          </span>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <StatusBreakdown
          title="Reconciliation"
          total={data.reconciliation.total}
          entries={reconciliationEntries}
          to="/reconciliation"
          linkLabel="Open reconciliation"
          note="Counts of stored reconciliation results by match status."
        />
        <StatusBreakdown
          title="Investigations"
          total={data.investigations.total}
          entries={investigationEntries}
          to="/investigations"
          linkLabel="Open investigations"
          note="Counts of investigations by their current status."
        />
        <StatusBreakdown
          title="Review decisions"
          total={data.reviews.total}
          entries={reviewEntries}
          to="/reviews"
          linkLabel="Open report review"
          note={reviewNote(data.reviews)}
        />
      </div>
    </div>
  )
}

function reviewNote(reviews: StatusCounts): string {
  return reviews.total === 0
    ? 'No review decision has been recorded yet.'
    : 'All recorded decisions, including those superseded by a newer report version.'
}
