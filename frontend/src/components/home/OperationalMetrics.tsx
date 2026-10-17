import {
  MetricCard,
  type MetricCardProps,
} from '../dashboard/MetricCard'
import {
  StatusBreakdown,
  type StatusBreakdownEntry,
} from '../dashboard/StatusBreakdown'
import { StateMessage } from '../ui/StateMessage'
import { useDashboardSummary } from '../../hooks/useDashboard'
import { formatDateTime } from '../../lib/format'
import { MATCH_STATUS_ORDER, statusMeta } from '../../lib/reconciliation'

function SectionHeading({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string
  title: string
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="num text-2xs uppercase tracking-label text-accent">
          {eyebrow}
        </span>
        <h2 className="mt-3 font-serif text-2xl leading-snug text-ink">{title}</h2>
      </div>
      {note ? <p className="max-w-sm text-sm leading-relaxed text-muted">{note}</p> : null}
    </div>
  )
}

// Every figure below is read from the dashboard summary endpoint at request
// time. Nothing is sampled or estimated: on failure the section degrades to an
// explicit error state with a retry rather than showing placeholder numbers.
export function OperationalMetrics() {
  const summary = useDashboardSummary()

  if (summary.isLoading) {
    return (
      <div>
        <SectionHeading
          eyebrow="Live"
          title="Operational metrics"
          note="Read from the dashboard summary endpoint."
        />
        <div className="mt-8">
          <StateMessage kind="loading" title="Loading live metrics" />
        </div>
      </div>
    )
  }

  if (summary.isError) {
    return (
      <div>
        <SectionHeading
          eyebrow="Live"
          title="Operational metrics"
          note="Read from the dashboard summary endpoint."
        />
        <div className="mt-8">
          <StateMessage
            kind="error"
            title="Could not load live metrics"
            message={(summary.error as Error).message}
            onRetry={() => void summary.refetch()}
          />
        </div>
      </div>
    )
  }

  const data = summary.data
  if (!data) return null

  const metrics: MetricCardProps[] = [
    {
      label: 'Awaiting review',
      value: data.investigations_awaiting_review,
      hint: 'Reports ready for a human decision.',
      to: '/reviews',
    },
    {
      label: 'Documents indexed',
      value: data.documents_indexed,
      hint: `${data.documents_pending_indexing} pending · ${data.documents_total} total`,
      to: '/documents',
    },
    {
      label: 'Invoices imported',
      value: data.invoices_imported,
      hint: 'Extracted from source documents.',
      to: '/invoices',
    },
    {
      label: 'Reconciliations',
      value: data.reconciliation.total,
      hint: 'Stored reconciliation results.',
      to: '/reconciliation',
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

  const nothingRecorded =
    data.documents_total === 0 &&
    data.invoices_imported === 0 &&
    data.reconciliation.total === 0 &&
    data.investigations.total === 0

  return (
    <div>
      <SectionHeading
        eyebrow="Live"
        title="Operational metrics"
        note={`Derived from persisted records${
          data.generated_at ? ` · generated ${formatDateTime(data.generated_at)}` : ''
        }.`}
      />

      {nothingRecorded ? (
        <p className="mt-6 rounded-sm border border-dashed border-line px-4 py-3 text-sm text-graphite">
          No records exist for this organization yet. Import documents to begin —
          these figures are read live and are never sampled.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <StatusBreakdown
          title="Reconciliation"
          total={data.reconciliation.total}
          entries={reconciliationEntries}
          to="/reconciliation"
          linkLabel="Open reconciliation"
          note="Counts of stored results by match status."
        />
      </div>
    </div>
  )
}
