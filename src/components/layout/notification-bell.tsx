import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/lib/notifications/get-notifications";
import { createClient } from "@/lib/supabase/server";

/**
 * The bell in the header, with an unread count.
 *
 * A Server Component doing a head-only count, refreshed whenever the page
 * it sits in re-renders. Deliberately not polling and not subscribed to
 * Realtime: this CRM's notifications are about work that takes minutes to
 * hours — an SLA breach, an admission to bill — so a count that updates on
 * navigation is honest, and a websocket held open on every screen for every
 * counsellor would cost more than it is worth. Realtime is the obvious
 * upgrade if anyone ever wants a live badge.
 */
export async function NotificationBell() {
  const supabase = await createClient();
  const unread = await getUnreadCount(supabase);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {/* Past 9 the exact number stops mattering and starts breaking
                the circle. */}
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
