import { formatDate, formatSignedNumber, shortId } from '../../lib/format'
import { methodLabel, statusMeta } from '../../lib/reconciliation'
import type { ReconciliationMatch } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface ReconciliationTableProps {
  items: ReconciliationMatch[]
  selectedId: string | null
  onSelect: (match: ReconciliationMatch) => void
}

function differenceClass(value: string | null): string {
  if (value === null) return 'text-muted'
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return 'text-graphite'
  return 'text-status-partial'
}

export function ReconciliationTable({
  items,
  selectedId,
  onSelect,
}: ReconciliationTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Invoice</th>
            <th className="px-3 py-2 font-semibold">Transaction</th>
            <th className="px-3 py-2 text-right font-semibold">Difference</th>
            <th className="px-3 py-2 font-semibold">Rule applied</th>
            <th className="px-3 py-2 font-semibold">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {items.map((match) => {
            const meta = statusMeta(match.match_status)
            const selected = match.id === selectedId
            return (
              <tr
                key={match.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(match)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(match)
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
                  <StatusPill tone={meta.tone} label={meta.label} />
                </td>
                <td className="px-3 py-2.5 num text-xs text-ink-soft">
                  {match.invoice_id ? shortId(match.invoice_id, 10) : '—'}
                </td>
                <td className="px-3 py-2.5 num text-xs text-ink-soft">
                  {match.transaction_id
                    ? shortId(match.transaction_id, 10)
                    : '—'}
                </td>
                <td
                  className={`px-3 py-2.5 text-right num ${differenceClass(
                    match.difference_amount,
                  )}`}
                >
                  {match.difference_amount === null
                    ? '—'
                    : formatSignedNumber(match.difference_amount)}
                </td>
                <td className="px-3 py-2.5 text-xs text-graphite">
                  {methodLabel(match.matching_method)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(match.created_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
