import { Link } from 'react-router-dom'

import { formatAmountExact, formatDate, formatDateTime, shortId } from '../../lib/format'
import type { BankTransaction } from '../../types/api'
import { FieldRow } from '../ui/FieldRow'
import { ProvenanceList, type ProvenanceEntry } from '../ui/ProvenanceList'

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

export function TransactionInspector({
  transaction,
}: {
  transaction: BankTransaction | null
}) {
  if (!transaction) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Select a transaction to inspect its stored fields and source document.
        </p>
      </div>
    )
  }

  const provenance: ProvenanceEntry[] = [
    {
      kind: 'fact',
      title: 'Stored record',
      detail:
        'Reference, date, description, counterparty and amount are read back from the database; nothing is recomputed in the interface.',
      state: 'present',
    },
    {
      kind: 'deterministic',
      title: 'Deterministic import',
      detail:
        'The row was produced by the deterministic CSV importer and stored unchanged.',
      state: 'present',
    },
    {
      kind: 'evidence',
      title: 'Retrieved evidence',
      detail:
        'Passage retrieval and page citations are produced in the Investigation workspace.',
      state: 'not-applicable',
    },
    {
      kind: 'ai',
      title: 'AI hypothesis',
      detail:
        'Not applicable — this screen reports the stored import record only.',
      state: 'not-applicable',
    },
    {
      kind: 'human',
      title: 'Human decision',
      detail:
        'Not applicable — transactions are not approved or rejected here.',
      state: 'not-applicable',
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <p className="num text-sm text-ink">
          {transaction.transaction_reference ?? 'No reference'}
        </p>
        <p className="mt-1 text-2xs uppercase tracking-label text-muted">
          {formatDate(transaction.transaction_date)} · imported{' '}
          {formatDateTime(transaction.created_at)}
        </p>
        <p className="mt-2 num text-lg text-ink">
          {formatAmountExact(transaction.amount, transaction.currency)}
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <SectionTitle hint="Database">Transaction</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Reference">
              <span className="num text-xs">
                {transaction.transaction_reference ?? '—'}
              </span>
            </FieldRow>
            <FieldRow label="Date">
              {formatDate(transaction.transaction_date)}
            </FieldRow>
            <FieldRow label="Amount">
              <span className="num">
                {formatAmountExact(transaction.amount, transaction.currency)}
              </span>
            </FieldRow>
            <FieldRow label="Currency">
              {transaction.currency ?? '—'}
            </FieldRow>
            <FieldRow label="Counterparty">
              {transaction.counterparty ?? '—'}
            </FieldRow>
            <FieldRow label="Description">
              <span className="text-xs leading-relaxed text-graphite">
                {transaction.description ?? '—'}
              </span>
            </FieldRow>
            <FieldRow label="Import batch">
              <span className="num text-xs">
                {shortId(transaction.import_batch_id, 14)}
              </span>
            </FieldRow>
            <FieldRow label="Record id">
              <span className="num text-xs">{shortId(transaction.id, 18)}</span>
            </FieldRow>
          </div>
        </section>

        <section>
          <SectionTitle hint="Database">Source document</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Document">
              {transaction.source_document_id ? (
                <Link
                  to="/documents"
                  className="num text-xs text-accent underline-offset-2 hover:underline"
                >
                  {shortId(transaction.source_document_id, 14)}
                </Link>
              ) : (
                <span className="text-xs text-muted">None linked</span>
              )}
            </FieldRow>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-graphite">
            Imported bank transactions have no PDF of their own; a source
            document is linked only when one was associated at import time.
          </p>
        </section>

        <section>
          <SectionTitle>Provenance</SectionTitle>
          <div className="mt-3">
            <ProvenanceList entries={provenance} />
          </div>
        </section>
      </div>
    </div>
  )
}
