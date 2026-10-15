import { formatAmountExact, formatDate } from '../../lib/format'
import { extractionStatusMeta } from '../../lib/invoices'
import type { Invoice } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface InvoiceTableProps {
  items: Invoice[]
  selectedId: string | null
  onSelect: (invoice: Invoice) => void
}

export function InvoiceTable({
  items,
  selectedId,
  onSelect,
}: InvoiceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">Invoice</th>
            <th className="px-3 py-2 font-semibold">Invoice date</th>
            <th className="px-3 py-2 font-semibold">Due date</th>
            <th className="px-3 py-2 font-semibold">Currency</th>
            <th className="px-3 py-2 text-right font-semibold">Total</th>
            <th className="px-3 py-2 font-semibold">Extraction</th>
          </tr>
        </thead>
        <tbody>
          {items.map((invoice) => {
            const meta = extractionStatusMeta(invoice.extraction_status)
            const selected = invoice.id === selectedId
            return (
              <tr
                key={invoice.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(invoice)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(invoice)
                  }
                }}
                className={[
                  'cursor-pointer border-b border-line/70 align-top transition-colors',
                  selected
                    ? 'border-l-2 border-l-accent bg-accent-soft/50'
                    : 'border-l-2 border-l-transparent hover:bg-paper',
                ].join(' ')}
              >
                <td className="px-3 py-2.5">
                  <span
                    className="block max-w-[160px] truncate num text-xs text-ink"
                    title={invoice.invoice_number ?? undefined}
                  >
                    {invoice.invoice_number ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(invoice.invoice_date)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(invoice.due_date)}
                </td>
                <td className="px-3 py-2.5 text-xs text-graphite">
                  {invoice.currency ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right num text-xs text-ink">
                  {formatAmountExact(invoice.total_amount, invoice.currency)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={meta.tone} label={meta.label} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
