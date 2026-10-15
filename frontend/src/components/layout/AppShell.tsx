import { Outlet } from 'react-router-dom'

import { ContextBar } from './ContextBar'
import { NavRail } from './NavRail'

export function AppShell() {
  return (
    <div className="flex h-full">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
