import {
  auditActionMeta,
  auditEntityLabel,
  summarizeAuditDetails,
} from '../../lib/audit'
import { formatDateTime, shortId } from '../../lib/format'
import type { AuditEvent } from '../../types/api'
import { StatusPill } from '../ui/StatusPill'

interface AuditEventTableProps {
  items: AuditEvent[]
}

export function AuditEventTable({ items }: AuditEventTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs uppercase tracking-label text-muted">
            <th className="px-3 py-2 font-semibold">When</th>
            <th className="px-3 py-2 font-semibold">Action</th>
            <th className="px-3 py-2 font-semibold">Entity</th>
            <th className="px-3 py-2 font-semibold">Actor</th>
            <th className="px-3 py-2 font-semibold">Details</th>
          </tr>
        </thead>
        <tbody>
          {items.map((event) => {
            const meta = auditActionMeta(event.action)
            return (
              <tr key={event.id} className="border-b border-line/70 align-top">
                <td className="px-3 py-2.5 num text-xs text-muted">
                  {formatDateTime(event.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={meta.tone} label={meta.label} />
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-soft">
                  <span className="text-ink">
                    {auditEntityLabel(event.entity_type)}
                  </span>
                  <span className="num block text-muted">
                    {shortId(event.entity_id, 12)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-soft">
                  {event.actor_id ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-graphite">
                  {summarizeAuditDetails(event.details)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
