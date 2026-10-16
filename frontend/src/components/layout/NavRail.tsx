import { Link, NavLink } from 'react-router-dom'

import { NAV_GROUPS } from '../../lib/nav'

export function NavRail() {
  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface max-lg:w-14">
      <Link
        to="/"
        aria-label="FinPilot AI home"
        className="block border-b border-line px-5 py-5 transition-colors hover:bg-paper max-lg:px-2 max-lg:py-4"
      >
        <p className="font-serif text-lg leading-tight text-ink max-lg:hidden">
          FinPilot AI
        </p>
        <p className="mt-0.5 text-2xs uppercase tracking-label text-muted max-lg:hidden">
          Financial operations
        </p>
        <p
          className="hidden text-center font-serif text-lg leading-tight text-ink max-lg:block"
          aria-hidden="true"
        >
          FP
        </p>
      </Link>

      <div className="flex-1 overflow-y-auto px-3 py-4 max-lg:px-1.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-5 max-lg:mb-3">
            <p className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-label text-muted max-lg:hidden">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    title={item.label}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 rounded-sm border-l-2 py-1.5 pr-2 text-sm transition-colors max-lg:justify-center max-lg:gap-0 max-lg:px-0 max-lg:pr-0',
                        isActive
                          ? 'border-accent bg-accent-soft font-medium text-accent'
                          : 'border-transparent text-graphite hover:bg-paper hover:text-ink',
                      ].join(' ')
                    }
                  >
                    <span className="w-7 pl-2 text-2xs num text-muted max-lg:w-auto max-lg:pl-0 max-lg:text-xs">
                      {item.index}
                    </span>
                    <span className="max-lg:hidden">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-5 py-3 max-lg:hidden">
        <p className="text-2xs text-muted">
          Deterministic engine · evidence-grounded
        </p>
      </div>
    </nav>
  )
}
