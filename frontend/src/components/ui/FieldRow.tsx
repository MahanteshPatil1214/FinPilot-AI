import type { ReactNode } from 'react'

import type { ProvenanceKind } from '../../lib/provenance'
import { SourceTag } from './SourceTag'

interface FieldRowProps {
  label: string
  tag?: ProvenanceKind
  children: ReactNode
}

export function FieldRow({ label, tag, children }: FieldRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-2xs uppercase tracking-label text-muted">
          {label}
        </span>
        {tag ? <SourceTag kind={tag} /> : null}
      </div>
      <div className="min-w-0 text-right text-sm text-ink">{children}</div>
    </div>
  )
}
