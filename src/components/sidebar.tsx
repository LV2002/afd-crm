'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Sun, Users, KanbanSquare,
  BarChart2, Sparkles, Settings
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  'my-day': Sun,
  leads: Users,
  pipeline: KanbanSquare,
  reports: BarChart2,
  ask: Sparkles,
  settings: Settings,
}

type NavItem = {
  href: string
  label: string
  iconKey: string
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1 p-4">
      {items.map((item) => {
        const Icon = ICON_MAP[item.iconKey] ?? LayoutDashboard
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
