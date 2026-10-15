import type { ProvenanceKind } from '../../lib/provenance'
import { PROVENANCE } from '../../lib/provenance'

export type ProvenanceState = 'present' | 'none' | 'not-applicable'

export interface ProvenanceEntry {
  kind: ProvenanceKind
  title: string
  detail: string
  state: ProvenanceState
}

const STATE_LABEL: Record<ProvenanceState, string> = {
  present: '',
  none: 'not present',
  'not-applicable': 'not applicable',
}

export function ProvenanceList({ entries }: { entries: ProvenanceEntry[] }) {
  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => (
        <li key={entry.kind} className="flex gap-3">
          <span className="mt-0.5 flex w-24 shrink-0 justify-end">
            <span
              className={`inline-flex items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-label ${PROVENANCE[entry.kind].className}`}
            >
              {PROVENANCE[entry.kind].short}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              {entry.title}
              {STATE_LABEL[entry.state] ? (
                <span className="ml-2 text-2xs uppercase tracking-label text-muted">
                  {STATE_LABEL[entry.state]}
                </span>
              ) : null}
            </p>
            <p className="text-xs leading-relaxed text-graphite">
              {entry.detail}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
