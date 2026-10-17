import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { ContextBar } from './ContextBar'
import { NavRail } from './NavRail'

// The document is the scroll container. Reset it on navigation so a route
// change never opens part-way down a previously scrolled page.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function AppShell() {
  const { pathname } = useLocation()
  // The home page is a standalone landing canvas; the workspace rail is only
  // shown once the user is inside a workspace route.
  const showRail = pathname !== '/'

  return (
    <div className="flex min-h-screen">
      <ScrollToTop />
      {showRail ? <NavRail /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar />
        {/* `bg-paper` guarantees the content column always paints, so the page
            background never fails to cover the viewport. */}
        <main className="flex-1 bg-paper">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
