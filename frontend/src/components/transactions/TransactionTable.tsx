import { formatAmountExact, formatDate } from '../../lib/format'
import type { BankTransaction } from '../../types/api'

interface TransactionTableProps {
  items: BankTransaction[]
  selectedId: string | null
  onSelect: (transaction: BankTransaction) => void
}

export function TransactionTable({
  items,
  selectedId,
  onSelect,
}: TransactionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Reference</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 font-semibold">Counterparty</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((transaction) => {
            const selected = transaction.id === selectedId
            return (
              <tr
                key={transaction.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(transaction)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(transaction)
                  }
                }}
                className={[
                  'cursor-pointer border-b border-line/70 align-top transition-colors',
                  selected
                    ? 'border-l-2 border-l-accent bg-accent-soft/50'
                    : 'border-l-2 border-l-transparent hover:bg-paper',
                ].join(' ')}
              >
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(transaction.transaction_date)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="block max-w-[160px] truncate num text-xs text-ink"
                    title={transaction.transaction_reference ?? undefined}
                  >
                    {transaction.transaction_reference ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="block max-w-[280px] truncate text-xs text-graphite"
                    title={transaction.description ?? undefined}
                  >
                    {transaction.description ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="block max-w-[180px] truncate text-xs text-ink-soft"
                    title={transaction.counterparty ?? undefined}
                  >
                    {transaction.counterparty ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right num text-xs text-ink">
                  {formatAmountExact(transaction.amount, transaction.currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
