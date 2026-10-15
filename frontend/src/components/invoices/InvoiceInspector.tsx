import { Link } from 'react-router-dom'

import { formatAmountExact, formatDate, formatDateTime, shortId } from '../../lib/format'
import { extractionStatusMeta } from '../../lib/invoices'
import type { Invoice } from '../../types/api'
import { FieldRow } from '../ui/FieldRow'
import { ProvenanceList, type ProvenanceEntry } from '../ui/ProvenanceList'
import { StatusPill } from '../ui/StatusPill'

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

export function InvoiceInspector({
  invoice,
}: {
  invoice: Invoice | null
}) {
  if (!invoice) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Select an invoice to inspect its extracted fields and source document.
        </p>
      </div>
    )
  }

  const meta = extractionStatusMeta(invoice.extraction_status)
  const extracted = invoice.extraction_status === 'completed'

  const provenance: ProvenanceEntry[] = [
    {
      kind: 'fact',
      title: 'Stored record',
      detail:
        'Number, dates, currency and total are read back from the database; nothing is recomputed in the interface.',
      state: 'present',
    },
    {
      kind: 'deterministic',
      title: 'Deterministic extraction',
      detail: extracted
        ? 'The stored fields were extracted from the source PDF by the deterministic field parser.'
        : 'Structured fields have not been extracted for this invoice yet.',
      state: extracted ? 'present' : 'none',
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
        'Not applicable — no model-generated claim is attached to this invoice.',
      state: 'not-applicable',
    },
    {
      kind: 'human',
      title: 'Human decision',
      detail:
        'Not applicable — invoices are not approved or rejected here. Human review applies to investigations.',
      state: 'not-applicable',
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <StatusPill tone={meta.tone} label={meta.label} />
        <p
          className="mt-2.5 truncate num text-sm text-ink"
          title={invoice.invoice_number ?? undefined}
        >
          {invoice.invoice_number ?? 'No invoice number'}
        </p>
        <p className="mt-1 text-2xs uppercase tracking-label text-muted">
          Recorded {formatDateTime(invoice.created_at)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-graphite">
          {meta.description}
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <SectionTitle hint="Database">Invoice</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Invoice number">
              <span className="num text-xs">
                {invoice.invoice_number ?? '—'}
              </span>
            </FieldRow>
            <FieldRow label="Invoice date">
              {formatDate(invoice.invoice_date)}
            </FieldRow>
            <FieldRow label="Due date">{formatDate(invoice.due_date)}</FieldRow>
            <FieldRow label="Currency">{invoice.currency ?? '—'}</FieldRow>
            <FieldRow label="Total amount">
              <span className="num">
                {formatAmountExact(invoice.total_amount, invoice.currency)}
              </span>
            </FieldRow>
            <FieldRow label="Extraction status">{meta.label}</FieldRow>
            <FieldRow label="Record id">
              <span className="num text-xs">{shortId(invoice.id, 18)}</span>
            </FieldRow>
          </div>
        </section>

        <section>
          <SectionTitle hint="Database">Source document</SectionTitle>
          <div className="mt-2">
            <FieldRow label="Document">
              {invoice.source_document_id ? (
                <Link
                  to="/documents"
                  className="num text-xs text-accent underline-offset-2 hover:underline"
                >
                  {shortId(invoice.source_document_id, 14)}
                </Link>
              ) : (
                <span className="text-xs text-muted">None linked</span>
              )}
            </FieldRow>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-graphite">
            The source PDF is stored in the Document center, where its pages and
            indexing status can be inspected.
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
