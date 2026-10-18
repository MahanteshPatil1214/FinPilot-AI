export interface NavItem {
  to: string
  label: string
  index: string
}

export interface NavGroup {
  heading: string
  items: NavItem[]
}

// The workspace navigation. Indexes mirror the page list in the project
// specification (§12); the home page is the workspace entry point at "00".
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Assistant',
    items: [{ to: '/assistant', label: 'Assistant', index: 'AI' }],
  },
  {
    heading: 'Overview',
    items: [
      { to: '/', label: 'Home', index: '00' },
      { to: '/dashboard', label: 'Dashboard', index: '01' },
    ],
  },
  {
    heading: 'Data',
    items: [
      { to: '/documents', label: 'Document center', index: '02' },
      { to: '/transactions', label: 'Transactions', index: '03' },
      { to: '/invoices', label: 'Invoices', index: '04' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/reconciliation', label: 'Reconciliation', index: '05' },
      { to: '/investigations', label: 'Investigations', index: '06' },
      { to: '/reviews', label: 'Report review', index: '07' },
      { to: '/audit', label: 'Audit history', index: '08' },
    ],
  },
  {
    heading: 'System',
    items: [{ to: '/settings', label: 'Settings', index: '09' }],
  },
]
