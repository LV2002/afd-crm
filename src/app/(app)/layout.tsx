import { getCurrentUser } from '@/lib/auth/session'
import { navItemsFor } from '@/lib/auth/nav'
import { Sidebar } from '@/components/sidebar'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const navItems = navItemsFor(user).map(({ href, label, iconKey }) => ({
    href,
    label,
    iconKey,
  }))

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r flex flex-col">
        <div className="p-4 border-b">
          <span className="text-sm font-semibold">AFD India CRM</span>
        </div>
        <Sidebar items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
