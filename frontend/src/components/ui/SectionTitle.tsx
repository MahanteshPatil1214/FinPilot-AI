import type { ReactNode } from 'react'

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-serif text-sm text-ink">{children}</h2>
      {hint ? (
        <span className="shrink-0 text-2xs uppercase tracking-label text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
