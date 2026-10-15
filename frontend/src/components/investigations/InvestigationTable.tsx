import { formatDate, shortId } from '../../lib/format'
import {
  currentReviewMeta,
  investigationStatusMeta,
} from '../../lib/investigations'
import type { Investigation } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface InvestigationTableProps {
  items: Investigation[]
  onOpen: (investigation: Investigation) => void
}

export function InvestigationTable({ items, onOpen }: InvestigationTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Investigation</th>
            <th className="px-3 py-2 font-semibold">Invoice</th>
            <th className="px-3 py-2 font-semibold">Report</th>
            <th className="px-3 py-2 font-semibold">Review</th>
            <th className="px-3 py-2 font-semibold">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {items.map((investigation) => {
            const status = investigationStatusMeta(investigation.status)
            const review = currentReviewMeta(investigation)
            return (
              <tr
                key={investigation.id}
                tabIndex={0}
                onClick={() => onOpen(investigation)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(investigation)
                  }
                }}
                className="cursor-pointer border-b border-line/70 align-top transition-colors hover:bg-paper"
              >
                <td className="px-3 py-2.5">
                  <StatusPill tone={status.tone} label={status.label} />
                </td>
                <td className="px-3 py-2.5 num text-xs text-ink-soft">
                  {shortId(investigation.id, 12)}
                </td>
                <td className="px-3 py-2.5 num text-xs text-ink-soft">
                  {investigation.invoice_id
                    ? shortId(investigation.invoice_id, 10)
                    : '—'}
                </td>
                <td className="px-3 py-2.5 num text-xs text-ink-soft">
                  {investigation.report_version > 0
                    ? `v${investigation.report_version}`
                    : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {review.label === 'No decision' ? (
                    <span className="num text-xs text-muted">—</span>
                  ) : (
                    <StatusPill tone={review.tone} label={review.label} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {formatDate(investigation.created_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
