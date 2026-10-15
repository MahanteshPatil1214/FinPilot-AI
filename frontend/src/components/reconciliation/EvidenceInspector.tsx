import { Link } from 'react-router-dom'

import { useInvoice, useTransaction } from '../../hooks/useReconciliation'
import { ApiError } from '../../services/api'
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatSignedAmount,
  shortId,
} from '../../lib/format'
import { methodLabel, statusMeta } from '../../lib/reconciliation'
import type { ReconciliationMatch } from '../../types/api'
import { FieldRow } from '../ui/FieldRow'
import { ProvenanceList, type ProvenanceEntry } from '../ui/ProvenanceList'
import { StatusPill } from '../ui/StatusPill'

function QueryNote({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean
  error: unknown
  empty: boolean
  emptyText: string
}) {
  if (empty) {
    return <p className="py-4 text-sm text-muted">{emptyText}</p>
  }
  if (loading) {
    return <p className="py-4 text-sm text-muted">Loading…</p>
  }
  if (error) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <p className="py-4 text-sm text-status-risk">
        {notFound ? 'Record not found.' : 'Could not load record.'}
      </p>
    )
  }
  return null
}

function SectionTitle({
  children,
  hint,
}: {
  children: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-serif text-sm text-ink">{children}</h2>
      {hint ? (
        <span className="text-2xs uppercase tracking-label text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function differenceDetail(difference: string | null): {
  state: 'present' | 'none'
  text: string
} {
  if (difference === null) {
    return {
      state: 'none',
      text: 'No amount discrepancy was recorded for this row.',
    }
  }
  const n = Number(difference)
  if (Number.isFinite(n) && n === 0) {
    return { state: 'present', text: 'Amounts agree exactly (difference 0.00).' }
  }
  return {
    state: 'present',
    text: `Recorded amount difference of ${formatSignedAmount(difference)}.`,
  }
}

export function EvidenceInspector({
  match,
}: {
  match: ReconciliationMatch | null
}) {
  const invoice = useInvoice(match?.invoice_id ?? null)
  const transaction = useTransaction(match?.transaction_id ?? null)

  if (!match) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Select a reconciliation row to inspect its deterministic result and
          linked records.
        </p>
      </div>
    )
  }

  const meta = statusMeta(match.match_status)
  const difference = differenceDetail(match.difference_amount)
  const documentId =
    invoice.data?.source_document_id ??
    transaction.data?.source_document_id ??
    null

  const provenance: ProvenanceEntry[] = [
    {
      kind: 'deterministic',
      title: `Rule: ${methodLabel(match.matching_method)}`,
      detail:
        match.explanation ??
        'Outcome produced by the deterministic matching engine.',
      state: 'present',
    },
    {
      kind: 'fact',
      title: 'Stored figures',
      detail:
        'Invoice, transaction and difference values are read back from the database; nothing is recomputed in the interface.',
      state: 'present',
    },
    {
      kind: 'evidence',
      title: 'Retrieved evidence',
      detail:
        'Reconciliation itself retrieves no passage-level evidence. Evidence and page citations are produced in the Investigation workspace.',
      state: 'not-applicable',
    },
    {
      kind: 'ai',
      title: 'AI hypothesis',
      detail:
        'Not applicable — this outcome is rule-based and contains no model-generated claim.',
      state: 'not-applicable',
    },
    {
      kind: 'human',
      title: 'Human decision',
      detail:
        'Matches are not approved or rejected here. Human review applies to investigations.',
      state: 'not-applicable',
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <StatusPill tone={meta.tone} label={meta.label} />
        <p className="mt-2.5 num text-sm text-ink">{shortId(match.id, 18)}</p>
        <p className="mt-1 text-2xs uppercase tracking-label text-muted">
          Recorded {formatDateTime(match.created_at)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-graphite">
          {meta.description}
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <SectionTitle hint="Deterministic">Result</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Rule applied">
              <span className="text-sm">
                {methodLabel(match.matching_method)}
              </span>
            </FieldRow>
            <FieldRow label="Difference">
              <span
                className={
                  difference.state === 'present'
                    ? 'num text-status-partial'
                    : 'num text-muted'
                }
              >
                {match.difference_amount === null
                  ? '—'
                  : formatSignedAmount(match.difference_amount)}
              </span>
            </FieldRow>
            <FieldRow label="Explanation">
              <span className="text-xs leading-relaxed text-graphite">
                {match.explanation ?? 'No explanation recorded.'}
              </span>
            </FieldRow>
          </div>
        </section>

        <section>
          <SectionTitle hint="Database">Linked records</SectionTitle>

          <div className="mt-2 rounded-sm border border-line">
            <p className="border-b border-line bg-paper px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted">
              Invoice
            </p>
            <div className="px-3 py-1">
              {!match.invoice_id ? (
                <QueryNote
                  loading={false}
                  error={null}
                  empty
                  emptyText="No invoice is linked to this row."
                />
              ) : (
                <>
                  <QueryNote
                    loading={invoice.isLoading}
                    error={invoice.error}
                    empty={false}
                    emptyText=""
                  />
                  {invoice.data ? (
                    <>
                      <FieldRow label="Number">
                        {invoice.data.invoice_number ?? '—'}
                      </FieldRow>
                      <FieldRow label="Total">
                        <span className="num">
                          {formatAmount(
                            invoice.data.total_amount,
                            invoice.data.currency,
                          )}
                        </span>
                      </FieldRow>
                      <FieldRow label="Invoice date">
                        {formatDate(invoice.data.invoice_date)}
                      </FieldRow>
                      <FieldRow label="Due date">
                        {formatDate(invoice.data.due_date)}
                      </FieldRow>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-sm border border-line">
            <p className="border-b border-line bg-paper px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted">
              Bank transaction
            </p>
            <div className="px-3 py-1">
              {!match.transaction_id ? (
                <QueryNote
                  loading={false}
                  error={null}
                  empty
                  emptyText="No transaction is linked to this row."
                />
              ) : (
                <>
                  <QueryNote
                    loading={transaction.isLoading}
                    error={transaction.error}
                    empty={false}
                    emptyText=""
                  />
                  {transaction.data ? (
                    <>
                      <FieldRow label="Reference">
                        <span className="num text-xs">
                          {transaction.data.transaction_reference ?? '—'}
                        </span>
                      </FieldRow>
                      <FieldRow label="Counterparty">
                        {transaction.data.counterparty ?? '—'}
                      </FieldRow>
                      <FieldRow label="Amount">
                        <span className="num">
                          {formatAmount(
                            transaction.data.amount,
                            transaction.data.currency,
                          )}
                        </span>
                      </FieldRow>
                      <FieldRow label="Date">
                        {formatDate(transaction.data.transaction_date)}
                      </FieldRow>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <FieldRow label="Source document">
            {documentId ? (
              <Link
                to="/documents"
                className="num text-xs text-accent underline-offset-2 hover:underline"
              >
                {shortId(documentId, 14)}
              </Link>
            ) : (
              <span className="text-xs text-muted">None linked</span>
            )}
          </FieldRow>
        </section>

        <section>
          <SectionTitle>Provenance</SectionTitle>
          <div className="mt-3">
            <ProvenanceList entries={provenance} />
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-graphite">
            AI hypotheses, retrieved evidence and human review decisions live in
            the{' '}
            <Link
              to="/investigations"
              className="text-accent underline-offset-2 hover:underline"
            >
              Investigation workspace
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
