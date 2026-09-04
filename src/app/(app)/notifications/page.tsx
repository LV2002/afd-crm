import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getNotifications } from "@/lib/notifications/get-notifications";
import { createClient } from "@/lib/supabase/server";

import { NotificationList } from "./notification-list";

/**
 * Everything this person has been told.
 *
 * No permission gate, and that is deliberate: these are messages addressed
 * to the signed-in user, and the RLS policy already limits the page to
 * their own. A permission primitive for "read your own mail" would be an
 * enforcement point that enforces nothing (CLAUDE.md § Roles: a primitive
 * exists because there is a real check behind it).
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";

  const supabase = await createClient();
  const rows = await getNotifications(supabase, { unreadOnly, limit: 100 });
  const unreadCount = rows.filter((row) => row.read_at === null).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          What the CRM has told you — new leads, SLA breaches, admissions and payments. Which
          events reach you is set per role in Settings → Notifications.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <FilterLink href="/notifications" label="All" active={!unreadOnly} />
        <FilterLink
          href="/notifications?filter=unread"
          label={unreadCount > 0 ? `Unread (${unreadCount})` : "Unread"}
          active={unreadOnly}
        />
      </div>

      <NotificationList rows={rows} unreadOnly={unreadOnly} />
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-accent px-3 py-1.5 font-medium"
          : "rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent/50"
      }
    >
      {label}
    </Link>
  );
}
