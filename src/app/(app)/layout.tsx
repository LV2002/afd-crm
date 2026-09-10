import { redirect } from "next/navigation";
import { Suspense } from "react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { DocumentFooter, Letterhead } from "@/components/print/letterhead";
import { navItemsFor } from "@/lib/auth/nav";
import { getCurrentUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand/get-brand";
import { formatDateIST } from "@/lib/format/date";
import { A4_SCREEN_CSS } from "@/lib/print/page-css";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetched together, not one after the other. They do not depend on each
  // other, and the layout runs on every single navigation — a sequential
  // pair here is a round trip added to every click in the application.
  const [user, terms, brand] = await Promise.all([
    getCurrentUser(),
    getTerminologyMap(),
    getBrand(),
  ]);

  if (!user) {
    redirect("/login");
  }

  const navItems = navItemsFor(user, terms);

  return (
    <div className="flex min-h-screen print:block">
      <style dangerouslySetInnerHTML={{ __html: A4_SCREEN_CSS }} />
      <aside className="hidden w-56 shrink-0 border-r bg-background md:flex md:flex-col print:hidden">
        <div className="border-b px-4 py-4">
          <span className="text-sm font-semibold">{brand.name}</span>
        </div>
        <Sidebar items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col print:block">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 print:hidden">
          {/* Below `md` the sidebar is hidden and this is the only way to
              reach another screen. It was missing entirely. */}
          <MobileNav items={navItems} userName={user.fullName} />
          <span className="truncate text-[0.9375rem] font-semibold md:hidden">{brand.name}</span>
          <div className="ml-auto flex items-center gap-1">
            {/* Suspended so its unread count never delays the rest of
                the page. The bell is the least urgent thing on screen and
                it was blocking the header — and therefore everything
                below it — on its own query. */}
            <Suspense fallback={<div className="size-9" />}>
              <NotificationBell />
            </Suspense>
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 print:p-0">
          {/*
            Any screen in the app prints as the institute's stationery,
            not as a bare web page — which is what "make the reports look
            professional" actually needs, and it would be absurd to add
            page by page. Pages that draw their own letterhead (receipts,
            the fee agreement, the profile sheets) suppress this one
            through the stylesheet they already inject; see
            lib/print/page-css.ts.
          */}
          <div className="app-print-letterhead hidden text-black print:block">
            <Letterhead brand={brand} compact />
          </div>

          {children}

          <div className="app-print-letterhead hidden text-black print:block">
            <DocumentFooter
              brand={brand}
              printedOn={formatDateIST(new Date(), "d MMM yyyy, h:mm a")}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
