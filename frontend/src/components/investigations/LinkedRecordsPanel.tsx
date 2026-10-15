import { Link } from 'react-router-dom'

import {
  useInvoice,
  useReconciliationResult,
  useTransaction,
} from '../../hooks/useReconciliation'
import { formatAmountExact, formatDate, shortId } from '../../lib/format'
import { methodLabel, statusMeta } from '../../lib/reconciliation'
import type { Investigation } from '../../types/api'
import { FieldRow } from '../ui/FieldRow'
import { StatusPill } from '../ui/StatusPill'

function RecordNote({ children }: { children: string }) {
  return <p className="py-2 text-xs text-muted">{children}</p>
}

function WorkspaceLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mt-2 inline-block text-2xs uppercase tracking-label text-accent underline-offset-2 hover:underline"
    >
      {label} →
    </Link>
  )
}

export function LinkedRecordsPanel({
  investigation,
}: {
  investigation: Investigation
}) {
  const invoice = useInvoice(investigation.invoice_id)
  const match = useReconciliationResult(investigation.reconciliation_match_id)
  const transaction = useTransaction(match.data?.transaction_id ?? null)

  const invoiceCurrency = invoice.data?.currency ?? undefined

  return (
    <div className="space-y-5">
      <section>
        <p className="text-2xs uppercase tracking-label text-muted">Invoice</p>
        {!investigation.invoice_id ? (
          <RecordNote>No invoice is linked to this investigation.</RecordNote>
        ) : invoice.isLoading ? (
          <RecordNote>Loading invoice…</RecordNote>
        ) : invoice.isError ? (
          <RecordNote>Could not load the linked invoice.</RecordNote>
        ) : (
          <div className="mt-1">
            <FieldRow label="Invoice number">
              {invoice.data?.invoice_number ?? '—'}
            </FieldRow>
            <FieldRow label="Total">
              <span className="num">
                {formatAmountExact(invoice.data?.total_amount, invoiceCurrency)}
              </span>
            </FieldRow>
            <FieldRow label="Invoice date">
              {formatDate(invoice.data?.invoice_date ?? null)}
            </FieldRow>
          </div>
        )}
        {investigation.invoice_id ? (
          <WorkspaceLink to="/invoices" label="Open invoices" />
        ) : null}
      </section>

      <section>
        <p className="text-2xs uppercase tracking-label text-muted">
          Reconciliation match
        </p>
        {!investigation.reconciliation_match_id ? (
          <RecordNote>
            No reconciliation match is linked to this investigation.
          </RecordNote>
        ) : match.isLoading ? (
          <RecordNote>Loading match…</RecordNote>
        ) : match.isError ? (
          <RecordNote>Could not load the linked match.</RecordNote>
        ) : (
          <div className="mt-1">
            <FieldRow label="Match status">
              <StatusPill
                tone={statusMeta(match.data?.match_status ?? '').tone}
                label={statusMeta(match.data?.match_status ?? '').label}
              />
            </FieldRow>
            <FieldRow label="Rule applied">
              {methodLabel(match.data?.matching_method ?? '')}
            </FieldRow>
            <FieldRow label="Difference">
              <span className="num text-graphite">
                {formatAmountExact(
                  match.data?.difference_amount ?? null,
                  invoiceCurrency,
                )}
              </span>
            </FieldRow>
            <FieldRow label="Match id">
              <span className="num text-xs">
                {shortId(match.data?.id, 18)}
              </span>
            </FieldRow>
          </div>
        )}
        {investigation.reconciliation_match_id ? (
          <WorkspaceLink to="/reconciliation" label="Open reconciliation" />
        ) : null}
      </section>

      <section>
        <p className="text-2xs uppercase tracking-label text-muted">
          Bank transaction
        </p>
        {!match.data?.transaction_id ? (
          <RecordNote>
            No bank transaction is linked through this match.
          </RecordNote>
        ) : transaction.isLoading ? (
          <RecordNote>Loading transaction…</RecordNote>
        ) : transaction.isError ? (
          <RecordNote>Could not load the linked transaction.</RecordNote>
        ) : (
          <div className="mt-1">
            <FieldRow label="Reference">
              {transaction.data?.transaction_reference ?? '—'}
            </FieldRow>
            <FieldRow label="Counterparty">
              {transaction.data?.counterparty ?? '—'}
            </FieldRow>
            <FieldRow label="Amount">
              <span className="num">
                {formatAmountExact(
                  transaction.data?.amount,
                  transaction.data?.currency ?? invoiceCurrency,
                )}
              </span>
            </FieldRow>
            <FieldRow label="Transaction date">
              {formatDate(transaction.data?.transaction_date ?? null)}
            </FieldRow>
          </div>
        )}
        {match.data?.transaction_id ? (
          <WorkspaceLink to="/transactions" label="Open transactions" />
        ) : null}
      </section>
    </div>
  )
}
