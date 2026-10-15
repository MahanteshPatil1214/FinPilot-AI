import { useLocation } from 'react-router-dom'

import { NAV_GROUPS } from '../../lib/nav'

function currentLabel(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return item.label
      }
    }
  }
  return 'FinPilot AI'
}

export function ContextBar() {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-6 backdrop-blur">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="truncate font-serif text-base text-ink">
          {currentLabel(pathname)}
        </span>
        <span className="text-2xs uppercase tracking-label text-muted">
          FinPilot AI
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-2xs text-muted sm:inline">
          Server-side organization scoping
        </span>
        <span className="rounded-sm border border-status-partial/30 bg-status-partialSoft px-2 py-0.5 text-2xs font-semibold uppercase tracking-label text-status-partial">
          Development
        </span>
      </div>
    </header>
  )
}
