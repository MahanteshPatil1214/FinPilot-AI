import { Link } from 'react-router-dom'

import { refKindLabel, uniqueRefs } from '../../lib/chat'
import { statusMeta } from '../../lib/reconciliation'
import type { ChatResultRef } from '../../types/api'

// Clickable pointers to the records an answer is grounded in. The `href` is
// produced by the backend (for example /invoices or /investigations/<id>), so
// the client never has to guess a route. Reconciliation statuses reuse the same
// labels and tones as the reconciliation workspace.
export function ResultRefs({ refs }: { refs: ChatResultRef[] }) {
  const unique = uniqueRefs(refs)
  if (unique.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((ref) => (
        <Link
          key={`${ref.kind}-${ref.href}`}
          to={ref.href}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-2xs text-graphite transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
        >
          <span className="font-semibold uppercase tracking-label text-muted">
            {refKindLabel(ref.kind)}
          </span>
          <span className="text-ink">{ref.label}</span>
          {ref.status ? (
            <span className="text-muted">· {statusMeta(ref.status).label}</span>
          ) : null}
        </Link>
      ))}
    </div>
  )
}
