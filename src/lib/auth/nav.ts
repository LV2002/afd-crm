export type NavIconKey = 'dashboard' | 'my-day' | 'leads' | 'pipeline' | 'reports' | 'ask' | 'settings'

export type NavItem = {
  href: string
  label: string
  iconKey: NavIconKey
  permission: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', iconKey: 'dashboard', permission: 'lead.read' },
  { href: '/my-day', label: 'My Day', iconKey: 'my-day', permission: 'lead.read' },
  { href: '/leads', label: 'Leads', iconKey: 'leads', permission: 'lead.read' },
  { href: '/pipeline', label: 'Pipeline', iconKey: 'pipeline', permission: 'lead.read' },
  { href: '/reports', label: 'Reports', iconKey: 'reports', permission: 'report.read' },
  { href: '/ask', label: 'Ask AI', iconKey: 'ask', permission: 'ai.query' },
  { href: '/settings', label: 'Settings', iconKey: 'settings', permission: 'settings.manage' },
]

export function navItemsFor(user: { permissions?: Record<string, string> }, terms?: unknown): NavItem[] {
  return NAV_ITEMS.filter(item =>
    user.permissions?.[item.permission]
  )
}
