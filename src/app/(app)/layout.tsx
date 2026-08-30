import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { navItemsFor } from "@/lib/auth/nav";
import { getCurrentUser } from "@/lib/auth/session";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const terms = await getTerminologyMap();
  const navItems = navItemsFor(user, terms);

  return (
    <div className="flex min-h-screen print:block">
      <aside className="hidden w-56 shrink-0 border-r bg-background md:flex md:flex-col print:hidden">
        <div className="border-b px-4 py-4">
          <span className="text-sm font-semibold">AFD India CRM</span>
        </div>
        <Sidebar items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col print:block">
        <header className="flex h-14 items-center justify-between border-b px-4 print:hidden">
          <span className="text-sm font-medium md:hidden">AFD India CRM</span>
          <div className="ml-auto">
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
