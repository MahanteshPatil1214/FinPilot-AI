import { Link } from 'react-router-dom'

import { FieldRow } from '../components/ui/FieldRow'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionTitle } from '../components/ui/SectionTitle'
import { SourceTag } from '../components/ui/SourceTag'
import { StateMessage } from '../components/ui/StateMessage'
import { StatusPill } from '../components/ui/StatusPill'
import { useDashboardSummary } from '../hooks/useDashboard'
import { useHealth } from '../hooks/useHealth'
import { formatDateTime } from '../lib/format'
import type { DashboardSummary } from '../types/api'

interface FootprintItem {
  label: string
  value: number
  to: string
}

function footprint(data: DashboardSummary): FootprintItem[] {
  return [
    { label: 'Documents', value: data.documents_total, to: '/documents' },
    { label: 'Invoices', value: data.invoices_imported, to: '/invoices' },
    {
      label: 'Transactions',
      value: data.transactions_imported,
      to: '/transactions',
    },
    {
      label: 'Reconciliations',
      value: data.reconciliation.total,
      to: '/reconciliation',
    },
    {
      label: 'Investigations',
      value: data.investigations.total,
      to: '/investigations',
    },
    { label: 'Review decisions', value: data.reviews.total, to: '/reviews' },
  ]
}

const LIMITATIONS = [
  'No authentication: this build uses a single fixed development identity. The organization is resolved on the server and is never taken from the browser.',
  'No editable preferences: there are no user or organization settings to change, so this page has nothing to save.',
  'Server-controlled configuration: upload limits, the reconciliation window, chunking, retrieval thresholds and the language model come from backend environment variables.',
  'Secrets stay server-side: API keys and database credentials are held only in the backend environment and are never sent to the browser.',
]

export function SettingsPage() {
  const health = useHealth()
  const summary = useDashboardSummary()
  const data = summary.data

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <PageHeader
        title="Settings"
        description="A read-only view of this workspace and its runtime configuration. This build has no editable preferences and no authentication; API keys and deployment secrets are never displayed."
      />

      <div className="mt-6 space-y-8">
        <section>
          <SectionTitle hint="Runtime">Service status</SectionTitle>
          <div className="mt-3 rounded-sm border border-line bg-surface p-4">
            {health.isLoading ? (
              <p className="text-sm text-muted">Checking the API…</p>
            ) : health.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-status-risk">
                    Could not reach the API.
                  </p>
                  <p className="mt-0.5 text-xs text-graphite">
                    {(health.error as Error).message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void health.refetch()}
                  className="rounded-sm border border-line-strong px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-accent-soft"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    tone={health.data?.status === 'ok' ? 'matched' : 'risk'}
                    label={health.data?.status ?? 'unknown'}
                  />
                  <SourceTag kind="deterministic" />
                  <span className="text-2xs uppercase tracking-label text-muted">
                    {health.data?.service ?? 'Unknown service'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-graphite">
                  Reported live by{' '}
                  <span className="num">GET /api/v1/health</span>. This only
                  confirms the API is reachable; it exposes no configuration.
                </p>
              </>
            )}
          </div>
        </section>

        <section>
          <SectionTitle hint="Development identity">Workspace</SectionTitle>
          <div className="mt-3 rounded-sm border border-line bg-surface p-4">
            {summary.isLoading ? (
              <p className="text-sm text-muted">Loading workspace…</p>
            ) : summary.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-status-risk">
                  Could not load workspace details.
                </p>
                <button
                  type="button"
                  onClick={() => void summary.refetch()}
                  className="rounded-sm border border-line-strong px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-accent-soft"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <FieldRow label="Organization" tag="fact">
                  <span className="num">{data?.organization_id}</span>
                </FieldRow>
                <FieldRow label="Authentication" tag="human">
                  <span className="text-muted">None — development build</span>
                </FieldRow>
                <p className="mt-3 text-xs leading-relaxed text-graphite">
                  Organization id is read from{' '}
                  <span className="num">GET /api/v1/dashboard/summary</span>.
                  There is no login and no user account in this build: a fixed
                  server-side development identity is used, and a client-supplied
                  organization id is never treated as authorization.
                </p>
              </>
            )}
          </div>
        </section>

        <section>
          <SectionTitle hint="Read-only">Data footprint</SectionTitle>
          {summary.isLoading ? (
            <div className="mt-3 rounded-sm border border-line bg-surface p-4">
              <p className="text-sm text-muted">Loading counts…</p>
            </div>
          ) : summary.isError || !data ? (
            <div className="mt-3">
              <StateMessage
                kind="error"
                title="Could not load data footprint"
                message={(summary.error as Error | null)?.message}
                onRetry={() => void summary.refetch()}
              />
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-3">
                {footprint(data).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group bg-surface p-4 transition-colors hover:bg-paper"
                  >
                    <span className="text-2xs uppercase tracking-label text-muted">
                      {item.label}
                    </span>
                    <p className="num mt-1 font-serif text-xl text-ink">
                      {item.value}
                    </p>
                    <span className="mt-1 inline-block text-2xs text-accent opacity-0 transition-opacity group-hover:opacity-100">
                      Open →
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-2xs text-muted">
                Aggregates over persisted rows, as of{' '}
                {formatDateTime(data.generated_at)}.
              </p>
            </>
          )}
        </section>

        <section>
          <SectionTitle hint="Server-side">
            Processing &amp; AI configuration
          </SectionTitle>
          <div className="mt-3 rounded-sm border border-line border-l-2 border-l-accent bg-surface p-4">
            <p className="text-sm leading-relaxed text-graphite">
              Upload limits, the reconciliation date window, document chunking,
              retrieval thresholds and the language model are configured on the
              server through environment variables. They are intentionally not
              exposed to the browser and are not editable here.
            </p>
          </div>
        </section>

        <section>
          <SectionTitle hint="Scope">Limitations</SectionTitle>
          <ul className="mt-3 space-y-2">
            {LIMITATIONS.map((entry) => (
              <li
                key={entry}
                className="flex gap-2 text-sm leading-relaxed text-graphite"
              >
                <span className="text-status-info">•</span>
                <span>{entry}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
