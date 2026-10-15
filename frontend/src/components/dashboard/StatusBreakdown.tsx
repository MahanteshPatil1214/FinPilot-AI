import { Link } from 'react-router-dom'

import type { Tone } from '../../lib/reconciliation'
import { StatusPill } from '../ui/StatusPill'

export interface StatusBreakdownEntry {
  key: string
  label: string
  tone: Tone
  count: number
}

interface StatusBreakdownProps {
  title: string
  total: number
  entries: StatusBreakdownEntry[]
  to: string
  linkLabel: string
  note?: string
}

// A read-only tally of one record type by status. Bars are proportional to the
// largest count in the group (not to the total) so small counts stay visible;
// the exact number is always shown alongside.
export function StatusBreakdown({
  title,
  total,
  entries,
  to,
  linkLabel,
  note,
}: StatusBreakdownProps) {
  const max = Math.max(1, ...entries.map((entry) => entry.count))

  return (
    <section className="flex flex-col rounded-sm border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-sm text-ink">{title}</h2>
        <span className="num text-sm text-graphite" title="Total records">
          {total}
        </span>
      </div>

      <ul className="mt-3 flex-1 space-y-3">
        {entries.map((entry) => (
          <li key={entry.key}>
            <div className="flex items-center justify-between gap-3">
              <StatusPill tone={entry.tone} label={entry.label} />
              <span className="num text-sm text-ink">{entry.count}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/40">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((entry.count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {note ? (
        <p className="mt-3 text-2xs leading-relaxed text-muted">{note}</p>
      ) : null}

      <Link
        to={to}
        className="mt-3 inline-block text-2xs uppercase tracking-label text-accent underline-offset-2 hover:underline"
      >
        {linkLabel} →
      </Link>
    </section>
  )
}
