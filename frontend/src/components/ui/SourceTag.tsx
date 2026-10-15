import { PROVENANCE, type ProvenanceKind } from '../../lib/provenance'

interface SourceTagProps {
  kind: ProvenanceKind
  className?: string
}

export function SourceTag({ kind, className = '' }: SourceTagProps) {
  const meta = PROVENANCE[kind]
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-label ${meta.className} ${className}`}
    >
      {meta.short}
    </span>
  )
}
